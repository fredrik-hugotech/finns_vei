import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { RISK_LEVEL_LABELS } from '../lib/safeRoute';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

function haptic(ms = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}

function formatKm(distanceM) {
  const km = Number(distanceM || 0) / 1000;
  return km < 1 ? `${Math.round(distanceM)} m` : `${km.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} km`;
}

function formatMinutes(durationS) {
  const minutes = Math.round(Number(durationS || 0) / 60);
  return minutes < 1 ? '<1 min' : `${minutes} min`;
}

function buildRoutesGeoJson(routes, selectedId) {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      geometry: route.geometry,
      properties: { id: route.id, recommended: route.id === selectedId, riskLevel: route.riskLevel },
    })),
  };
}

export default function TryggesteSkolevei() {
  const mapApiRef = useRef(null);
  const handleMapReady = useCallback((api) => { mapApiRef.current = api; }, []);

  // phase: pick-start -> pick-dest -> loading -> result | error
  const [phase, setPhase] = useState('pick-start');
  const [travelMode, setTravelMode] = useState('sykkel'); // sykkel | gange
  const [startPoint, setStartPoint] = useState(null);
  const [destPoint, setDestPoint] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [geoStatus, setGeoStatus] = useState('');

  const runSearch = useCallback(async (start, destination, mode) => {
    setPhase('loading');
    setErrorMessage('');
    try {
      const response = await fetch('/api/safe-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, destination, mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Kunne ikke beregne ruteforslag.');
      }
      if (!data.routes || !data.routes.length) {
        setErrorMessage('Fant ingen rute mellom disse to punktene. Prøv andre punkter.');
        setPhase('error');
        return;
      }
      setRoutes(data.routes);
      setMeta(data.meta || null);
      setSelectedId(data.recommendedId || data.routes[0].id);
      setPhase('result');
    } catch (error) {
      setErrorMessage(error.message || 'Noe gikk galt. Prøv igjen.');
      setPhase('error');
    }
  }, []);

  const confirmStart = () => {
    const center = mapApiRef.current?.getCenter();
    if (!center) return;
    haptic(10);
    setStartPoint(center);
    mapApiRef.current?.setSafeRouteStart(center);
    setGeoStatus('');
    setPhase('pick-dest');
  };

  const confirmDestination = () => {
    const center = mapApiRef.current?.getCenter();
    if (!center || !startPoint) return;
    haptic(10);
    setDestPoint(center);
    mapApiRef.current?.setSafeRouteDestination(center);
    setGeoStatus('');
    runSearch(startPoint, center, travelMode);
  };

  const backToStart = () => {
    setPhase('pick-start');
  };

  const reset = () => {
    mapApiRef.current?.clearSafeRoutes();
    setStartPoint(null);
    setDestPoint(null);
    setRoutes([]);
    setSelectedId(null);
    setMeta(null);
    setErrorMessage('');
    setGeoStatus('');
    setPhase('pick-start');
  };

  const retrySearch = () => {
    if (startPoint && destPoint) {
      runSearch(startPoint, destPoint, travelMode);
    } else {
      reset();
    }
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

  // Draw/restyle the candidate routes whenever the result set or the
  // highlighted route changes.
  useEffect(() => {
    const api = mapApiRef.current;
    if (!api || phase !== 'result' || !routes.length) return;
    api.showSafeRoutes(buildRoutesGeoJson(routes, selectedId));
  }, [routes, selectedId, phase]);

  // Fit the map to the new result set only once, when it first arrives — not
  // on every card tap (that would re-zoom on each selection, which feels
  // jumpy while comparing options).
  useEffect(() => {
    const api = mapApiRef.current;
    if (!api || phase !== 'result' || !routes.length) return;
    api.fitSafeRoutes(buildRoutesGeoJson(routes, selectedId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);

  const isPicking = phase === 'pick-start' || phase === 'pick-dest';

  return (
    <>
      <Head>
        <title>Tryggeste skolevei – Finns Fairway</title>
        <meta name="description" content="Velg to punkter, f.eks. hjemme og skolen, og se hvilken gå- eller sykkelrute som ligger lengst unna meldte farer og NVDB-ulykker." />
        <meta name="robots" content="noindex" />
      </Head>
      <main className="app-shell safe-route-shell">
        <ReportMap
          className="map-canvas"
          showReports
          pickMode={isPicking}
          onMapReady={handleMapReady}
        />

        <div className="app-topbar">
          <Link href="/" className="app-menu__btn safe-route-back" aria-label="Til forsiden">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          <span className="app-brand"><Logo size="sm" /></span>
        </div>

        {phase === 'pick-start' && (
          <>
            <div className="pick-hint safe-route-hint">
              <Icon name="pin" size={15} /> Dra kartet til startpunktet
            </div>
            <div className="pick-bar safe-route-pick-bar">
              <div className="safe-route-mode-toggle" role="group" aria-label="Fremkomstmiddel">
                <button type="button" className={travelMode === 'sykkel' ? 'safe-route-mode-btn safe-route-mode-btn--active' : 'safe-route-mode-btn'} onClick={() => setTravelMode('sykkel')}>
                  <Icon name="bike" size={16} /> Sykkel
                </button>
                <button type="button" className={travelMode === 'gange' ? 'safe-route-mode-btn safe-route-mode-btn--active' : 'safe-route-mode-btn'} onClick={() => setTravelMode('gange')}>
                  <Icon name="activity" size={16} /> Gange
                </button>
              </div>
              <button type="button" className="big-button big-button--primary" onClick={confirmStart}>Velg startpunkt</button>
              <button type="button" className="big-button big-button--secondary" onClick={useMyPosition}>Min posisjon</button>
              {geoStatus && <p className="pick-geo-status">{geoStatus}</p>}
            </div>
          </>
        )}

        {phase === 'pick-dest' && (
          <>
            <div className="pick-hint safe-route-hint">
              <Icon name="school" size={15} /> Dra kartet til målet (f.eks. skolen)
            </div>
            <div className="pick-bar safe-route-pick-bar">
              <button type="button" className="big-button big-button--primary" onClick={confirmDestination}>Velg mål</button>
              <div className="pick-bar__row">
                <button type="button" className="big-button big-button--secondary" onClick={backToStart}>Bytt startpunkt</button>
                <button type="button" className="big-button big-button--secondary" onClick={useMyPosition}>Min posisjon</button>
              </div>
              {geoStatus && <p className="pick-geo-status">{geoStatus}</p>}
            </div>
          </>
        )}

        {phase === 'loading' && (
          <div className="safe-route-loading" role="status">
            <span className="safe-route-loading__spinner" aria-hidden="true" />
            Beregner tryggeste rute …
          </div>
        )}

        {phase === 'error' && (
          <div className="pick-bar safe-route-pick-bar">
            <div className="notice notice--error">{errorMessage}</div>
            <div className="pick-bar__row">
              <button type="button" className="big-button big-button--secondary" onClick={reset}>Start på nytt</button>
              <button type="button" className="big-button big-button--primary" onClick={retrySearch}>Prøv igjen</button>
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className="safe-route-sheet">
            <div className="safe-route-sheet__head">
              <strong><Icon name="route" size={17} /> {routes.length === 1 ? '1 ruteforslag' : `${routes.length} ruteforslag`}</strong>
              <button type="button" className="safe-route-sheet__reset" onClick={reset}>Nytt søk</button>
            </div>

            {meta && !meta.nvdbAvailable && (
              <p className="safe-route-note">NVDB-ulykkesdata var ikke tilgjengelig akkurat nå — rangeringen bruker kun meldte farer.</p>
            )}
            {meta && !meta.hazardSignalAvailable && (
              <p className="safe-route-note">Ingen meldte farer registrert i dette området ennå.</p>
            )}

            <ul className="safe-route-list">
              {routes.map((route, index) => {
                const selected = route.id === selectedId;
                return (
                  <li key={route.id}>
                    <button
                      type="button"
                      className={selected ? 'safe-route-card safe-route-card--selected' : 'safe-route-card'}
                      onClick={() => { haptic(6); setSelectedId(route.id); }}
                      aria-pressed={selected}
                    >
                      <div className="safe-route-card__top">
                        <span className="safe-route-card__title">
                          {route.recommended ? 'Anbefalt rute' : `Alternativ ${index + 1}`}
                        </span>
                        <span className={`safe-route-badge safe-route-badge--${route.riskLevel}`}>
                          {RISK_LEVEL_LABELS[route.riskLevel] || 'Ukjent risiko'}
                        </span>
                      </div>
                      <div className="safe-route-card__stats">
                        <span><Icon name="pin" size={14} /> {formatKm(route.distanceM)}</span>
                        <span><Icon name="clock" size={14} /> {formatMinutes(route.durationS)}</span>
                      </div>
                      <p className="safe-route-card__reason">
                        {route.hazardCount === 0 && route.accidentCount === 0
                          ? 'Ingen kjente farer eller ulykker nær ruten.'
                          : `${route.hazardCount} meldte ${route.hazardCount === 1 ? 'fare' : 'farer'} · ${route.accidentCount} NVDB-${route.accidentCount === 1 ? 'ulykke' : 'ulykker'} nær ruten.`}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="safe-route-disclaimer">
              Risikovurderingen er et estimat basert på meldte farer og NVDB-ulykkesdata nær ruten — ikke en garanti. Vurder alltid selv, sammen med barnet.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
