import { useCallback, useEffect, useRef, useState } from 'react';
import { REPORT_STATUS } from '../lib/config';

// Quick work tools on case rows: a personal star and a status picker, so staff
// can sort through cases without opening each one.
const STATUSES = Object.values(REPORT_STATUS);

export function useStars() {
  const [stars, setStars] = useState(() => new Set());
  // The team's shared work list: id -> [{ by, at }]
  const [team, setTeam] = useState(() => new Map());
  const [me, setMe] = useState('');
  const [ready, setReady] = useState(false);
  // The current stars, read synchronously when toggling (a state updater may
  // run later, which made quick clicks send «remove» instead of «add»).
  const starsRef = useRef(new Set());
  useEffect(() => { starsRef.current = stars; }, [stars]);
  useEffect(() => {
    fetch('/api/backoffice/stjerner').then((r) => (r.ok ? r.json() : { ids: [] })).then((d) => {
      setStars(new Set(d.ids || []));
      const m = new Map();
      for (const t of d.team || []) { if (!m.has(t.id)) m.set(t.id, []); m.get(t.id).push({ by: t.by, at: t.at }); }
      setTeam(m); setMe(d.me || ''); setReady(true);
    }).catch(() => setReady(true));
  }, []);
  const toggle = useCallback(async (id) => {
    const on = !starsRef.current.has(id);
    const next = new Set(starsRef.current);
    if (on) next.add(id); else next.delete(id);
    starsRef.current = next;
    setStars(next);
    setTeam((t) => {
      const n = new Map(t); const list = (n.get(id) || []).filter((x) => x.by !== me);
      if (on) list.unshift({ by: me, at: new Date().toISOString() });
      if (list.length) n.set(id, list); else n.delete(id);
      return n;
    });
    try {
      const r = await fetch('/api/backoffice/stjerner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, on }) });
      if (!r.ok) throw new Error('fail');
    } catch (_e) {
      const undo = new Set(starsRef.current);
      if (on) undo.delete(id); else undo.add(id);
      starsRef.current = undo;
      setStars(undo);
    }
  }, [me]);
  return { stars, team, toggle, ready };
}

// The queue a case was opened from, so «Forrige/Neste» on the case walks
// through that queue (kept for this browser tab only).
export function rememberQueue(label, ids) {
  try { window.sessionStorage.setItem('ff-queue', JSON.stringify({ label, ids: ids.slice(0, 3000) })); } catch (_e) { /* ignore */ }
}
export function rememberedQueue() {
  try { return JSON.parse(window.sessionStorage.getItem('ff-queue') || 'null'); } catch (_e) { return null; }
}

export async function setCaseStatus(id, status) {
  const r = await fetch('/api/backoffice/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-status', id, status }) });
  if (!r.ok) throw new Error('Kunne ikke endre status');
}

export function StarButton({ on, onToggle }) {
  return (
    <button type="button" className={on ? 'cq-star cq-star--on' : 'cq-star'} aria-pressed={on} aria-label={on ? 'Fjern stjerne' : 'Stjernemerk'} title={on ? 'Fjern stjerne' : 'Stjernemerk'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
    </button>
  );
}

export function StatusPicker({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  return (
    <select className={`cq-status cq-status--${STATUSES.indexOf(value)}`} value={value || STATUSES[0]} disabled={busy} aria-label="Endre status"
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => { const v = e.target.value; setBusy(true); try { await onChange(v); } finally { setBusy(false); } }}>
      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

// Share a case: the phone's own share sheet where available, otherwise copy
// the link. Default is the staff link (colleagues log in to see it).
export async function shareCaseLink({ id, title = 'Sak i Finnsvei', publicLink = false }) {
  const url = `${window.location.origin}${publicLink ? '/sak/' : '/backoffice/sak/'}${encodeURIComponent(id)}`;
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, url }); return 'delt'; } catch (e) { if (e?.name === 'AbortError') return ''; }
  }
  try { await navigator.clipboard.writeText(url); return 'kopiert'; } catch (_e) {
    window.prompt('Kopier lenken:', url);
    return '';
  }
}

export function ShareButton({ id, title, publicLink = false, label = '' }) {
  const [done, setDone] = useState('');
  const click = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = await shareCaseLink({ id, title, publicLink });
    if (r === 'kopiert') { setDone('Kopiert'); setTimeout(() => setDone(''), 1800); }
  };
  return (
    <button type="button" className={label ? 'cq-share cq-share--label' : 'cq-share'} onClick={click} aria-label={publicLink ? 'Del offentlig lenke' : 'Del lenke til saken'} title={publicLink ? 'Del offentlig lenke' : 'Del lenke til saken med kollega'}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {(label || done) && <span>{done || label}</span>}
    </button>
  );
}
