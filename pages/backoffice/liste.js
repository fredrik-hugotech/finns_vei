import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { REPORT_STATUS } from '../../lib/config';
import BackofficeHeader from '../../components/BackofficeHeader';

const STATUSES = [REPORT_STATUS.NEW, REPORT_STATUS.REGISTERED, REPORT_STATUS.STARTED, REPORT_STATUS.DONE];

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} d siden`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours} t siden`;
  return `${Math.max(1, Math.floor(diff / 60000))} min siden`;
}
function ownerShort(owner, speed) {
  const map = { kommune: 'Kommunal', fylke: 'Fylkesvei', stat: 'Riksvei', privat: 'Privat' };
  const o = map[String(owner || '').toLowerCase()];
  const s = speed ? `${speed} km/t` : '';
  return [o, s].filter(Boolean).join(' · ');
}

export default function Liste() {
  const router = useRouter();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const active = typeof router.query.status === 'string' && STATUSES.includes(router.query.status) ? router.query.status : '';

  useEffect(() => {
    fetch('/api/backoffice/cases')
      .then((r) => (r.status === 403 ? Promise.reject(new Error('not-authed')) : (r.ok ? r.json() : Promise.reject(new Error('feil')))))
      .then((d) => setCases(d.cases || []))
      .catch((e) => setError(e.message === 'not-authed' ? 'not-authed' : 'Kunne ikke hente saker.'));
  }, []);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (cases || [])
      .filter((c) => !active || c.status === active)
      .filter((c) => !query || `${c.category} ${c.description || ''} ${ownerShort(c.road_owner, c.speed_limit)}`.toLowerCase().includes(query));
  }, [cases, active, q]);

  return (
    <>
      <Head><title>Saker – Finns Fairway</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <BackofficeHeader title="Saker" />
      <main className="page admin-list-page">
        <input className="sak-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i saker …" aria-label="Søk" />

        <div className="liste-filters">
          <Link href="/backoffice/liste" className={active ? 'liste-filter' : 'liste-filter liste-filter--on'}>Alle</Link>
          {STATUSES.map((s) => (
            <Link key={s} href={`/backoffice/liste?status=${encodeURIComponent(s)}`} className={active === s ? 'liste-filter liste-filter--on' : 'liste-filter'}>{s}</Link>
          ))}
        </div>

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && cases === null && <p className="admin-list-empty">Laster …</p>}
        {!error && cases && shown.length === 0 && <p className="admin-list-empty">Ingen saker her.</p>}
        {!error && cases && shown.length > 0 && <p className="sak-count">{shown.length} sak{shown.length === 1 ? '' : 'er'}</p>}

        <div className="admin-list">
          {shown.map((c) => {
            const meta = reportStatusMeta(c.status);
            const loc = ownerShort(c.road_owner, c.speed_limit);
            return (
              <Link key={c.id} className="admin-list-item" href={`/backoffice/sak/${encodeURIComponent(c.id)}`}>
                <div className="admin-list-item__head">
                  <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
                  <span className="admin-list-item__time">{timeAgo(c.created_at)}</span>
                </div>
                <strong className="admin-list-item__title">{c.category}</strong>
                {c.description && <span className="admin-list-item__desc">{c.description}</span>}
                <span className="admin-list-item__foot">
                  {loc && <span className="admin-list-item__loc">{loc}</span>}
                  {c.bike_route_type && <span className="admin-list-item__tag">{c.bike_route_type === 'skole' ? 'Skolerute' : 'Sykkelrute'}</span>}
                  {c.due_date && (() => {
                    const over = String(c.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10) && c.status !== REPORT_STATUS.DONE;
                    return <span className={over ? 'sak-due sak-due--over' : 'sak-due'}>{over ? 'Forfalt' : 'Frist'} {new Date(c.due_date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}</span>;
                  })()}
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
