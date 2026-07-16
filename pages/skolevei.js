import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from '../components/Logo';
import { reportStatusMeta } from '../lib/reportStatusMeta';
import { categoryGlyph } from '../lib/reportCategoryGlyphs';
import {
  CORRIDOR_BUFFER_RADIUS_M,
  buildCorridorPolygonRing,
  corridorBbox,
  filterFeaturesInCorridor,
  haversineDistanceMeters,
} from '../lib/corridorGeometry';
import {
  ACCIDENT_SEVERITY_META,
  ACCIDENT_SEVERITY_ORDER,
  normalizeAccidentSeverity,
} from '../lib/accidentSeverity';

// mapboxgl touches browser-only globals at module-import time (same reason
// ReportMap.js is always loaded this way from every page that uses it).
const SkoleveiMap = dynamic(() => import('../components/SkoleveiMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

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

export default function SkoleveiSjekk() {
  const mapApiRef = useRef(null);
  const handleMapReady = useCallback((api) => { mapApiRef.current = api; }, []);

  const [home, setHome] = useState(null); // { lng, lat } | null
  const [school, setSchool] = useState(null);
  // Which point the next map tap sets. Starts on 'home'; becomes null once
  // both points are set (a plain tap on the map no longer moves anything —
  // the "Velg på nytt" buttons are the only way back into picking mode).
  const [picking, setPicking] = useState('home');

  const [result, setResult] = useState(null); // { matchedReports, matchedAccidents, categoryBreakdown, routeLengthM, accidentsUnavailable }
  const [loading, setLoading] = useState(false);

  const bothPicked = Boolean(home && school);

  const corridorRing = useMemo(() => {
    if (!home || !school) return null;
    return buildCorridorPolygonRing(home, school, CORRIDOR_BUFFER_RADIUS_M);
  }, [home, school]);

  const handleMapClick = useCallback((point) => {
    if (picking === 'home') {
      haptic(10);
      setHome(point);
      setPicking((current) => (school ? null : 'school'));
    } else if (picking === 'school') {
      haptic(10);
      setSchool(point);
      setPicking(null);
    }
    // picking === null: both points are set and the user isn't redoing one
    // right now — an ordinary tap on the map does nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, school]);

  const pickHome = () => { haptic(8); setPicking('home'); };
  const pickSchool = () => { haptic(8); setPicking('school'); };
  const resetAll = () => {
    haptic(8);
    setHome(null);
    setSchool(null);
    setPicking('home');
    setResult(null);
  };

  // Fly/fit the map whenever the set of picked points changes, so the
  // corridor and its buffer are always in view without the user having to
  // pan/zoom manually.
  useEffect(() => {
    const points = [home, school].filter(Boolean);
    if (points.length > 0) mapApiRef.current?.fitToPoints?.(points);
  }, [home?.lng, home?.lat, school?.lng, school?.lat]);

  // Fetch existing public data (reports + NVDB accident layer) and filter to
  // the corridor once both points are picked. Read-only, uses only the
  // app's already-public endpoints — no new secret/service, nothing written.
  useEffect(() => {
    if (!home || !school) {
      setResult(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);

    const bbox = corridorBbox(home, school, CORRIDOR_BUFFER_RADIUS_M).map((v) => v.toFixed(6)).join(',');

    Promise.all([
      fetch('/api/reports').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/nvdb/layer?type=accidents&bbox=${encodeURIComponent(bbox)}&zoom=13`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([reportsGeo, accidentsGeo]) => {
      if (cancelled) return;

      const matchedReports = filterFeaturesInCorridor(reportsGeo?.features || [], home, school, CORRIDOR_BUFFER_RADIUS_M);
      const matchedAccidents = filterFeaturesInCorridor(accidentsGeo?.features || [], home, school, CORRIDOR_BUFFER_RADIUS_M);
      // Tolerant by design: a missing/degraded/timed-out accident layer never
      // shows a raw error — it just yields an empty, clearly-labelled state,
      // matching the pattern the "Ulykker" toggle already uses on the main map.
      const accidentsUnavailable = !accidentsGeo || Boolean(accidentsGeo?.meta?.degraded);

      const breakdown = new Map();
      matchedReports.forEach(({ feature }) => {
        const category = feature.properties?.category || 'Annet';
        breakdown.set(category, (breakdown.get(category) || 0) + 1);
      });

      const severityCounts = new Map();
      matchedAccidents.forEach(({ feature }) => {
        const severity = normalizeAccidentSeverity(feature.properties?.severity);
        severityCounts.set(severity, (severityCounts.get(severity) || 0) + 1);
      });

      setResult({
        matchedReports,
        matchedAccidents,
        categoryBreakdown: Array.from(breakdown.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count),
        accidentSeverityBreakdown: ACCIDENT_SEVERITY_ORDER
          .map((severity) => ({ severity, count: severityCounts.get(severity) || 0 }))
          .filter((entry) => entry.count > 0),
        accidentsUnavailable,
        routeLengthM: haversineDistanceMeters(home, school),
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
        accidentSeverityBreakdown: [],
        accidentsUnavailable: true,
        routeLengthM: haversineDistanceMeters(home, school),
      });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [home?.lng, home?.lat, school?.lng, school?.lat]);

  const matchedReportsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: (result?.matchedReports || []).map((entry) => entry.feature),
  }), [result]);

  const matchedAccidentsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: (result?.matchedAccidents || []).map((entry) => entry.feature),
  }), [result]);

  let hint = '';
  if (picking === 'home') hint = home ? 'Trykk på kartet for å velge hjem på nytt' : 'Trykk på kartet der hjemmet er';
  else if (picking === 'school') hint = school ? 'Trykk på kartet for å velge skole på nytt' : 'Trykk på kartet der skolen er';

  return (
    <>
      <Head>
        <title>Skolevei-sjekk – Finns Fairway</title>
        <meta name="description" content="Velg hjem og skole på kartet og få en oversikt over kjente farer langs skoleveien, basert på meldinger og ulykkesdata Finns Fairway allerede viser." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
      </Head>
      <main className="app-shell skolevei-page">
        <SkoleveiMap
          className="map-canvas"
          homePoint={home}
          schoolPoint={school}
          corridorRing={corridorRing}
          matchedReportsGeoJson={matchedReportsGeoJson}
          matchedAccidentsGeoJson={matchedAccidentsGeoJson}
          onMapClick={handleMapClick}
          onMapReady={handleMapReady}
        />

        <div className="app-topbar">
          <Link href="/" className="app-brand skolevei-brand-link" aria-label="Til forsiden"><Logo size="sm" /></Link>
        </div>

        {hint && <div className="pick-hint">{hint}</div>}

        <section className="skolevei-panel" aria-live="polite">
          <div className="skolevei-panel__head">
            <h1 className="skolevei-panel__title">Skolevei-sjekk</h1>
            <p className="skolevei-panel__lede">
              Velg <strong>hjem</strong> og <strong>skole</strong> på kartet. Vi ser etter meldte farer og
              registrerte ulykker innenfor {CORRIDOR_BUFFER_RADIUS_M} m fra en rett linje mellom punktene.
            </p>
          </div>

          <div className="skolevei-steps">
            <button
              type="button"
              className={picking === 'home' ? 'skolevei-step skolevei-step--active' : 'skolevei-step'}
              onClick={pickHome}
            >
              <span className="skolevei-step__dot skolevei-step__dot--home">H</span>
              <span className="skolevei-step__label">{home ? 'Hjem valgt' : 'Velg hjem'}</span>
              {home && <span className="skolevei-step__redo">Velg på nytt</span>}
            </button>
            <button
              type="button"
              className={picking === 'school' ? 'skolevei-step skolevei-step--active' : 'skolevei-step'}
              onClick={pickSchool}
            >
              <span className="skolevei-step__dot skolevei-step__dot--school">S</span>
              <span className="skolevei-step__label">{school ? 'Skole valgt' : 'Velg skole'}</span>
              {school && <span className="skolevei-step__redo">Velg på nytt</span>}
            </button>
          </div>

          {(home || school) && (
            <button type="button" className="skolevei-reset" onClick={resetAll}>Start på nytt</button>
          )}

          {bothPicked && loading && (
            <p className="skolevei-loading">Henter meldinger og ulykkesdata …</p>
          )}

          {bothPicked && !loading && result && (
            <div className="skolevei-result">
              <div className="skolevei-stats">
                <div className="skolevei-stat">
                  <strong>{formatMeters(result.routeLengthM)}</strong>
                  <span>rett linje</span>
                </div>
                <div className="skolevei-stat">
                  <strong>{result.matchedReports.length}</strong>
                  <span>{result.matchedReports.length === 1 ? 'melding' : 'meldinger'}</span>
                </div>
                <div className="skolevei-stat">
                  <strong>{result.accidentsUnavailable ? '–' : result.matchedAccidents.length}</strong>
                  <span>ulykker</span>
                </div>
              </div>

              {result.accidentsUnavailable && (
                <p className="skolevei-note">Ulykkesdata er ikke tilgjengelig akkurat nå. Meldinger under er ikke påvirket.</p>
              )}

              {result.matchedAccidents.length > 0 && (
                <div className="skolevei-section">
                  <h2 className="skolevei-section-title">Ulykker langs ruten</h2>

                  {result.accidentSeverityBreakdown.length > 0 && (
                    <ul className="skolevei-breakdown">
                      {result.accidentSeverityBreakdown.map((entry) => (
                        <li key={entry.severity} className="skolevei-breakdown__item">
                          <span className={`severity-dot severity-dot--${entry.severity}`} aria-hidden="true" />
                          <span className="skolevei-breakdown__label">{ACCIDENT_SEVERITY_META[entry.severity].label}</span>
                          <span className="skolevei-breakdown__count">{entry.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className="skolevei-accident-list">
                    {result.matchedAccidents
                      .slice()
                      .sort((a, b) => (
                        ACCIDENT_SEVERITY_ORDER.indexOf(normalizeAccidentSeverity(a.feature.properties?.severity))
                        - ACCIDENT_SEVERITY_ORDER.indexOf(normalizeAccidentSeverity(b.feature.properties?.severity))
                      ))
                      .map(({ feature, distanceM }) => {
                        const properties = feature.properties || {};
                        const severity = normalizeAccidentSeverity(properties.severity);
                        const key = properties.id || `${feature.geometry?.coordinates?.join(',')}-${properties.year || ''}`;
                        return (
                          <li key={key} className="skolevei-accident-item">
                            <span
                              className={`severity-pill severity-pill--${severity}`}
                              title={ACCIDENT_SEVERITY_META[severity].label}
                            >
                              {ACCIDENT_SEVERITY_META[severity].shortLabel}
                            </span>
                            <strong className="skolevei-accident-item__title">{accidentTypeLabel(properties)}</strong>
                            <span className="skolevei-accident-item__meta">
                              {formatMeters(distanceM)} fra ruten{properties.year ? ` · ${properties.year}` : ''}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              <div className="skolevei-section">
                {(result.categoryBreakdown.length > 0 || result.matchedReports.length > 0) && (
                  <h2 className="skolevei-section-title">Meldte farer</h2>
                )}

                {result.categoryBreakdown.length > 0 && (
                  <ul className="skolevei-breakdown">
                    {result.categoryBreakdown.map((entry) => (
                      <li key={entry.category} className="skolevei-breakdown__item">
                        <span className="skolevei-breakdown__glyph" dangerouslySetInnerHTML={{ __html: categoryGlyph(entry.category) }} />
                        <span className="skolevei-breakdown__label">{entry.category}</span>
                        <span className="skolevei-breakdown__count">{entry.count}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {result.matchedReports.length === 0 ? (
                  <p className="skolevei-empty">Ingen meldte farer funnet langs denne skoleveien. Bra tegn – men sjekk alltid selv også.</p>
                ) : (
                  <ul className="skolevei-report-list">
                    {result.matchedReports.map(({ feature, distanceM }) => {
                      const id = reportIdFromFeature(feature);
                      const properties = feature.properties || {};
                      const meta = reportStatusMeta(properties.status);
                      return (
                        <li key={id || `${feature.geometry?.coordinates?.join(',')}`} className="skolevei-report-item">
                          <Link href={id ? `/sak/${id}` : '#'} className="skolevei-report-item__link">
                            <span
                              className={`status-pill status-pill--${meta.key}`}
                              dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }}
                            />
                            <strong className="skolevei-report-item__title">{properties.category || 'Melding'}</strong>
                            <span className="skolevei-report-item__meta">
                              {formatMeters(distanceM)} fra ruten{properties.created_at ? ` · ${formatDate(properties.created_at)}` : ''}
                            </span>
                            {properties.description && (
                              <span className="skolevei-report-item__desc">{String(properties.description).slice(0, 140)}</span>
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
