// Offline-safe report queue: when POST /api/report fails because the device
// has no connectivity (exactly the situation this app is used in — tunnels,
// fjord roads, mountain passes, forest school routes), we don't want the
// report to just vanish. Image-free reports get parked here (localStorage,
// this browser only) and are automatically resent once the device is back
// online. Mirrors the SSR-safe, best-effort localStorage pattern already used
// by lib/myReports.js and lib/heatmapWeightPrefs.js.
//
// Deliberately NOT queued: reports with images. Multipart file uploads don't
// serialize cleanly to localStorage (File/Blob objects, quota limits), so
// queuing them risks silently losing the photos. See ReportSheet.js for the
// UX around that case.
import { addMyReport } from './myReports';

const STORAGE_KEY = 'finns-vei-offline-report-queue';
const MAX_ENTRIES = 20;

// Fired on window whenever the queue changes (add/remove), so any mounted
// page can keep a "N meldinger venter" indicator in sync without polling.
export const QUEUE_CHANGED_EVENT = 'finns-vei-offline-queue-changed';

function notifyChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  } catch (_e) {
    /* best effort */
  }
}

function readQueue() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function writeQueue(queue) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (_e) {
    /* best effort — e.g. Safari Private Browsing (or a full quota) can throw on write */
  }
}

function makeId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// One id per browser tab (module state is per-JS-context, so each tab gets
// its own). Used to claim queued items below so two tabs of the same device
// coming online together don't both resend the same report.
const TAB_ID = makeId();

// If a claim is older than this, treat it as abandoned (e.g. the claiming
// tab crashed, was closed, or lost network mid-request) so another tab can
// pick the item back up instead of it being stuck forever.
const CLAIM_TTL_MS = 20000;

function isClaimedByOtherTab(entry, now) {
  if (!entry?.claimedBy || entry.claimedBy === TAB_ID) return false;
  const claimedAt = new Date(entry.claimedAt || 0).getTime();
  return Number.isFinite(claimedAt) && now - claimedAt < CLAIM_TTL_MS;
}

// Synchronously attempts to claim a queued item for this tab before sending
// it. `flushInFlight` below only de-dupes concurrent flushes *within* a
// single tab (it's a plain JS module variable) — it does nothing for two
// different tabs of the same device that both come online at the same time
// and both read the same pending item from the shared localStorage queue.
// This closes that gap with a write-then-read-back check against
// localStorage: not a perfect distributed lock, but since localStorage
// writes are last-write-wins and same-origin tabs share the same store, this
// is enough to close the realistic race window around near-simultaneous
// 'online' events. Returns true if this tab now owns the item and should
// send it.
function claimItem(id) {
  try {
    const now = Date.now();
    const current = readQueue();
    const entry = current.find((item) => item?.id === id);
    if (!entry) return false; // already sent/removed, by this tab or another
    if (isClaimedByOtherTab(entry, now)) return false;

    const claimed = current.map((item) => (
      item?.id === id ? { ...item, claimedBy: TAB_ID, claimedAt: new Date(now).toISOString() } : item
    ));
    writeQueue(claimed);

    // Re-read: if another tab raced us and wrote its own claim right after
    // ours, last-write-wins means theirs is now what's stored — that tab
    // owns the item, not us.
    const confirmed = readQueue().find((item) => item?.id === id);
    return confirmed?.claimedBy === TAB_ID;
  } catch (_e) {
    return false;
  }
}

// Releases a claim so a later attempt (by this tab or another) can retry the
// item, e.g. after a failed send.
function releaseClaim(id) {
  try {
    const current = readQueue();
    const next = current.map((item) => {
      if (item?.id !== id) return item;
      const { claimedBy: _claimedBy, claimedAt: _claimedAt, ...rest } = item;
      return rest;
    });
    writeQueue(next);
  } catch (_e) {
    /* best effort */
  }
}

// Adds a JSON-serializable report payload (no images — see module note) to
// the pending queue. Returns the queued item's id, or null if it couldn't be
// queued at all (SSR, or localStorage unavailable).
export function addPendingReport(payload) {
  if (typeof window === 'undefined' || !payload) return null;
  try {
    const id = makeId();
    const current = readQueue();
    const next = [...current, { id, payload, createdAt: new Date().toISOString() }];
    writeQueue(next.slice(-MAX_ENTRIES)); // keep most recent if something has gone very wrong
    notifyChanged();
    return id;
  } catch (_e) {
    return null;
  }
}

export function getPendingReports() {
  if (typeof window === 'undefined') return [];
  try {
    return readQueue();
  } catch (_e) {
    return [];
  }
}

export function getPendingCount() {
  return getPendingReports().length;
}

export function removePendingReport(id) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const current = readQueue();
    const next = current.filter((entry) => entry?.id !== id);
    if (next.length !== current.length) {
      writeQueue(next);
      notifyChanged();
    }
  } catch (_e) {
    /* best effort */
  }
}

// Sends one queued payload to the server as JSON. pages/api/report.js
// (via lib/multipart.js's parseMultipartRequest) already accepts a plain
// application/json body alongside multipart/form-data, so no images/
// FormData reconstruction is needed here — this is exactly the same field
// set ReportSheet.js sends for an image-free report.
export async function sendQueuedReport(payload) {
  const response = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responsePayload.error || 'Kunne ikke sende meldingen');
    error.status = response.status;
    throw error;
  }
  // Auto-sent while the reporter may no longer have the sheet open (e.g. the
  // flush ran on a later page load) — track it the same way an online submit
  // would, so it still shows up with a live status on "Mine meldinger".
  try { addMyReport({ id: responsePayload.id, category: payload.category }); } catch (_e) { /* best effort */ }
  return responsePayload;
}

let flushInFlight = null;

// Attempts to resend queued reports in order (oldest first), removing each
// one as soon as it sends successfully. Stops at the first failure — the
// rest stay queued, in order, for the next attempt (next page load, next
// 'online' event) rather than risk hammering a still-flaky connection or
// reordering reports. Safe to call repeatedly/concurrently: overlapping
// calls *within this tab* share the same in-flight run instead of racing
// each other. Across tabs, each item is also claimed (see claimItem above)
// before sending, so two tabs of the same device that both come online
// around the same time can't both resend the same queued report.
export function flushQueue(sendFn = sendQueuedReport) {
  if (typeof window === 'undefined') return Promise.resolve({ sent: 0, remaining: 0 });
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    let sent = 0;
    const queue = getPendingReports();
    for (const item of queue) {
      if (!item?.id) continue;
      if (!claimItem(item.id)) continue; // owned by another tab (or already sent) - skip, don't double-submit
      try {
        await sendFn(item.payload);
        removePendingReport(item.id);
        sent += 1;
      } catch (_e) {
        releaseClaim(item.id); // let a later attempt (this tab or another) retry it
        break; // leave this item (and everything after it) queued for later
      }
    }
    return { sent, remaining: getPendingReports().length };
  })().finally(() => { flushInFlight = null; });

  return flushInFlight;
}
