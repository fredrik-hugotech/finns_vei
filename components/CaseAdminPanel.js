import { useState } from 'react';
import { REPORT_STATUS } from '../lib/config';

const STATUSES = Object.values(REPORT_STATUS);
const SECRET_KEY = 'ff-admin-secret';

// Card-level admin controls shown inside the case sheet when an admin is logged
// in. Change status and post a public update — both logged to Trello.
export default function CaseAdminPanel({ reportId, currentStatus, onSaved }) {
  const [status, setStatus] = useState(currentStatus || REPORT_STATUS.NEW);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const secret = () => (typeof window !== 'undefined' ? window.localStorage.getItem(SECRET_KEY) : '');

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

  return (
    <div className="case-admin">
      <span className="case-admin__label">Admin</span>
      <label className="case-admin__field">
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="case-admin__select">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <textarea
        className="case-admin__note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Offentlig oppdatering (vises i saken og logges i Trello)"
        rows={2}
      />
      {msg && <p className="case-admin__msg">{msg}</p>}
      <button type="button" className="big-button big-button--primary case-admin__save" onClick={save} disabled={busy}>
        {busy ? 'Lagrer …' : 'Lagre'}
      </button>
    </div>
  );
}
