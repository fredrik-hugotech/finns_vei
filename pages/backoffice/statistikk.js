import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import { STATUS_COLORS } from '../../lib/config';
import { reportStatusMeta } from '../../lib/reportStatusMeta';

const RANGES = [
  { key: '30', label: '30 dager' },
  { key: '90', label: '90 dager' },
  { key: '365', label: '12 måneder' },
  { key: 'all', label: 'Alt' },
];

const OWNER_LABEL = { kommune: 'Kommunal', fylke: 'Fylkesvei', stat: 'Riksvei', privat: 'Privat' };

function ownerLabel(value) {
  return OWNER_LABEL[String(value || '').toLowerCase()] || value || 'Ukjent';
}

// RFC 4180-ish escaping: quote a field if it contains a comma, quote, or
// newline, doubling any internal quotes — descriptions/free text elsewhere
// in the app can contain any of those, so never naively comma-join.
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const CSV_COLUMNS = ['id', 'category', 'status', 'created_at', 'status_updated_at', 'road_owner', 'road_category', 'support_count'];

function reportsToCsv(reports) {
  const header = CSV_COLUMNS.join(',');
  const rows = reports.map((r) => CSV_COLUMNS.map((col) => csvEscape(r[col])).join(','));
  return [header, ...rows].join('\r\n');
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsv(reports, range) {
  const csv = reportsToCsv(reports);
  // Leading BOM helps Excel detect UTF-8 so æøå render correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `finns-vei-statistikk-${range}-${todayStamp()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function Bar({ label, count, max, color }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  const width = count > 0 ? Math.max(4, pct) : 0;
  return (
    <div className="stats-barrow">
      <span className="stats-barrow__label">{label}</span>
      <div className="stats-barrow__track">
        <div className="stats-barrow__fill" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="stats-barrow__value">{count}</span>
    </div>
  );
}

// Internal-only companion to the public map: aggregate counts over
// public.reports (volume, category/status mix, NVDB road enrichment,
// resolution time) for staff, plus a CSV export of the underlying rows.
// Fulfils the "custom/internal stats to be built separately" note left when
// the public /statistikk page was removed — same numbers, staff-only, with
// more operational detail (resolution time, road owner/category).
export default function BackofficeStatistikk() {
  const [range, setRange] = useState('90');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    fetch(`/api/backoffice/statistikk?range=${encodeURIComponent(range)}`)
      .then((r) => (r.status === 403 ? Promise.reject(new Error('not-authed')) : (r.ok ? r.json() : Promise.reject(new Error('feil')))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message === 'not-authed' ? 'not-authed' : 'Kunne ikke hente statistikk.'); });
    return () => { cancelled = true; };
  }, [range]);

  const maxCategory = useMemo(() => Math.max(1, ...(data?.categories || []).map((c) => c.count)), [data]);
  const maxStatus = useMemo(() => Math.max(1, ...(data?.statuses || []).map((s) => s.count)), [data]);
  const maxTrend = useMemo(() => Math.max(1, ...(data?.trend?.points || []).map((t) => t.count)), [data]);
  const maxOwner = useMemo(() => Math.max(1, ...(data?.roadOwner?.items || []).map((o) => o.count)), [data]);
  const maxRoadCategory = useMemo(() => Math.max(1, ...(data?.roadCategory?.items || []).map((o) => o.count)), [data]);

  return (
    <>
      <Head><title>Statistikk – Finns Fairway</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <BackofficeHeader title="Statistikk" />
      <main className="page stats-page">
        <div className="segmented" role="tablist" aria-label="Tidsrom">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={range === r.key ? 'segmented__option segmented__option--active' : 'segmented__option'}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && !data && <p className="admin-list-empty">Henter tall …</p>}

        {!error && data && data.total === 0 && (
          <div className="admin-section stats-empty">
            <strong>Ingen meldinger i valgt periode</strong>
            <p className="comp-muted">Prøv et lengre tidsrom.</p>
          </div>
        )}

        {!error && data && data.total > 0 && (
          <>
            {data.capped && (
              <p className="stats-page__note">
                Viser de {data.rowCount} nyeste meldingene i perioden (denne oversiktens grense) — kan mangle eldre meldinger.
              </p>
            )}

            <section className="stats-overview">
              <div className="stats-stat"><strong>{data.total}</strong><span>Meldinger</span></div>
              <div className="stats-stat"><strong>{data.resolution.medianDays ?? '–'}</strong><span>Median dager til fullført</span></div>
              <div className="stats-stat"><strong>{data.totalSupport}</strong><span>Innbyggerstøtter</span></div>
            </section>

            <section>
              <h2 className="stats-page__h2">{data.trend.bucket === 'week' ? 'Nye meldinger per uke' : 'Nye meldinger per måned'}</h2>
              <div
                className="stats-trend"
                role="img"
                aria-label={`Nye meldinger: ${data.trend.points.map((t) => `${t.label} ${t.count}`).join(', ')}`}
              >
                {data.trend.points.map((t) => (
                  <div key={t.key} className="stats-trend__col">
                    <span className="stats-trend__count">{t.count}</span>
                    <div
                      className="stats-trend__bar"
                      style={{ height: `${t.count > 0 ? Math.max(6, Math.round((t.count / maxTrend) * 100)) : 2}%` }}
                    />
                    <span className="stats-trend__label">{t.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="stats-page__h2">Kategorier</h2>
              <div className="stats-barlist">
                {data.categories.map((c) => (
                  <Bar key={c.category} label={c.category} count={c.count} max={maxCategory} color="var(--color-primary)" />
                ))}
              </div>
            </section>

            <section>
              <h2 className="stats-page__h2">Status</h2>
              <div className="stats-barlist">
                {data.statuses.map((s) => (
                  <Bar
                    key={s.status}
                    label={reportStatusMeta(s.status).label}
                    count={s.count}
                    max={maxStatus}
                    color={STATUS_COLORS[s.status] || 'var(--color-muted)'}
                  />
                ))}
              </div>
              <p className="stats-page__note">
                {data.resolution.count > 0
                  ? `Snitt ${data.resolution.avgDays} dager, median ${data.resolution.medianDays} dager fra melding til «Fullført» (${data.resolution.count} avsluttede saker).`
                  : 'Ingen avsluttede saker i perioden ennå.'}
              </p>
            </section>

            {(data.roadOwner.items.length > 0 || data.roadOwner.missing > 0) && (
              <section>
                <h2 className="stats-page__h2">Veieier</h2>
                <div className="stats-barlist">
                  {data.roadOwner.items.map((o) => (
                    <Bar key={o.value} label={ownerLabel(o.value)} count={o.count} max={maxOwner} color="var(--color-primary)" />
                  ))}
                </div>
                {data.roadOwner.missing > 0 && (
                  <p className="stats-page__note">{data.roadOwner.missing} meldinger mangler NVDB-data om veieier (berikelse skjer «best effort»).</p>
                )}
              </section>
            )}

            {(data.roadCategory.items.length > 0 || data.roadCategory.missing > 0) && (
              <section>
                <h2 className="stats-page__h2">Vegkategori</h2>
                <div className="stats-barlist">
                  {data.roadCategory.items.map((o) => (
                    <Bar key={o.value} label={o.value} count={o.count} max={maxRoadCategory} color="var(--color-primary)" />
                  ))}
                </div>
                {data.roadCategory.missing > 0 && (
                  <p className="stats-page__note">{data.roadCategory.missing} meldinger mangler NVDB-data om vegkategori.</p>
                )}
              </section>
            )}

            <section>
              <h2 className="stats-page__h2">Last ned data</h2>
              <p className="stats-page__note">
                CSV med meldingene som ligger til grunn for tallene over ({data.total} stk, samme periode som visningen). Ingen kontaktinfo følger med.
              </p>
              <div className="stats-page__downloads">
                <button type="button" className="ui-button ui-button-secondary" onClick={() => downloadCsv(data.reports, range)}>
                  Last ned CSV
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
