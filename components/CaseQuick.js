import { useCallback, useEffect, useState } from 'react';
import { REPORT_STATUS } from '../lib/config';

// Quick work tools on case rows: a personal star and a status picker, so staff
// can sort through cases without opening each one.
const STATUSES = Object.values(REPORT_STATUS);

export function useStars() {
  const [stars, setStars] = useState(() => new Set());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch('/api/backoffice/stjerner').then((r) => (r.ok ? r.json() : { ids: [] })).then((d) => { setStars(new Set(d.ids || [])); setReady(true); }).catch(() => setReady(true));
  }, []);
  const toggle = useCallback(async (id) => {
    let on = false;
    setStars((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else { n.add(id); on = true; } return n; });
    try {
      const r = await fetch('/api/backoffice/stjerner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, on }) });
      if (!r.ok) throw new Error('fail');
    } catch (_e) {
      setStars((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });
    }
  }, []);
  return { stars, toggle, ready };
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
