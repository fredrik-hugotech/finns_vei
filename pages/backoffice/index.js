import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { reportStatusMeta } from '../../lib/reportStatusMeta';

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} d siden`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours} t siden`;
  const mins = Math.floor(diff / 60000);
  return `${Math.max(1, mins)} min siden`;
}

export default function Dashboard() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [cases, setCases] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [boardUrl, setBoardUrl] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    if (router.isReady && typeof router.query.secret === 'string') setSecret(router.query.secret);
  }, [router.isReady, router.query.secret]);

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'x-backoffice-secret': secret }), [secret]);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true); setStatus('');
    try {
      const r = await fetch('/api/backoffice/cases', { headers: headers() });
      if (r.status === 403) { setStatus('Feil passord.'); setCases([]); return; }
      if (!r.ok) throw new Error('Kunne ikke hente saker');
      const d = await r.json();
      setCases(d.cases || []);
      setStatuses(d.statuses || []);
      setBoardUrl(d.trelloBoardUrl || '');
    } catch (e) { setStatus(e.message || 'Noe gikk galt.'); }
    finally { setLoading(false); }
  }, [secret, headers]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, newStatus) => {
    setCases((cs) => cs.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
    try {
      await fetch('/api/backoffice/cases', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'set-status', id, status: newStatus }) });
    } catch (_e) { setStatus('Kunne ikke endre status.'); }
  };

  const sendUpdate = async (id) => {
    const text = (drafts[id] || '').trim();
    if (text.length < 2) return;
    try {
      const r = await fetch('/api/backoffice/cases', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'add-update', id, text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setStatus(d.error || 'Kunne ikke sende oppdatering.'); return; }
      setDrafts((s) => ({ ...s, [id]: '' }));
      setCases((cs) => cs.map((c) => (c.id === id ? { ...c, public_status_note: text } : c)));
      setStatus('Oppdatering publisert.');
    } catch (_e) { setStatus('Kunne ikke sende oppdatering.'); }
  };

  return (
    <>
      <Head><title>Finns Fairway – Dashbord</title><meta name="robots" content="noindex" /></Head>
      <main className="page admin-page">
        <h1>Dashbord</h1>
        <p className="admin-help">Internt for Finns.Fairway. Endre status og publiser offentlige oppdateringer her – Trello er fortsatt best til detaljert oppfølging.</p>

        <label className="admin-field">
          <span>Backoffice-passord</span>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="BACKOFFICE_SECRET" />
        </label>
        <button type="button" className="big-button big-button--secondary" onClick={load} disabled={!secret || loading}>{loading ? 'Laster …' : 'Hent saker'}</button>

        <div className="dash-links">
          {boardUrl && <a className="dash-link dash-link--trello" href={boardUrl} target="_blank" rel="noopener noreferrer">Åpne Trello-board ↗</a>}
          <Link className="dash-link" href={`/backoffice/tetthet?secret=${encodeURIComponent(secret)}`}>Tetthet-kart</Link>
          <Link className="dash-link" href={`/backoffice/konkurranser?secret=${encodeURIComponent(secret)}`}>Konkurranser</Link>
          <Link className="dash-link" href={`/backoffice/seed-spor?secret=${encodeURIComponent(secret)}`}>Generer demo-spor</Link>
        </div>

        {status && <div className="admin-status">{status}</div>}

        <section className="admin-section">
          <h2>Saker ({cases.length})</h2>
          <div className="dash-cases">
            {cases.map((c) => {
              const meta = reportStatusMeta(c.status);
              return (
                <article key={c.id} className="dash-case">
                  <div className="dash-case__top">
                    <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
                    <span className="dash-case__time">{timeAgo(c.created_at)}</span>
                  </div>
                  <strong className="dash-case__title">{c.category}{c.bike_route_type ? ` · ${c.bike_route_type === 'skole' ? 'skolerute' : 'fritidsrute'}` : ''}</strong>
                  {c.description && <p className="dash-case__desc">{c.description}</p>}
                  {c.public_status_note && <p className="dash-case__note">Sist publisert: {c.public_status_note}</p>}

                  <div className="dash-case__row">
                    <select value={c.status} onChange={(e) => changeStatus(c.id, e.target.value)} className="comp-select dash-select">
                      {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {c.trello_card_id
                      ? <a className="dash-link dash-link--sm" href={`https://trello.com/c/${c.trello_card_id}`} target="_blank" rel="noopener noreferrer">Trello ↗</a>
                      : <span className="dash-case__time">Ingen Trello-kort</span>}
                  </div>

                  <div className="dash-case__row">
                    <input
                      className="dash-update-input"
                      placeholder="Skriv offentlig oppdatering …"
                      value={drafts[c.id] || ''}
                      onChange={(e) => setDrafts((s) => ({ ...s, [c.id]: e.target.value }))}
                    />
                    <button type="button" className="big-button big-button--primary dash-send" onClick={() => sendUpdate(c.id)}>Send</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
