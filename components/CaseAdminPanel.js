import { useEffect, useState } from 'react';
import { REPORT_STATUS } from '../lib/config';

const STATUSES = Object.values(REPORT_STATUS);
const SECRET_KEY = 'ff-admin-secret';

// The case card, rebuilt for staff: change status, post a public update (logged
// to Trello), and jump to Street View or the Trello card. Replaces the citizen
// actions (Del sak / Støtt) entirely when an admin is logged in.
export default function CaseAdminPanel({ reportId, currentStatus, lat, lng, onSaved }) {
  const [status, setStatus] = useState(currentStatus || REPORT_STATUS.NEW);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [trelloUrl, setTrelloUrl] = useState(null);

  const secret = () => (typeof window !== 'undefined' ? window.localStorage.getItem(SECRET_KEY) : '');

  useEffect(() => { setStatus(currentStatus || REPORT_STATUS.NEW); }, [currentStatus]);

  useEffect(() => {
    if (!reportId) return;
    fetch(`/api/backoffice/cases?id=${encodeURIComponent(reportId)}`, { headers: { 'x-backoffice-secret': secret() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setTrelloUrl(d.trelloCardUrl); })
      .catch(() => {});
  }, [reportId]);

  const save = async () => {
    setBusy(true); setMsg('');
    const headers = { 'Content-Type': 'application/json', 'x-backoffice-secret': secret() };
    try {
      if (status && status !== currentStatus) {
        const r = await fetch('/api/backoffice/cases', { method: 'POST', headers, body: JSON.stringify({ action: 'set-status', id: reportId, status }) });
        if (!r.ok) throw new Error('status');
      }
      const text = note.trim();
      if (text) {
        const r = await fetch('/api/backoffice/cases', { method: 'POST', headers, body: JSON.stringify({ action: 'add-update', id: reportId, text }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'oppdatering');
      }
      setNote('');
      setMsg('Lagret. Logget i Trello.');
      onSaved?.();
    } catch (e) {
      setMsg(e.message === 'status' ? 'Kunne ikke endre status.' : (e.message || 'Kunne ikke lagre.'));
    } finally {
      setBusy(false);
    }
  };

  const openStreetView = () => {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank', 'noopener');
  };

  const dirty = (status && status !== currentStatus) || note.trim().length > 0;

  return (
    <div className="case-admin">
      <div className="case-admin__head">
        <span className="case-admin__label">Behandle sak</span>
        <div className="case-admin__links">
          {Number.isFinite(Number(lat)) && <button type="button" className="case-admin__link" onClick={openStreetView}>Street View</button>}
          {trelloUrl && <a className="case-admin__link" href={trelloUrl} target="_blank" rel="noopener noreferrer">Trello</a>}
        </div>
      </div>

      <label className="case-admin__field">
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="case-admin__select">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <label className="case-admin__field">
        <span>Offentlig oppdatering</span>
        <textarea
          className="case-admin__note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Skriv hva som skjer med saken. Vises for innbygger og logges i Trello."
          rows={2}
        />
      </label>

      {msg && <p className="case-admin__msg">{msg}</p>}
      <button type="button" className="big-button big-button--primary case-admin__save" onClick={save} disabled={busy || !dirty}>
        {busy ? 'Lagrer …' : 'Lagre'}
      </button>
    </div>
  );
}
