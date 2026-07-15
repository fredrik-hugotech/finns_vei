// Offline-safe trip queue: mirrors lib/offlineReportQueue.js for logged bike
// trips. A finished trip has already done all the real work on-device (GPS
// tracking, clipAndSnapCells privacy clipping) by the time we try to POST it
// to /api/bike-trips — if that POST fails because the child crossed into a
// tunnel/fjord dead zone right as they stopped, the computed distance/
// duration/cells must not just be discarded. Unlike reports, a trip payload
// is always plain JSON (no images/File objects), so there's no "can't queue
// this" case to special-case here the way ReportSheet.js has to for photos.
import { addMyTrip } from './myTrips';

const STORAGE_KEY = 'finns-vei-offline-trip-queue';
const MAX_ENTRIES = 20;

// Fired on window whenever the queue changes (add/remove), so any mounted
// page can keep a "N turer venter" indicator in sync without polling. Kept
// as its own event (distinct from the report queue's) so listeners only
// re-render for the queue they actually care about.
export const TRIP_QUEUE_CHANGED_EVENT = 'finns-vei-offline-trip-queue-changed';

function notifyChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(TRIP_QUEUE_CHANGED_EVENT));
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

// Adds a JSON-serializable /api/bike-trips payload to the pending queue.
// Returns the queued item's id, or null if it couldn't be queued at all
// (SSR, or localStorage unavailable).
export function addPendingTrip(payload) {
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

export function getPendingTrips() {
  if (typeof window === 'undefined') return [];
  try {
    return readQueue();
  } catch (_e) {
    return [];
  }
}

export function getPendingTripCount() {
  return getPendingTrips().length;
}

export function removePendingTrip(id) {
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

// Sends one queued trip payload to the server as JSON — the exact same body
// shape pages/index.js's finishTrip() posts for an online trip.
export async function sendQueuedTrip(payload) {
  const response = await fetch('/api/bike-trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responsePayload.error || 'Kunne ikke lagre sykkelturen');
    error.status = response.status;
    throw error;
  }
  // Auto-sent while the rider may no longer be looking at the celebration
  // screen (e.g. the flush ran on a later page load) — record it the same
  // way an online finishTrip() would, so it still shows up on "Mine turer".
  try {
    addMyTrip({
      distanceM: payload?.distanceM,
      mode: payload?.mode,
      routeType: payload?.routeType,
      weather: payload?.weather,
    });
  } catch (_e) { /* best effort */ }
  return responsePayload;
}

let flushInFlight = null;

// Attempts to resend queued trips in order (oldest first), removing each one
// as soon as it sends successfully. Stops at the first failure — the rest
// stay queued, in order, for the next attempt (next page load, next 'online'
// event) rather than risk hammering a still-flaky connection or reordering
// trips. Safe to call repeatedly/concurrently: overlapping calls share the
// same in-flight run instead of racing each other.
export function flushTripQueue(sendFn = sendQueuedTrip) {
  if (typeof window === 'undefined') return Promise.resolve({ sent: 0, remaining: 0 });
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    let sent = 0;
    const queue = getPendingTrips();
    for (const item of queue) {
      try {
        await sendFn(item.payload);
        removePendingTrip(item.id);
        sent += 1;
      } catch (_e) {
        break; // leave this item (and everything after it) queued for later
      }
    }
    return { sent, remaining: getPendingTrips().length };
  })().finally(() => { flushInFlight = null; });

  return flushInFlight;
}
