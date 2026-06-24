import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { reportStatusMeta } from '../../lib/reportStatusMeta';

const SECRET_KEY = 'ff-admin-secret';

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} d siden`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours} t siden`;
  return `${Math.max(1, Math.floor(diff / 60000))} min siden`;
}

export default function Liste() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const secret = window.localStorage.getItem(SECRET_KEY);
    if (!secret) { setError('not-authed'); return; }
    fetch('/api/backoffice/cases', { headers: { 'x-backoffice-secret': secret } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('feil'))))
      .then((d) => setCases(d.cases || []))
      .catch(() => setError('Kunne ikke hente saker.'));
  }, []);

  return (
    <>
      <Head><title>Finns Fairway – Saksliste</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <main className="page admin-list-page">
        <div className="admin-list-top">
          <Link className="admin-back-link" href="/backoffice">‹ Meny</Link>
          <h1>Saker</h1>
        </div>

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && cases === null && <p className="admin-list-empty">Laster …</p>}

        <div className="admin-list">
          {(cases || []).map((c) => {
            const meta = reportStatusMeta(c.status);
            return (
              <Link key={c.id} className="admin-list-item" href={`/?sak=${encodeURIComponent(c.id)}`}>
                <div className="admin-list-item__head">
                  <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
                  <span className="admin-list-item__time">{timeAgo(c.created_at)}</span>
                </div>
                <strong className="admin-list-item__title">{c.category}</strong>
                {c.description && <span className="admin-list-item__desc">{c.description}</span>}
                <span className="admin-list-item__open">Vis på kart ›</span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
