import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import BackofficeHeader from '../../components/BackofficeHeader';

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} d siden`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours} t siden`;
  return `${Math.max(1, Math.floor(diff / 60000))} min siden`;
}

function ageDays(value) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function ownerShort(owner, speed) {
  const map = { kommune: 'Kommunal', fylke: 'Fylkesvei', stat: 'Riksvei', privat: 'Privat' };
  const o = map[String(owner || '').toLowerCase()];
  const s = speed ? `${speed} km/t` : '';
  return [o, s].filter(Boolean).join(' · ');
}

// Triage view: OPEN cases (not "Fullført") ranked by a heat score computed
// server-side in lib/supabaseRest.js (listHotCases) from support_count and
// concern/facet diversity. Purely read-only — case actions still happen on
// /backoffice/sak/[id].
export default function Hotteste() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/backoffice/hot-cases')
      .then((r) => (r.status === 403 ? Promise.reject(new Error('not-authed')) : (r.ok ? r.json() : Promise.reject(new Error('feil')))))
      .then((d) => setCases(d.cases || []))
      .catch((e) => setError(e.message === 'not-authed' ? 'not-authed' : 'Kunne ikke hente hotteste saker.'));
  }, []);

  const totalSupport = useMemo(() => (cases || []).reduce((n, c) => n + Number(c.support_count || 0), 0), [cases]);

  return (
    <>
      <Head><title>Hotteste saker – Finns Fairway</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <BackofficeHeader title="Hotteste saker" />
      <main className="page admin-list-page">
        <p className="dash2__hint" style={{ margin: 0 }}>
          Åpne saker rangert etter «hetegrad» — innbyggerstøtte og hvor mange ulike bekymringer saken samler. Ikke Trello-rekkefølge.
        </p>

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && cases === null && <p className="admin-list-empty">Laster …</p>}
        {!error && cases && cases.length === 0 && <p className="admin-list-empty">Ingen åpne saker akkurat nå. Fint jobbet.</p>}
        {!error && cases && cases.length > 0 && (
          <p className="sak-count">{cases.length} åpne sak{cases.length === 1 ? '' : 'er'}{totalSupport > 0 ? ` · ${totalSupport} støtter totalt` : ''}</p>
        )}

        <div className="admin-list">
          {(cases || []).map((c, index) => {
            const meta = reportStatusMeta(c.status);
            const loc = ownerShort(c.road_owner, c.speed_limit);
            const days = ageDays(c.created_at);
            const topFacets = (c.facets || []).slice(0, 3);
            return (
              <Link key={c.id} className="admin-list-item" href={`/backoffice/sak/${encodeURIComponent(c.id)}`}>
                <div className="admin-list-item__head">
                  <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>#${index + 1} · ${meta.label}</span>` }} />
                  <span className="admin-list-item__headright">
                    {Number(c.support_count) > 0 && <span className="admin-list-item__support" title="Innbyggerstøtte">♥ {c.support_count}</span>}
                    <span className="admin-list-item__time">{timeAgo(c.created_at)}</span>
                  </span>
                </div>
                <strong className="admin-list-item__title">{c.category}</strong>
                {c.description && <span className="admin-list-item__desc">{c.description}</span>}
                <span className="admin-list-item__foot">
                  {loc && <span className="admin-list-item__loc">{loc}</span>}
                  {topFacets.map((f) => (
                    <span key={f.category} className="admin-list-item__tag">{f.category}{f.count > 1 ? ` · ${f.count}` : ''}</span>
                  ))}
                  {days !== null && <span className="sak-due">{days === 0 ? 'Åpnet i dag' : `${days} d åpen`}</span>}
                  {c.assignee_email && <span className="admin-list-item__assignee">{c.assignee_email.split('@')[0]}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
