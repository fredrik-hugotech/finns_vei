import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from '../components/Logo';
import { reportStatusMeta } from '../lib/reportStatusMeta';
import { categoryGlyph } from '../lib/reportCategoryGlyphs';
import {
  CORRIDOR_BUFFER_RADIUS_M,
  MIN_ROUTE_POINTS,
  buildRouteCorridorPolygons,
  filterFeaturesInPathCorridor,
  pathBbox,
  routeLengthMeters,
} from '../lib/corridorGeometry';
import { normalizeAccidentSeverity } from '../lib/accidentSeverity';

// mapboxgl touches browser-only globals at module-import time (same reason
// ReportMap.js is always loaded this way from every page that uses it).
const DinVeiMap = dynamic(() => import('../components/DinVeiMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

// Reports older than this are excluded from the result — a route summary
// should reflect the current situation, not a decade-old one-off report.
const REPORT_MAX_AGE_YEARS = 8;

function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

function reportIdFromFeature(feature) {
  const properties = feature?.properties || {};
  return properties.id || properties.report_id || properties.reportId || feature?.id || '';
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMeters(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded} m`;
}

function accidentTypeLabel(properties = {}) {
  return properties.accident_type || 'Trafikkulykke';
}

// A report with no created_at is kept (never assume it's old just because
// the date is missing); everything else is compared against the cutoff.
function isWithinReportAgeLimit(properties = {}, cutoff) {
  if (!properties.created_at) return true;
  const created = new Date(properties.created_at);
  if (Number.isNaN(created.getTime())) return true;
  return created >= cutoff;
}

export default function DinVei() {
  const mapApiRef = useRef(null);
  const handleMapReady = useCallback((api) => { mapApiRef.current = api; }, []);

  // The hand-drawn route: start first, then one tap per point along the way
  // — a walk, a bike ride, a school route, whatever the trip actually is —
  // end last. `drawing` is true while taps still append to the path; the
  // "Fullfør ruten" button turns it off, and "Rediger rute" turns it back
  // on to keep extending the route.
  const [path, setPath] = useState([]); // [{ lng, lat }, ...]
  const [drawing, setDrawing] = useState(true);

  const [result, setResult] = useState(null); // { matchedReports, matchedAccidents, categoryBreakdown, accidentTypeBreakdown, routeLengthM, accidentsUnavailable }
  const [loading, setLoading] = useState(false);
  // Collapses the (potentially long) results list back down so the drawn
  // route stays visible on the map without scrolling a full-height panel.
  const [resultsCollapsed, setResultsCollapsed] = useState(false);

  const routeReady = path.length >= MIN_ROUTE_POINTS && !drawing;

  const corridorRings = useMemo(() => {
    if (path.length < MIN_ROUTE_POINTS) return null;
    return buildRouteCorridorPolygons(path, CORRIDOR_BUFFER_RADIUS_M);
  }, [path]);

  const handleMapClick = useCallback((point) => {
    if (!drawing) return; // route finished — "Rediger rute" re-enables tapping
    haptic(10);
    setPath((current) => [...current, point]);
  }, [drawing]);

  const undoLastPoint = () => { haptic(8); setPath((current) => current.slice(0, -1)); };
  const finishRoute = () => { haptic(8); setDrawing(false); };
  const editRoute = () => { haptic(8); setDrawing(true); };
  const resetAll = () => {
    haptic(8);
    setPath([]);
    setDrawing(true);
    setResult(null);
    setResultsCollapsed(false);
  };
  const toggleResultsCollapsed = () => { haptic(6); setResultsCollapsed((current) => !current); };

  // Two deliberate camera moves only — zoom in once the start point is
  // tapped, then fit the whole route once "Fullfør ruten" is pressed. No
  // re-fit on every intermediate waypoint tap: the user is actively
  // panning/tapping within the current view while drawing, and refitting
  // after each tap would fight their own camera control.
  useEffect(() => {
    if (drawing && path.length === 1) mapApiRef.current?.fitToPoints?.(path);
    else if (!drawing && path.length >= MIN_ROUTE_POINTS) mapApiRef.current?.fitToPoints?.(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, path.length]);

  // Fetch existing public data (reports + NVDB accident layer) and filter to
  // the route's corridor once the route is finished. Read-only, uses only
  // the app's already-public endpoints — no new secret/service, nothing
  // written.
  useEffect(() => {
    if (!routeReady) {
      setResult(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setResultsCollapsed(false);

    const bbox = pathBbox(path, CORRIDOR_BUFFER_RADIUS_M).map((v) => v.toFixed(6)).join(',');
    const reportAgeCutoff = new Date();
    reportAgeCutoff.setFullYear(reportAgeCutoff.getFullYear() - REPORT_MAX_AGE_YEARS);

    Promise.all([
      fetch('/api/reports').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/nvdb/layer?type=accidents&bbox=${encodeURIComponent(bbox)}&zoom=13`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([reportsGeo, accidentsGeo]) => {
      if (cancelled) return;

      const recentReportFeatures = (reportsGeo?.features || [])
        .filter((feature) => isWithinReportAgeLimit(feature.properties, reportAgeCutoff));

      const matchedReports = filterFeaturesInPathCorridor(recentReportFeatures, path, CORRIDOR_BUFFER_RADIUS_M);
      const matchedAccidents = filterFeaturesInPathCorridor(accidentsGeo?.features || [], path, CORRIDOR_BUFFER_RADIUS_M);
      // Tolerant by design: a missing/degraded/timed-out accident layer never
      // shows a raw error — it just yields an empty, clearly-labelled state,
      // matching the pattern the "Ulykker" toggle already uses on the main map.
      const accidentsUnavailable = !accidentsGeo || Boolean(accidentsGeo?.meta?.degraded);

      const breakdown = new Map();
      matchedReports.forEach(({ feature }) => {
        const category = feature.properties?.category || 'Annet';
        breakdown.set(category, (breakdown.get(category) || 0) + 1);
      });

      // Categorised by accident TYPE, not severity: NVDB's public accident
      // layer only rarely carries a usable severity value for these objects
      // (most come back with none at all), so a severity-first breakdown
      // ends up as one big, useless "ukjent" bucket. Type is present far
      // more often and is what a parent actually wants to know at a glance.
      const typeCounts = new Map();
      matchedAccidents.forEach(({ feature }) => {
        const type = accidentTypeLabel(feature.properties);
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      });

      setResult({
        matchedReports,
        matchedAccidents,
        categoryBreakdown: Array.from(breakdown.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count),
        accidentTypeBreakdown: Array.from(typeCounts.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
        accidentsUnavailable,
        routeLengthM: routeLengthMeters(path),
      });
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      // Belt-and-braces: even if something above throws unexpectedly, land
      // on a calm empty state rather than an unhandled error.
      setResult({
        matchedReports: [],
        matchedAccidents: [],
        categoryBreakdown: [],
        accidentTypeBreakdown: [],
        accidentsUnavailable: true,
        routeLengthM: routeLengthMeters(path),
      });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [routeReady, path]);

  const matchedReportsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: (result?.matchedReports || []).map((entry) => entry.feature),
  }), [result]);

  const matchedAccidentsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: (result?.matchedAccidents || []).map((entry) => entry.feature),
  }), [result]);

  let hint = '';
  if (path.length === 0) hint = 'Trykk på kartet der du starter';
  else if (drawing && path.length === 1) hint = 'Trykk langs veien du går eller sykler, punkt for punkt';
  else if (drawing && path.length >= 2) hint = 'Fortsett å trykke for å forlenge ruten, eller trykk «Fullfør ruten» når du er fremme';

  return (
    <>
      <Head>
        <title>Din vei – Finns Fairway</title>
        <meta name="description" content="Tegn en tur, sykkeltur eller skolevei på kartet og få en oversikt over kjente farer langs veien, basert på meldinger og ulykkesdata Finns Fairway allerede viser." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
      </Head>
      <main className="app-shell dinvei-page">
        <DinVeiMap
          className="map-canvas"
          path={path}
          corridorRings={corridorRings}
          matchedReportsGeoJson={matchedReportsGeoJson}
          matchedAccidentsGeoJson={matchedAccidentsGeoJson}
          onMapClick={handleMapClick}
          onMapReady={handleMapReady}
        />

        <div className="app-topbar">
          <Link href="/" className="app-brand dinvei-brand-link" aria-label="Til forsiden"><Logo size="sm" /></Link>
        </div>

        {hint && <div className="pick-hint">{hint}</div>}

        <section className="dinvei-panel" aria-live="polite">
          <div className="dinvei-panel__head">
            <div className="dinvei-panel__headtext">
              <h1 className="dinvei-panel__title">Din vei</h1>
              <p className="dinvei-panel__lede">
                Tegn en tur, sykkeltur eller skolevei punkt for punkt på kartet. Vi ser etter meldte farer og
                registrerte ulykker innenfor {CORRIDOR_BUFFER_RADIUS_M} m fra ruten.
              </p>
            </div>
            {routeReady && result && (
              <button
                type="button"
                className="dinvei-panel__toggle"
                onClick={toggleResultsCollapsed}
                aria-expanded={!resultsCollapsed}
                aria-label={resultsCollapsed ? 'Vis resultater' : 'Skjul resultater'}
              >
                {resultsCollapsed ? '▾' : '▴'}
              </button>
            )}
          </div>

          <div className="dinvei-steps">
            <div className={path.length === 0 ? 'dinvei-step dinvei-step--active' : 'dinvei-step'}>
              <span className="dinvei-step__dot dinvei-step__dot--start">A</span>
              <span className="dinvei-step__label">{path.length > 0 ? 'Start satt' : 'Trykk for start'}</span>
            </div>
            <div className={drawing && path.length > 0 ? 'dinvei-step dinvei-step--active' : 'dinvei-step'}>
              <span className="dinvei-step__dot dinvei-step__dot--end">
                {routeReady ? 'B' : Math.max(path.length - 1, 0)}
              </span>
              <span className="dinvei-step__label">
                {routeReady
                  ? `Fullført · ${path.length} punkter`
                  : path.length > 0 ? 'Tegner ruten …' : 'Tegn ruten'}
              </span>
            </div>
          </div>

          <div className="dinvei-draw-actions">
            {drawing && path.length > 1 && (
              <button type="button" className="dinvei-draw-btn" onClick={undoLastPoint}>Angre siste punkt</button>
            )}
            {drawing && path.length >= MIN_ROUTE_POINTS && (
              <button type="button" className="dinvei-draw-btn dinvei-draw-btn--primary" onClick={finishRoute}>
                Fullfør ruten
              </button>
            )}
            {routeReady && (
              <button type="button" className="dinvei-draw-btn" onClick={editRoute}>Rediger rute</button>
            )}
          </div>

          {path.length > 0 && (
            <button type="button" className="dinvei-reset" onClick={resetAll}>Start på nytt</button>
          )}

          {routeReady && loading && (
            <p className="dinvei-loading">Henter meldinger og ulykkesdata …</p>
          )}

          {routeReady && !loading && result && !resultsCollapsed && (
            <div className="dinvei-result">
              <div className="dinvei-stats">
                <div className="dinvei-stat">
                  <strong>{formatMeters(result.routeLengthM)}</strong>
                  <span>tegnet rute</span>
                </div>
                <div className="dinvei-stat">
                  <strong>{result.matchedReports.length}</strong>
                  <span>{result.matchedReports.length === 1 ? 'melding' : 'meldinger'}</span>
                </div>
                <div className="dinvei-stat">
                  <strong>{result.accidentsUnavailable ? '–' : result.matchedAccidents.length}</strong>
                  <span>ulykker</span>
                </div>
              </div>

              {result.accidentsUnavailable && (
                <p className="dinvei-note">Ulykkesdata er ikke tilgjengelig akkurat nå. Meldinger under er ikke påvirket.</p>
              )}

              {result.matchedAccidents.length > 0 && (
                <div className="dinvei-section">
                  <h2 className="dinvei-section-title">Ulykker langs ruten</h2>

                  {result.accidentTypeBreakdown.length > 0 && (
                    <ul className="dinvei-breakdown">
                      {result.accidentTypeBreakdown.map((entry) => (
                        <li key={entry.type} className="dinvei-breakdown__item">
                          <span className="accident-dot" aria-hidden="true" />
                          <span className="dinvei-breakdown__label">{entry.type}</span>
                          <span className="dinvei-breakdown__count">{entry.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className="dinvei-accident-list">
                    {result.matchedAccidents.map(({ feature, distanceM }) => {
                      const properties = feature.properties || {};
                      const severity = normalizeAccidentSeverity(properties.severity);
                      // NVDB rarely carries a usable severity value for these
                      // objects — only show the badge when we actually have one,
                      // instead of cluttering every row with "ukjent".
                      const showSeverity = Boolean(properties.severity) && severity !== 'unknown';
                      const key = properties.id || `${feature.geometry?.coordinates?.join(',')}-${properties.year || ''}`;
                      return (
                        <li key={key} className="dinvei-accident-item">
                          {showSeverity && (
                            <span className={`severity-pill severity-pill--${severity}`}>
                              {severity === 'fatal' ? 'Dødsulykke' : severity === 'serious' ? 'Alvorlig' : 'Lettere skadd'}
                            </span>
                          )}
                          <strong className="dinvei-accident-item__title">{accidentTypeLabel(properties)}</strong>
                          <span className="dinvei-accident-item__meta">
                            {formatMeters(distanceM)} fra ruten{properties.year ? ` · ${properties.year}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="dinvei-section">
                {(result.categoryBreakdown.length > 0 || result.matchedReports.length > 0) && (
                  <h2 className="dinvei-section-title">Meldte farer</h2>
                )}

                {result.categoryBreakdown.length > 0 && (
                  <ul className="dinvei-breakdown">
                    {result.categoryBreakdown.map((entry) => (
                      <li key={entry.category} className="dinvei-breakdown__item">
                        <span className="dinvei-breakdown__glyph" dangerouslySetInnerHTML={{ __html: categoryGlyph(entry.category) }} />
                        <span className="dinvei-breakdown__label">{entry.category}</span>
                        <span className="dinvei-breakdown__count">{entry.count}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {result.matchedReports.length === 0 ? (
                  <p className="dinvei-empty">Ingen meldte farer funnet langs denne ruten. Bra tegn – men sjekk alltid selv også.</p>
                ) : (
                  <ul className="dinvei-report-list">
                    {result.matchedReports.map(({ feature, distanceM }) => {
                      const id = reportIdFromFeature(feature);
                      const properties = feature.properties || {};
                      const meta = reportStatusMeta(properties.status);
                      return (
                        <li key={id || `${feature.geometry?.coordinates?.join(',')}`} className="dinvei-report-item">
                          <Link href={id ? `/sak/${id}` : '#'} className="dinvei-report-item__link">
                            <span
                              className={`status-pill status-pill--${meta.key}`}
                              dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }}
                            />
                            <strong className="dinvei-report-item__title">{properties.category || 'Melding'}</strong>
                            <span className="dinvei-report-item__meta">
                              {formatMeters(distanceM)} fra ruten{properties.created_at ? ` · ${formatDate(properties.created_at)}` : ''}
                            </span>
                            {properties.description && (
                              <span className="dinvei-report-item__desc">{String(properties.description).slice(0, 140)}</span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
