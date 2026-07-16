import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { categoryGlyph } from '../lib/reportCategoryGlyphs';
import { reportStatusMeta } from '../lib/reportStatusMeta';
import {
  haversineMeters,
  bboxStringAroundPoint,
  isReportWithinMaxAge,
  SJEKK_STED_RADIUS_M,
} from '../lib/pointRadiusFilter';

// mapbox-gl touches browser-only globals at import time, so — like every
// other page that embeds a map (pages/sykle.js, pages/index.js) — it's
// loaded client-only via next/dynamic.
const SjekkStedMap = dynamic(() => import('../components/SjekkStedMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

const ACCIDENT_FETCH_ZOOM = 15;

function reportIdFromFeature(properties = {}, feature = {}) {
  return properties.id || properties.report_id || properties.reportId || properties.uuid || feature.id || '';
}

function reportCategoryLabel(properties = {}) {
  if (properties.category) return properties.category;
  if (Array.isArray(properties.categories) && properties.categories.length) return properties.categories[0];
  return 'Melding';
}

function matchNearbyReports(geojson, point) {
  const features = geojson?.features || [];
  const matched = [];
  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lng, lat] = coords;
    const distanceM = haversineMeters(point.lat, point.lng, lat, lng);
    if (distanceM > SJEKK_STED_RADIUS_M) continue;
    const properties = feature.properties || {};
    if (!isReportWithinMaxAge(properties.created_at)) continue;
    matched.push({
      id: reportIdFromFeature(properties, feature),
      category: reportCategoryLabel(properties),
      status: properties.status,
      description: properties.description || '',
      supportCount: Number(properties.support_count || 0),
      distanceM: Math.round(distanceM),
    });
  }
  matched.sort((a, b) => a.distanceM - b.distanceM);
  return matched;
}

function matchNearbyAccidents(geojson, point) {
  const features = geojson?.features || [];
  const matched = [];
  for (const feature of features) {
    if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue;
    const [lng, lat] = feature.geometry.coordinates;
    const distanceM = haversineMeters(point.lat, point.lng, lat, lng);
    if (distanceM > SJEKK_STED_RADIUS_M) continue;
    const properties = feature.properties || {};
    matched.push({
      year: properties.year || (properties.date ? String(properties.date).slice(0, 4) : ''),
      type: properties.accident_type || '',
      severity: properties.severity || '',
      label: properties.label || '',
      distanceM: Math.round(distanceM),
    });
  }
  matched.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  return matched;
}

function compactText(value = '', maxLength = 90) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

