import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Logo from '../components/Logo';
import { REPORT_STATUS, STATUS_COLORS } from '../lib/config';
import { REPORT_STATUS_ORDER, reportStatusMeta } from '../lib/reportStatusMeta';

const MONTH_LABEL = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Last `n` calendar months, oldest first, including the current month.
function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: MONTH_LABEL[d.getMonth()] });
  }
  return out;
}

// "Mørketid" road hazards (ice, snow-narrowed shoulders, dark mornings, poor
// visibility) cluster in the meteorological winter half of the year. We keep
// the full November–March window rather than trimming the edges: in most of
// Norway early November already brings the first ice/dark-morning reports,
// and March keeps producing freeze-thaw black ice right up to month's end —
// so both edge months carry real signal.
const WINTER_MONTHS = new Set([10, 11, 0, 1, 2]); // nov, des, jan, feb, mar (0-indexed)

function isWinterReport(feature) {
  const createdAt = feature.properties?.created_at;
  if (!createdAt) return false;
  const d = new Date(createdAt);
  return !Number.isNaN(d.getTime()) && WINTER_MONTHS.has(d.getMonth());
}

// All aggregation happens client-side over the already-public GeoJSON from
// /api/reports — no new server logic, just counting what's already exposed.
function buildStats(features) {
  const total = features.length;
  const byCategory = new Map();
  const byStatus = new Map();
  let totalSupport = 0;
  const months = lastMonths(6);
  const monthCounts = new Map(months.map((m) => [m.key, 0]));

  features.forEach((feature) => {
    const p = feature.properties || {};
    const category = p.category || 'Annet';
    byCategory.set(category, (byCategory.get(category) || 0) + 1);

    const status = p.status || REPORT_STATUS.NEW;
    byStatus.set(status, (byStatus.get(status) || 0) + 1);

    totalSupport += Number(p.support_count) || 0;

    if (p.created_at) {
      const d = new Date(p.created_at);
      if (!Number.isNaN(d.getTime())) {
        const key = monthKey(d);
        if (monthCounts.has(key)) monthCounts.set(key, monthCounts.get(key) + 1);
      }
    }
  });

  const doneCount = byStatus.get(REPORT_STATUS.DONE) || 0;
  const resolvedShare = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  const knownStatuses = REPORT_STATUS_ORDER.map((status) => ({ status, count: byStatus.get(status) || 0 }));
  const otherStatuses = [...byStatus.keys()]
    .filter((status) => !REPORT_STATUS_ORDER.includes(status))
    .map((status) => ({ status, count: byStatus.get(status) || 0 }));
  const statuses = [...knownStatuses, ...otherStatuses];

  const trend = months.map((m) => ({ ...m, count: monthCounts.get(m.key) || 0 }));

  return { total, totalSupport, resolvedShare, categories, statuses, trend };
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

export default function StatistikkPage() {
  const [state, setState] = useState({ status: 'loading', features: [] });
  const [season, setSeason] = useState('all'); // 'all' | 'winter'

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reports')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Kunne ikke hente data'))))
      .then((data) => {
        if (cancelled) return;
        const features = Array.isArray(data.features) ? data.features : [];
        const isDemo = Boolean(data.meta?.demo);
        if (isDemo || features.length === 0) {
          setState({ status: 'empty', features: [] });
        } else {
          setState({ status: 'ready', features });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', features: [] });
      });
    return () => { cancelled = true; };
  }, []);

  // Slice the already-fetched features by season before handing them to
  // buildStats — the aggregation logic itself stays untouched, so every
  // section (overview, category/status bars, trend) recomputes for free.
  const filteredFeatures = useMemo(() => {
    if (state.status !== 'ready') return state.features;
    return season === 'winter' ? state.features.filter(isWinterReport) : state.features;
  }, [state, season]);

  const stats = useMemo(
    () => (state.status === 'ready' ? buildStats(filteredFeatures) : null),
    [state.status, filteredFeatures],
  );

  const maxCategory = stats ? Math.max(...stats.categories.map((c) => c.count), 1) : 1;
  const maxStatus = stats ? Math.max(...stats.statuses.map((s) => s.count), 1) : 1;
  const maxTrend = stats ? Math.max(...stats.trend.map((t) => t.count), 1) : 1;

  return (
    <>
      <Head>
        <title>Statistikk – Finns Fairway</title>
        <meta
          name="description"
          content="Åpne tall om trafikkfarlige steder meldt inn av innbyggere: kategorier, status og utvikling over tid."
        />
      </Head>
      <main className="page stats-page">
        <header className="stats-page__head">
          <Link className="stats-page__back" href="/">‹ Kart</Link>
          <Logo size="sm" />
        </header>

        <h1>Statistikk</h1>
        <p className="lede">
          Åpne tall fra innbyggernes meldinger om utrygge steder i trafikken. Samme data som vises på kartet, oppsummert.
        </p>

        {state.status === 'loading' && <p className="comp-muted">Henter tall …</p>}

        {state.status === 'error' && (
          <p className="notice notice--error">Kunne ikke hente statistikk akkurat nå. Prøv igjen senere.</p>
        )}

        {state.status === 'empty' && (
          <div className="admin-section stats-empty">
            <strong>Ingen data ennå</strong>
            <p className="comp-muted">
              Det er ikke registrert noen innmeldinger å vise statistikk for ennå. Kom tilbake senere, eller{' '}
              <Link href="/">meld fra om et utrygt sted</Link> for å bidra.
            </p>
          </div>
        )}

        {stats && (
          <>
            <div className="segmented stats-page__season-toggle" role="tablist" aria-label="Vis meldinger for">
              <button
                type="button"
                role="tab"
                aria-selected={season === 'all'}
                className={season === 'all' ? 'segmented__option segmented__option--active' : 'segmented__option'}
                onClick={() => setSeason('all')}
              >
                Alle
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={season === 'winter'}
                className={season === 'winter' ? 'segmented__option segmented__option--active' : 'segmented__option'}
                onClick={() => setSeason('winter')}
              >
                Vintermeldinger (nov–mar)
              </button>
            </div>

            {season === 'winter' && (
              <p className="stats-page__note">
                Viser kun meldinger registrert i vinterhalvåret (november–mars), når is, snø, smale skuldre og mørke
                morgener øker risikoen i trafikken.
              </p>
            )}

            <section className="stats-overview">
              <div className="stats-stat">
                <strong>{stats.total}</strong>
                <span>Innmeldinger totalt</span>
              </div>
              <div className="stats-stat">
                <strong>{stats.resolvedShare}%</strong>
                <span>Andel løst</span>
              </div>
              <div className="stats-stat">
                <strong>{stats.totalSupport}</strong>
                <span>Innbyggerstøtter</span>
              </div>
            </section>

            <section>
              <h2 className="stats-page__h2">Kategorier</h2>
              <div className="stats-barlist">
                {stats.categories.map((c) => (
                  <Bar key={c.category} label={c.category} count={c.count} max={maxCategory} color="var(--color-primary)" />
                ))}
              </div>
            </section>

            <section>
              <h2 className="stats-page__h2">Status</h2>
              <div className="stats-barlist">
                {stats.statuses.map((s) => (
                  <Bar
                    key={s.status}
                    label={reportStatusMeta(s.status).label}
                    count={s.count}
                    max={maxStatus}
                    color={STATUS_COLORS[s.status] || 'var(--color-muted)'}
                  />
                ))}
              </div>
            </section>

            <section>
              <h2 className="stats-page__h2">Siste 6 måneder</h2>
              <div
                className="stats-trend"
                role="img"
                aria-label={`Antall innmeldinger per måned siste 6 måneder: ${stats.trend
                  .map((t) => `${t.label} ${t.count}`)
                  .join(', ')}`}
              >
                {stats.trend.map((t) => (
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

            <p className="stats-page__foot comp-muted">
              Tallene er hentet fra offentlig tilgjengelige innmeldinger og oppdateres når du laster siden på nytt.
            </p>
          </>
        )}
      </main>
    </>
  );
}
