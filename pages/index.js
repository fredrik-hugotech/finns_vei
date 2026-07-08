import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import Logo from '../components/Logo';
import ReportSheet from '../components/ReportSheet';
import CompetitionSheet from '../components/CompetitionSheet';
import TripTracker from '../components/TripTracker';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

export default function Home() {
  const mapApiRef = useRef(null);
  const [mode, setMode] = useState('browse'); // browse | pick | form | trip-pick
  const [pickedPoint, setPickedPoint] = useState(null);
  const [geoStatus, setGeoStatus] = useState('');
  const [showCompetitions, setShowCompetitions] = useState(false);
  const [competitionFocusId, setCompetitionFocusId] = useState(null);
  const [tripContext, setTripContext] = useState(null);
  const [message, setMessage] = useState('');

  const handleMapReady = useCallback((api) => {
    mapApiRef.current = api;
  }, []);

  const haptic = (ms = 8) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
  };

  const startPick = () => {
    haptic(10);
    setGeoStatus('');
    setMode('pick');
  };

  const confirmLocation = () => {
    const center = mapApiRef.current?.getCenter();
    if (!center) return;
    haptic(10);
    setPickedPoint(center);
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
  };

  const changeLocation = () => {
    setMode('pick');
  };

  const handleSubmitted = () => {
    mapApiRef.current?.refreshReports?.();
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
  const finishTrip = async ({ club, helmet, routeType, distanceM, durationS, cells, path }) => {
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
      const focusId = tripContext.competition.id;
      const km = (distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 2 });
      setTripContext(null);
      setMode('browse');
      setMessage(`Takk! ${km} km registrert.`);
      mapApiRef.current?.refreshReports?.();
      setCompetitionFocusId(focusId);
      setShowCompetitions(true);
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
        />

        <div className="app-topbar">
          <span className="app-brand"><Logo size="sm" /></span>
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
            mapApi={mapApiRef.current}
            onDone={finishTrip}
            onCancel={cancelTrip}
          />
        )}

        {mode === 'form' && pickedPoint && (
          <ReportSheet
            point={pickedPoint}
            onClose={closeSheet}
            onSubmitted={handleSubmitted}
            onChangeLocation={changeLocation}
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
