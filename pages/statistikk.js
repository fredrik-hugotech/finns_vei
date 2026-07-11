import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Logo from '../components/Logo';
import { STATUS_COLORS } from '../lib/config';
import { reportStatusMeta } from '../lib/reportStatusMeta';
import { buildReportStats } from '../lib/reportStats';
import BadgeEmbedPanel from '../components/BadgeEmbedPanel';

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

// ---------------------------------------------------------------------------
// "Last ned data" export: CSV + GeoJSON download of the exact feature set
// currently on screen (i.e. already filtered by the season toggle above). The
// GeoJSON from /api/reports is already the public, contact-info-stripped
// dataset (see report_public_geojson / lib/supabaseRest.js's
// stripPrivateProperties), so re-exporting it client-side adds no new
// privacy exposure — it's the same numbers, just downloadable instead of
// only chart-shaped.

// Columns kept in the CSV: straightforward, already-public scalar fields.
// The *_json convenience blobs (facets_json, voices_json, updates_json,
// image_urls_json) are UI-support data for the map popup, not stats fields,
// so they're left out of this flat table on purpose (image_urls itself is
// still included, semicolon-joined).
const CSV_COLUMNS = [
  'id',
  'category',
  'status',
  'description',
  'created_at',
  'support_count',
  'lat',
  'lng',
  'road_reference',
  'road_owner',
  'road_category',
  'speed_limit',
  'public_status_note',
  'public_status_updated_at',
  'image_urls',
];

// RFC 4180-ish escaping: quote a field if it contains a comma, quote, or
// newline, doubling any internal quotes. Never naively comma-join, since
// descriptions/notes are free text that can contain any of those.
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function featureToCsvRecord(feature) {
  const p = feature.properties || {};
  const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : [];
  const [lng, lat] = Array.isArray(coords) ? coords : [];
  return {
    id: p.id ?? p.report_id ?? feature.id ?? '',
    category: p.category ?? '',
    status: p.status ?? '',
    description: p.description ?? '',
    created_at: p.created_at ?? '',
    support_count: p.support_count ?? '',
    lat: lat ?? '',
    lng: lng ?? '',
    road_reference: p.road_reference ?? '',
    road_owner: p.road_owner ?? '',
    road_category: p.road_category ?? '',
    speed_limit: p.speed_limit ?? '',
    public_status_note: p.public_status_note ?? '',
    public_status_updated_at: p.public_status_updated_at ?? '',
    image_urls: Array.isArray(p.image_urls) ? p.image_urls.join('; ') : '',
  };
}

function featuresToCsv(features) {
  const header = CSV_COLUMNS.join(',');
  const rows = features.map((feature) => {
    const record = featureToCsvRecord(feature);
    return CSV_COLUMNS.map((col) => csvEscape(record[col])).join(',');
  });
  return [header, ...rows].join('\r\n');
}

function seasonFileTag(season) {
  return season === 'winter' ? 'vinter' : 'alle';
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(parts, filename, mimeType) {
  const blob = new Blob(parts, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadCsv(features, season) {
  const csv = featuresToCsv(features);
  // Leading BOM helps Excel (common among municipal staff) detect UTF-8 so
  // æøå in descriptions/notes render correctly instead of as mojibake.
  triggerDownload(
    ['﻿', csv],
    `finns-vei-meldinger-${seasonFileTag(season)}-${todayStamp()}.csv`,
    'text/csv;charset=utf-8;',
  );
}

function downloadGeoJson(features, season) {
  const collection = { type: 'FeatureCollection', features };
  triggerDownload(
    [JSON.stringify(collection, null, 2)],
    `finns-vei-meldinger-${seasonFileTag(season)}-${todayStamp()}.geojson`,
    'application/geo+json',
  );
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
    () => (state.status === 'ready' ? buildReportStats(filteredFeatures) : null),
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

            <section>
              <h2 className="stats-page__h2">Last ned data</h2>
              <p className="stats-page__note">
                Last ned meldingene som ligger til grunn for tallene over ({stats.total} stk, filtrert som visningen
                over). Ingen kontaktinfo følger med – dette er samme åpne datasett som vises på kartet.
              </p>
              <div className="stats-page__downloads">
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => downloadCsv(filteredFeatures, season)}
                >
                  Last ned CSV
                </button>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => downloadGeoJson(filteredFeatures, season)}
                >
                  Last ned GeoJSON
                </button>
              </div>
            </section>

            <BadgeEmbedPanel />

            <p className="stats-page__foot comp-muted">
              Tallene er hentet fra offentlig tilgjengelige innmeldinger og oppdateres når du laster siden på nytt.
            </p>
          </>
        )}
      </main>
    </>
  );
}
