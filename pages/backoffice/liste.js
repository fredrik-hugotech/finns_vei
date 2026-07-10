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

function isOverdueCase(c, today) {
  return Boolean(c.due_date) && c.status !== REPORT_STATUS.DONE && String(c.due_date).slice(0, 10) < today;
}
// "Stale" = open case with no status change in 30+ days (status_updated_at,
// falling back to created_at for cases that never had a status change).
// Cases already flagged overdue are excluded here so the two summary counts
// stay mutually exclusive — an overdue-and-stale case only shows up as
// "forfalt", not double-counted into "uten oppfølging" too.
function isStaleCase(c, today) {
  if (c.status === REPORT_STATUS.DONE || isOverdueCase(c, today)) return false;
  const lastTouch = c.status_updated_at || c.created_at;
  if (!lastTouch) return false;
  const days = Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000);
  return days > 30;
}

const SORTS = [
  { key: 'new', label: 'Nyeste' },
  { key: 'support', label: 'Mest støtte' },
  { key: 'due', label: 'Frist' },
  { key: 'old', label: 'Eldste' },
];

export default function Liste() {
  const router = useRouter();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [agingFilter, setAgingFilter] = useState('');
  const active = typeof router.query.status === 'string' && STATUSES.includes(router.query.status) ? router.query.status : '';

  useEffect(() => {
    fetch('/api/backoffice/cases')
      .then((r) => (r.status === 403 ? Promise.reject(new Error('not-authed')) : (r.ok ? r.json() : Promise.reject(new Error('feil')))))
      .then((d) => setCases(d.cases || []))
      .catch((e) => setError(e.message === 'not-authed' ? 'not-authed' : 'Kunne ikke hente saker.'));
  }, []);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const list = (cases || [])
      .filter((c) => !active || c.status === active)
      .filter((c) => !query || `${c.category} ${c.description || ''} ${ownerShort(c.road_owner, c.speed_limit)}`.toLowerCase().includes(query))
      .filter((c) => {
        if (agingFilter === 'over') return isOverdueCase(c, today);
        if (agingFilter === 'stale') return isStaleCase(c, today);
        return true;
      });
    const byNew = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
    const sorters = {
      new: byNew,
      old: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
      support: (a, b) => (Number(b.support_count || 0) - Number(a.support_count || 0)) || byNew(a, b),
      due: (a, b) => {
        if (!a.due_date && !b.due_date) return byNew(a, b);
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return String(a.due_date).slice(0, 10).localeCompare(String(b.due_date).slice(0, 10));
      },
    };
    return list.sort(sorters[sort] || byNew);
  }, [cases, active, q, sort, agingFilter]);

  const totalSupport = useMemo(() => (cases || []).reduce((n, c) => n + Number(c.support_count || 0), 0), [cases]);

  // Aggregate aging counts for the summary strip: computed off the full case
  // set (not the currently filtered `shown` list), same as totalSupport above,
  // so staff always see the true overdue/stale totals regardless of which
  // status filter or search they currently have applied.
  const aging = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const list = cases || [];
    return {
      over: list.filter((c) => isOverdueCase(c, today)).length,
      stale: list.filter((c) => isStaleCase(c, today)).length,
    };
  }, [cases]);

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

        <div className="liste-sort">
          <span className="liste-sort__label">Sorter</span>
          {SORTS.map((s) => (
            <button key={s.key} type="button" className={sort === s.key ? 'liste-sort__btn liste-sort__btn--on' : 'liste-sort__btn'} onClick={() => setSort(s.key)}>{s.label}</button>
          ))}
        </div>

        {!error && cases && cases.length > 0 && (
          <div className="liste-summary">
            <button
              type="button"
              disabled={aging.over === 0}
              className={agingFilter === 'over' ? 'liste-summary__chip liste-summary__chip--over liste-summary__chip--on' : 'liste-summary__chip liste-summary__chip--over'}
              onClick={() => setAgingFilter((f) => (f === 'over' ? '' : 'over'))}
            >
              {aging.over} forfalt
            </button>
            <button
              type="button"
              disabled={aging.stale === 0}
              className={agingFilter === 'stale' ? 'liste-summary__chip liste-summary__chip--stale liste-summary__chip--on' : 'liste-summary__chip liste-summary__chip--stale'}
              onClick={() => setAgingFilter((f) => (f === 'stale' ? '' : 'stale'))}
            >
              {aging.stale} uten oppfølging &gt;30 dager
            </button>
          </div>
        )}

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && cases === null && <p className="admin-list-empty">Laster …</p>}
        {!error && cases && shown.length === 0 && <p className="admin-list-empty">Ingen saker her.</p>}
        {!error && cases && shown.length > 0 && <p className="sak-count">{shown.length} sak{shown.length === 1 ? '' : 'er'}{totalSupport > 0 ? ` · ${totalSupport} støtter totalt` : ''}</p>}

        <div className="admin-list">
          {shown.map((c) => {
            const meta = reportStatusMeta(c.status);
            const loc = ownerShort(c.road_owner, c.speed_limit);
            return (
              <Link key={c.id} className="admin-list-item" href={`/backoffice/sak/${encodeURIComponent(c.id)}`}>
                <div className="admin-list-item__head">
                  <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
                  <span className="admin-list-item__headright">
                    {Number(c.support_count) > 0 && <span className="admin-list-item__support" title="Innbyggerstøtte">♥ {c.support_count}</span>}
                    <span className="admin-list-item__time">{timeAgo(c.created_at)}</span>
                  </span>
                </div>
                <strong className="admin-list-item__title">{c.category}</strong>
                {c.description && <span className="admin-list-item__desc">{c.description}</span>}
                <span className="admin-list-item__foot">
                  {loc && <span className="admin-list-item__loc">{loc}</span>}
                  {c.bike_route_type && <span className="admin-list-item__tag">{c.bike_route_type === 'skole' ? 'Skolerute' : 'Sykkelrute'}</span>}
                  {c.due_date && (() => {
                    const over = isOverdueCase(c, new Date().toISOString().slice(0, 10));
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
