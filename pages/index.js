import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import Logo from '../components/Logo';
import ReportSheet from '../components/ReportSheet';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

export default function Home() {
  const mapApiRef = useRef(null);
  const [mode, setMode] = useState('browse'); // browse | pick | form
  const [pickedPoint, setPickedPoint] = useState(null);
  const [geoStatus, setGeoStatus] = useState('');

  const handleMapReady = useCallback((api) => {
    mapApiRef.current = api;
  }, []);

  const startPick = () => {
    setGeoStatus('');
    setMode('pick');
  };

  const confirmLocation = () => {
    const center = mapApiRef.current?.getCenter();
    if (!center) return;
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
        </div>

        {mode === 'browse' && (
          <button type="button" className="fab-meld" onClick={startPick}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            Meld fra
          </button>
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

        {mode === 'form' && pickedPoint && (
          <ReportSheet
            point={pickedPoint}
            onClose={closeSheet}
            onSubmitted={handleSubmitted}
            onChangeLocation={changeLocation}
          />
        )}
      </main>
    </>
  );
}
