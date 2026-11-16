import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FinnAsk, FinnAvatar } from './Finn';

// Finn as a side panel, reachable from every backoffice page: ask about the
// numbers, jump to today's work, send the weekly letter.
export default function FinnPanel({ open, onClose, initialQuestion = '' }) {
  const [weekly, setWeekly] = useState({ busy: false, msg: '' });
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const sendWeekly = async () => {
    if (!window.confirm('Lage ukesbrevet nå og sende det på e-post til staben?')) return;
    setWeekly({ busy: true, msg: 'Finn skriver …' });
    try {
      const r = await fetch('/api/cron/finn-ukesbrev', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      setWeekly({ busy: false, msg: !r.ok || d.ok === false ? (d.reason || d.error || 'Kunne ikke lage ukesbrevet.') : d.sent ? `Sendt til ${d.to}.` : `Skrevet, men ikke sendt: ${d.reason}` });
    } catch (_e) { setWeekly({ busy: false, msg: 'Nettverksfeil.' }); }
  };
  return (
    <div className="finn-panel-layer">
      <div className="finn-panel-backdrop" onClick={onClose} />
      <aside className="finn-panel" aria-label="Finn">
        <div className="finn-panel__head">
          <FinnAvatar size={36} />
          <div>
            <strong>Finn</strong>
            <span>Rådgiver for vei og trafikksikkerhet</span>
          </div>
          <button type="button" className="finn-panel__close" onClick={onClose} aria-label="Lukk Finn">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="finn-panel__links">
          <Link href="/backoffice/saker?ko=idag" onClick={onClose}>Dagens oppsummering</Link>
          <Link href="/backoffice/finn/kommune" onClick={onClose}>Brev og kommunerapport</Link>
          <button type="button" onClick={sendWeekly} disabled={weekly.busy}>{weekly.busy ? 'Skriver …' : 'Send ukesbrev'}</button>
        </div>
        {weekly.msg && <p className="finn-msg">{weekly.msg}</p>}
        <FinnAsk key={initialQuestion} initial={initialQuestion} />
      </aside>
    </div>
  );
}
