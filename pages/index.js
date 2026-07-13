import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo';
import ReportSheet from '../components/ReportSheet';
import CompetitionSheet from '../components/CompetitionSheet';
import TripTracker from '../components/TripTracker';
import TripCelebration from '../components/TripCelebration';
import { NEARBY_REPORT_RADIUS_M } from '../lib/config';
import { QUEUE_CHANGED_EVENT, flushQueue, getPendingCount } from '../lib/offlineReportQueue';
import { isDarkNow, reportWeatherHint } from '../lib/weather';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

export default function Home() {
  const mapApiRef = useRef(null);
  // Bumped on every updateWeatherHint() call so an in-flight /api/weather
  // lookup that resolves after a newer one (out-of-order network response
  // during rapid panning) can detect it's stale and be ignored — same
  // request-id guard pattern as ReportMap's checkAccidentsNear().
  const weatherCheckIdRef = useRef(0);
  const [mode, setMode] = useState('browse'); // browse | pick | form | trip-pick
  const [pickedPoint, setPickedPoint] = useState(null);
  const [geoStatus, setGeoStatus] = useState('');
  const [nearbyNotice, setNearbyNotice] = useState(null); // { count, nearestId } | null
  const [accidentNotice, setAccidentNotice] = useState(null); // { count } | null
  const [weatherHint, setWeatherHint] = useState(null); // { text, icy, dark, kind } | null
  const [showCompetitions, setShowCompetitions] = useState(false);
  const [competitionFocusId, setCompetitionFocusId] = useState(null);
  const [tripContext, setTripContext] = useState(null);
  const [tripResult, setTripResult] = useState(null); // { km, mode, weatherKind }
  const [message, setMessage] = useState('');
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  // Offline report queue: try to resend anything left over from a dead-zone
  // submission as soon as the app loads (if we're already online) and again
  // whenever the browser regains connectivity. No service worker background
  // sync in this first version — just best-effort on load/online, which
  // covers the common case of reopening the app once back in coverage.
  useEffect(() => {
    const refreshPendingCount = () => setPendingQueueCount(getPendingCount());
    refreshPendingCount();

    const tryFlush = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushQueue().then(refreshPendingCount).catch(refreshPendingCount);
    };

    tryFlush();
    window.addEventListener('online', tryFlush);
    window.addEventListener(QUEUE_CHANGED_EVENT, refreshPendingCount);
    return () => {
      window.removeEventListener('online', tryFlush);
      window.removeEventListener(QUEUE_CHANGED_EVENT, refreshPendingCount);
    };
  }, []);

  const handleMapReady = useCallback((api) => {
    mapApiRef.current = api;
  }, []);

  const haptic = (ms = 8) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
  };

  // Nearby-report awareness during pick mode: reuses the map's already-loaded
  // report data (same CASE_GROUP-adjacent radius as the case popup's "Saker
  // innen X m" stat) so a reporter dragging the crosshair over a spot that
  // already has open reports gets a chance to support that case instead of
  // filing a near-duplicate. Non-blocking — "Velg dette stedet" always works.
  const updateNearbyNotice = useCallback((center) => {
    if (!center) {
      setNearbyNotice(null);
      return;
    }
    const nearby = mapApiRef.current?.findNearbyReports?.(center, NEARBY_REPORT_RADIUS_M) || [];
    setNearbyNotice(nearby.length ? { count: nearby.length, nearestId: nearby[0].id } : null);
  }, []);

  // Accident-context hint during pick mode: an async NVDB lookup (same radius
  // as the case popup's accident list, for consistency) so a reporter
  // dragging the crosshair near a spot with a history of registered
  // accidents gets a heads-up before they reach the category step — useful
  // context for picking e.g. "Utrygt kryss" or "Høy fart" over "Annet".
  // Purely informational: never auto-selects a category and never blocks
  // "Velg dette stedet". checkAccidentsNear() itself never rejects and
  // resolves `null` for stale (out-of-order) responses, so a slow or failed
  // NVDB fetch just leaves the hint as-is/empty — no error state here.
  const updateAccidentHint = useCallback((center) => {
    if (!center) {
      setAccidentNotice(null);
      return;
    }
    mapApiRef.current?.checkAccidentsNear?.(center, NEARBY_REPORT_RADIUS_M)?.then((accidents) => {
      if (accidents === null) return; // stale response — a newer request already decided
      setAccidentNotice(accidents.length ? { count: accidents.length } : null);
    });
  }, []);

  // "Føre var" weather-context hint during pick mode: looks up current
  // conditions at the crosshair's location via our MET Norway proxy
  // (pages/api/weather.js) and flags hazardous conditions — icy (near-/
  // sub-zero), heavy rain/snow/sleet, or simply dark right now — as a small
  // informational note. Purely informational: never auto-selects a category
  // and never blocks "Velg dette stedet". A slow or failed lookup just
  // leaves the hint as-is/empty — the fetch below never rejects into an
  // error state, and out-of-order responses are dropped via the same
  // request-id guard ReportMap's checkAccidentsNear() uses.
  const updateWeatherHint = useCallback((center) => {
    if (!center) {
      setWeatherHint(null);
      return;
    }
    const requestId = (weatherCheckIdRef.current += 1);
    fetch(`/api/weather?lat=${center.lat.toFixed(4)}&lon=${center.lng.toFixed(4)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((weather) => {
        if (requestId !== weatherCheckIdRef.current) return; // stale response
        if (!weather || !weather.ok) {
          setWeatherHint(null);
          return;
        }
        setWeatherHint(reportWeatherHint({
          tempC: weather.tempC,
          precipMm: weather.precipMm,
          kind: weather.kind,
          isPrecip: weather.isPrecip,
          dark: isDarkNow(),
        }));
      })
      .catch(() => {
        if (requestId === weatherCheckIdRef.current) setWeatherHint(null);
      });
  }, []);

  // Wired to the map's single onPickCenterChange callback so the
  // nearby-duplicate notice, the accident hint and the weather hint all
  // refresh together whenever the pick-mode crosshair settles on a new
  // point.
  const handlePickCenterChange = useCallback((center) => {
    updateNearbyNotice(center);
    updateAccidentHint(center);
    updateWeatherHint(center);
  }, [updateNearbyNotice, updateAccidentHint, updateWeatherHint]);

  const startPick = () => {
    haptic(10);
    setGeoStatus('');
    setMode('pick');
    handlePickCenterChange(mapApiRef.current?.getCenter());
  };

  const confirmLocation = () => {
    const center = mapApiRef.current?.getCenter();
    if (!center) return;
    haptic(10);
    setPickedPoint(center);
    setNearbyNotice(null);
    setAccidentNotice(null);
    setWeatherHint(null);
    setMode('form');
  };

  const useMyPosition = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Nettleseren støtter ikke posisjon.');
      return;
    }
    setGeoStatus('Henter posisjon …');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapApiRef.current?.flyTo({ lng: position.coords.longitude, lat: position.coords.latitude });
        setGeoStatus('');
      },
      () => setGeoStatus('Fikk ikke tilgang til posisjon. Dra kartet i stedet.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const closeSheet = () => {
    setMode('browse');
    setPickedPoint(null);
    setNearbyNotice(null);
    setAccidentNotice(null);
    setWeatherHint(null);
  };

  const changeLocation = () => {
    setMode('pick');
    handlePickCenterChange(mapApiRef.current?.getCenter());
  };

  // "Se og støtt i stedet" — abandon the pick flow and open the nearest
  // existing case's popup so the citizen can support it instead of filing a
  // near-duplicate report.
  const viewNearestExisting = () => {
    if (!nearbyNotice?.nearestId) return;
    haptic(10);
    const opened = mapApiRef.current?.openCaseById?.(nearbyNotice.nearestId);
    if (opened) {
      setNearbyNotice(null);
      setMode('browse');
    }
  };

  const handleSubmitted = () => {
    mapApiRef.current?.refreshReports?.();
  };

  // After sending: close the form, refresh so the new pin exists, then fly to
  // it and open its case card so the reporter sees exactly how it looks.
  const handleViewCase = async (id) => {
    setMode('browse');
    setPickedPoint(null);
    setNearbyNotice(null);
    setAccidentNotice(null);
    setWeatherHint(null);
    if (!id) return;
    const tryOpen = () => mapApiRef.current?.openCaseById?.(id);
    try { await mapApiRef.current?.refreshReports?.(); } catch (_e) { /* ignore */ }
    if (tryOpen()) return;
    // The just-inserted report may not be in the freshly-read set yet — retry once.
    setTimeout(async () => {
      try { await mapApiRef.current?.refreshReports?.(); } catch (_e) { /* ignore */ }
      tryOpen();
    }, 800);
  };

  // --- Competitions (public: standings only — the density map is internal) ---
  const openCompetitions = () => {
    haptic(10);
    setCompetitionFocusId(null);
    setShowCompetitions(true);
  };

  const closeCompetitions = () => {
    setCompetitionFocusId(null);
    setShowCompetitions(false);
  };

  const tripToken = () => {
    if (typeof window === 'undefined') return null;
    const key = 'finns-vei-trip-token';
    let token = window.localStorage.getItem(key);
    if (!token) {
      token = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem(key, token);
    }
    return token;
  };

  const startTrip = ({ competition, club, helmet, routeType, mode }) => {
    haptic(12);
    setTripContext({ competition, club, helmet, routeType: routeType || 'fritid', mode: mode || 'sykkel' });
    setShowCompetitions(false);
    mapApiRef.current?.clearCompetitionTrips?.();
    setMode('trip-track');
  };

  // Called by TripTracker on stop — it has already clipped + snapped on-device,
  // so here we just persist the anonymous cells, distance and duration.
  const finishTrip = async ({ club, helmet, routeType, distanceM, durationS, cells, path, weather }) => {
    if (!tripContext) return;
    try {
      const response = await fetch('/api/bike-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitionId: tripContext.competition.id,
          club,
          helmet,
          routeType,
          mode: tripContext.mode || 'sykkel',
          weather,
          distanceM,
          durationS,
          cells,
          path,
          tripToken: tripToken(),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Kunne ikke lagre sykkelturen');
      }
      haptic([10, 40, 14]);
      const km = (distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 2 });
      // Celebrate with the child instead of dropping them into the standings.
      setTripResult({ km, mode: tripContext.mode || 'sykkel', weatherKind: weather?.kind || null });
      setTripContext(null);
      setMode('trip-done');
      mapApiRef.current?.refreshReports?.();
    } catch (error) {
      setMessage(error.message || 'Noe gikk galt.');
      setTripContext(null);
      setMode('browse');
    }
  };

  const cancelTrip = () => {
    setTripContext(null);
    setMode('browse');
  };

  return (
    <>
      <Head>
        <title>Finns Fairway</title>
        <meta name="description" content="For en trygg og aktiv oppvekst. Se kart over utrygge steder i trafikken, eller meld fra." />
      </Head>
      <main className="app-shell">
        <ReportMap
          className="map-canvas"
          enableNvdbLayers
          pickMode={mode === 'pick'}
          pinnedPoint={mode === 'form' ? pickedPoint : null}
          onMapReady={handleMapReady}
          onPickCenterChange={handlePickCenterChange}
        />

        <div className="app-topbar">
          <span className="app-brand"><Logo size="sm" /></span>
          {pendingQueueCount > 0 && (
            <a
              className="offline-queue-badge"
              href="/mine-meldinger"
              role="status"
              title="Meldinger lagret på denne enheten som ikke er sendt ennå"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></svg>
              {pendingQueueCount === 1 ? '1 venter på å bli sendt' : `${pendingQueueCount} venter på å bli sendt`}
            </a>
          )}
          <div className="app-topbar__links">
            <a className="app-staff-link" href="/mine-meldinger">Mine meldinger</a>
            <a className="app-staff-link" href="/backoffice">Admin</a>
          </div>
        </div>

        {mode === 'browse' && (
          <>
            <button type="button" className="fab-konk" onClick={openCompetitions} aria-label="Konkurranser">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" />
                <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
              </svg>
            </button>
            <button type="button" className="fab-meld" onClick={startPick}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              Meld fra
            </button>
          </>
        )}

        {mode === 'pick' && (
          <>
            <div className="pick-hint">Dra kartet til stedet det gjelder</div>
            <div className="pick-bar">
              {nearbyNotice && (
                <div className="pick-nearby-notice">
                  <p className="pick-nearby-notice__text">
                    {nearbyNotice.count === 1
                      ? 'Én melding allerede nær dette punktet'
                      : `${nearbyNotice.count} meldinger allerede nær dette punktet`}
                  </p>
                  <button type="button" className="pick-nearby-notice__action" onClick={viewNearestExisting}>Se og støtt i stedet</button>
                </div>
              )}
              {accidentNotice && (
                <div className="pick-accident-notice">
                  <svg className="pick-accident-notice__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  </svg>
                  <p className="pick-accident-notice__text">
                    {accidentNotice.count === 1
                      ? 'Én ulykke registrert nær dette punktet siste årene'
                      : `${accidentNotice.count} ulykker registrert nær dette punktet siste årene`}
                  </p>
                </div>
              )}
              {weatherHint && (
                <div className="pick-weather-notice">
                  <svg className="pick-weather-notice__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4-1.9A4 4 0 0 0 6 16" />
                    <path d="M8 20.5v.01M12 21.5v.01M16 20.5v.01" />
                  </svg>
                  <p className="pick-weather-notice__text">{weatherHint.text}</p>
                </div>
              )}
              <button type="button" className="big-button big-button--primary pick-bar__confirm" onClick={confirmLocation}>Velg dette stedet</button>
              <div className="pick-bar__row">
                <button type="button" className="big-button big-button--secondary" onClick={closeSheet}>Avbryt</button>
                <button type="button" className="big-button big-button--secondary" onClick={useMyPosition}>Min posisjon</button>
              </div>
              {geoStatus && <p className="pick-geo-status">{geoStatus}</p>}
            </div>
          </>
        )}

        {mode === 'trip-track' && tripContext && (
          <TripTracker
            club={tripContext.club}
            helmet={tripContext.helmet}
            routeType={tripContext.routeType}
            mode={tripContext.mode}
            mapApi={mapApiRef.current}
            onDone={finishTrip}
            onCancel={cancelTrip}
          />
        )}

        {mode === 'trip-done' && tripResult && (
          <TripCelebration
            km={tripResult.km}
            mode={tripResult.mode}
            weatherKind={tripResult.weatherKind}
            onDone={() => { setTripResult(null); setMode('browse'); }}
          />
        )}

        {mode === 'form' && pickedPoint && (
          <ReportSheet
            point={pickedPoint}
            onClose={closeSheet}
            onSubmitted={handleSubmitted}
            onChangeLocation={changeLocation}
            onViewCase={handleViewCase}
          />
        )}

        {showCompetitions && (
          <CompetitionSheet
            initialCompetitionId={competitionFocusId}
            onClose={closeCompetitions}
            onPickStart={startTrip}
          />
        )}

        {message && (
          <div className="app-toast" role="status" onClick={() => setMessage('')}>{message}</div>
        )}
      </main>
    </>
  );
}
