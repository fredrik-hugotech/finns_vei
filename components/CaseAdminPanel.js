import { useEffect, useState } from 'react';
import { REPORT_STATUS } from '../lib/config';

const STATUSES = Object.values(REPORT_STATUS);
const SECRET_KEY = 'ff-admin-secret';

// The case card, rebuilt for staff: change status, post a public update (logged
// to Trello), and jump to Street View or the Trello card. Replaces the citizen
// actions (Del sak / Støtt) entirely when an admin is logged in.
export default function CaseAdminPanel({ reportId, currentStatus, lat, lng, accidents, radiusM = 20, onSaved }) {
  const [status, setStatus] = useState(currentStatus || REPORT_STATUS.NEW);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [trelloUrl, setTrelloUrl] = useState(null);
  const [showAccidents, setShowAccidents] = useState(false);
  const [noteMode, setNoteMode] = useState('public'); // public | internal
  const [timeline, setTimeline] = useState([]);
  const [showTimeline, setShowTimeline] = useState(false);

  const secret = () => (typeof window !== 'undefined' ? window.localStorage.getItem(SECRET_KEY) : '');

  useEffect(() => { setStatus(currentStatus || REPORT_STATUS.NEW); }, [currentStatus]);

  const loadCase = () => {
    if (!reportId) return;
    fetch(`/api/backoffice/cases?id=${encodeURIComponent(reportId)}`, { headers: { 'x-backoffice-secret': secret() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setTrelloUrl(d.trelloCardUrl); setTimeline(Array.isArray(d.timeline) ? d.timeline : []); } })
      .catch(() => {});
  };
  useEffect(loadCase, [reportId]);

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
        const action = noteMode === 'internal' ? 'add-internal' : 'add-update';
        const r = await fetch('/api/backoffice/cases', { method: 'POST', headers, body: JSON.stringify({ action, id: reportId, text }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'oppdatering');
      }
      setNote('');
      setMsg(noteMode === 'internal' ? 'Internt notat lagret.' : 'Lagret og publisert.');
      loadCase();
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
      <span className="case-admin__label">Behandle sak</span>

      <div className="case-admin__actions">
        <a
          className="big-button big-button--secondary case-admin__trello"
          href={trelloUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!trelloUrl}
          onClick={(e) => { if (!trelloUrl) e.preventDefault(); }}
        >
          Åpne i Trello
        </a>
        {Number.isFinite(Number(lat)) && (
          <button type="button" className="big-button big-button--secondary case-admin__sv" onClick={openStreetView}>Street View</button>
        )}
      </div>

      {Array.isArray(accidents) && (
        <div className="case-admin__accidents">
          <button
            type="button"
            className="case-admin__accidents-toggle"
            onClick={() => setShowAccidents((v) => !v)}
            disabled={accidents.length === 0}
            aria-expanded={showAccidents}
          >
            <span>Ulykker innen {radiusM} m</span>
            <span className="case-admin__accidents-count">{accidents.length}{accidents.length > 0 ? (showAccidents ? ' · skjul' : ' · vis') : ''}</span>
          </button>
          {showAccidents && accidents.length > 0 && (
            <ul className="case-admin__accidents-list">
              {accidents.slice(0, 12).map((a, i) => (
                <li key={i}>{[a.year, a.type || 'Ulykke', a.severity].filter(Boolean).join(' · ')}</li>
              ))}
              {accidents.length > 12 && <li className="case-admin__accidents-more">+{accidents.length - 12} flere</li>}
            </ul>
          )}
        </div>
      )}
      {accidents === 'error' && <p className="case-admin__accidents-err">Ulykkesdata utilgjengelig nå.</p>}

      <label className="case-admin__field">
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="case-admin__select">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <div className="case-admin__notetabs">
        <button type="button" className={noteMode === 'public' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setNoteMode('public')}>Offentlig oppdatering</button>
        <button type="button" className={noteMode === 'internal' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setNoteMode('internal')}>Internt notat</button>
      </div>
      <textarea
        className="case-admin__note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={noteMode === 'internal'
          ? 'Lim inn e-post fra kommunen, eller skriv et internt notat. Vises kun for ansatte.'
          : 'Skriv hva som skjer med saken. Vises for innbygger.'}
        rows={noteMode === 'internal' ? 4 : 2}
      />

      {timeline.length > 0 && (
        <div className="case-admin__accidents">
          <button type="button" className="case-admin__accidents-toggle" onClick={() => setShowTimeline((v) => !v)} aria-expanded={showTimeline}>
            <span>Historikk</span>
            <span className="case-admin__accidents-count">{timeline.length}{showTimeline ? ' · skjul' : ' · vis'}</span>
          </button>
          {showTimeline && (
            <ul className="case-admin__timeline">
              {timeline.map((t, i) => (
                <li key={i} className={t.source === 'internal' ? 'case-admin__tl case-admin__tl--internal' : 'case-admin__tl'}>
                  <span className="case-admin__tl-tag">{t.source === 'internal' ? 'Internt' : 'Offentlig'}</span>
                  <span className="case-admin__tl-text">{t.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {msg && <p className="case-admin__msg">{msg}</p>}
      <button type="button" className="big-button big-button--primary case-admin__save" onClick={save} disabled={busy || !dirty}>
        {busy ? 'Lagrer …' : (noteMode === 'internal' && note.trim() ? 'Lagre internt notat' : 'Lagre')}
      </button>
    </div>
  );
}