export default function SjekkSted() {
  const [point, setPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState(null);
  const [reportsUnavailable, setReportsUnavailable] = useState(false);
  const [accidents, setAccidents] = useState(null);
  const [accidentsUnavailable, setAccidentsUnavailable] = useState(false);
  const requestIdRef = useRef(0);

  const checkPoint = useCallback((nextPoint) => {
    const requestId = (requestIdRef.current += 1);
    setPoint(nextPoint);
    setLoading(true);
    setReports(null);
    setReportsUnavailable(false);
    setAccidents(null);
    setAccidentsUnavailable(false);

    const reportsPromise = fetch('/api/reports')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('reports_failed'))))
      .then((geojson) => {
        if (requestId !== requestIdRef.current) return;
        setReports(matchNearbyReports(geojson, nextPoint));
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setReportsUnavailable(true);
      });

    const bbox = bboxStringAroundPoint(nextPoint.lat, nextPoint.lng, SJEKK_STED_RADIUS_M);
    const accidentsPromise = fetch(`/api/nvdb/layer?type=accidents&bbox=${encodeURIComponent(bbox)}&zoom=${ACCIDENT_FETCH_ZOOM}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('accidents_failed'))))
      .then((geojson) => {
        if (requestId !== requestIdRef.current) return;
        if (geojson?.meta?.degraded) {
          setAccidentsUnavailable(true);
          return;
        }
        setAccidents(matchNearbyAccidents(geojson, nextPoint));
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setAccidentsUnavailable(true);
      });

    Promise.allSettled([reportsPromise, accidentsPromise]).then(() => {
      if (requestId === requestIdRef.current) setLoading(false);
    });
  }, []);

  const reset = () => {
    requestIdRef.current += 1; // invalidate any in-flight fetches
    setPoint(null);
    setLoading(false);
    setReports(null);
    setReportsUnavailable(false);
    setAccidents(null);
    setAccidentsUnavailable(false);
  };

  const reportsReady = reports !== null && !reportsUnavailable;
  const accidentsReady = accidents !== null && !accidentsUnavailable;
  const bothEmpty = reportsReady && accidentsReady && reports.length === 0 && accidents.length === 0;

  return (
    <>
      <Head>
        <title>Finns Fairway – Sjekk et sted</title>
        <meta name="description" content="Trykk på et punkt på kartet og få en rask oversikt over meldte farer og trafikkulykker i nærheten." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
      </Head>
      <main className="sjekk-app">
        <SjekkStedMap point={point} onPick={checkPoint} className="map-canvas" />

        <div className="sjekk-topbar">
          <Link href="/" className="sjekk-back" aria-label="Tilbake">
            <Icon name="pin" size={18} />
            <span>Finns Fairway</span>
          </Link>
          {!point && (
            <p className="sjekk-hint">Trykk et sted på kartet for å sjekke det.</p>
          )}
        </div>

        {point && (
          <section className="sjekk-sheet" aria-live="polite">
            <div className="sjekk-sheet__head">
              <Logo size="sm" />
              <h1 className="sjekk-sheet__title">Sjekk et sted</h1>
              <p className="sjekk-sheet__radius">Innenfor {SJEKK_STED_RADIUS_M} m av punktet du trykket</p>
            </div>

            {loading && <p className="sjekk-loading">Henter meldinger og ulykkesdata …</p>}

            {!loading && bothEmpty && (
              <p className="sjekk-empty">Ingen meldte farer eller registrerte ulykker innenfor {SJEKK_STED_RADIUS_M} m.</p>
            )}

            {!loading && (
              <div className="sjekk-groups">
                <div className="sjekk-group">
                  <h2 className="sjekk-group__title">
                    Meldte farer
                    {reportsReady && <span className="sjekk-group__count">{reports.length}</span>}
                  </h2>
                  {reportsUnavailable && <p className="sjekk-muted">Meldinger utilgjengelig akkurat nå.</p>}
                  {reportsReady && reports.length === 0 && <p className="sjekk-muted">Ingen meldte farer i nærheten.</p>}
                  {reportsReady && reports.length > 0 && (
                    <ul className="sjekk-list">
                      {reports.slice(0, 8).map((report, index) => {
                        const meta = reportStatusMeta(report.status);
                        return (
                          <li className="sjekk-report" key={report.id || index}>
                            <span className="sjekk-report__glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: categoryGlyph(report.category) }} />
                            <div className="sjekk-report__body">
                              <div className="sjekk-report__head">
                                <strong>{report.category}</strong>
                                <span
                                  className={`status-pill status-pill--${meta.key}`}
                                  dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }}
                                />
                              </div>
                              {report.description && <p className="sjekk-report__desc">{compactText(report.description)}</p>}
                              <span className="sjekk-report__meta">{report.distanceM} m unna</span>
                              {report.id && <Link href={`/sak/${report.id}`} className="sjekk-report__link">Se saken ›</Link>}
                            </div>
                          </li>
                        );
                      })}
                      {reports.length > 8 && <li className="sjekk-muted sjekk-more">+{reports.length - 8} flere</li>}
                    </ul>
                  )}
                </div>

                <div className="sjekk-group">
                  <h2 className="sjekk-group__title">
                    Trafikkulykker (NVDB)
                    {accidentsReady && <span className="sjekk-group__count">{accidents.length}</span>}
                  </h2>
                  {accidentsUnavailable && <p className="sjekk-muted">Ulykkesdata utilgjengelig akkurat nå.</p>}
                  {accidentsReady && accidents.length === 0 && <p className="sjekk-muted">Ingen registrerte ulykker i nærheten.</p>}
                  {accidentsReady && accidents.length > 0 && (
                    <ul className="sjekk-list">
                      {accidents.slice(0, 8).map((accident, index) => (
                        <li className="sjekk-accident" key={index}>
                          <strong>{[accident.year, accident.type || 'Ulykke'].filter(Boolean).join(' · ')}</strong>
                          {accident.severity && <span className="sjekk-accident__severity">{accident.severity}</span>}
                          <span className="sjekk-report__meta">{accident.distanceM} m unna</span>
                        </li>
                      ))}
                      {accidents.length > 8 && <li className="sjekk-muted sjekk-more">+{accidents.length - 8} flere</li>}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <button type="button" className="big-button big-button--primary sjekk-reset" onClick={reset}>
              Sjekk et nytt sted
            </button>
          </section>
        )}
      </main>
    </>
  );
}
