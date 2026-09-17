import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from '../components/Logo';
import Icon from '../components/Icon';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

// /demo — presentation page for a DEMO competition: how a school-run /
// training-run competition builds up a picture of where children cycle and
// walk. Reads /api/demo/spor, which only ever serves competitions flagged
// "demo" (synthetic routes), so this page can be public and shared freely.
//
// Two views: "Turer" draws every trip as its own club-coloured line (with a
// replay that adds them in the order they were logged), "Tetthet" shows the
// aggregated density the municipality actually uses.
const RANK_CLASS = ['comp-row__rank--gold', 'comp-row__rank--silver', 'comp-row__rank--bronze'];
const REPLAY_MS = 24000;

const fmtKm = (m) => ((Number(m) || 0) / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 0 });
const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' });
};

function tripsToGeoJson(trips) {
  return {
    type: 'FeatureCollection',
    features: trips.map((t, i) => ({
      type: 'Feature',
      properties: { color: t.color, club: t.club, mode: t.mode, i },
      geometry: { type: 'LineString', coordinates: t.path },
    })),
  };
}

export default function Demo() {
  const [mapApi, setMapApi] = useState(null);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Henter …');
  const [view, setView] = useState('tetthet'); // tetthet | turer
  const [mode, setMode] = useState(''); // '' | sykkel | gange
  const [replay, setReplay] = useState(null); // { index, running } | null
  const [panelOpen, setPanelOpen] = useState(true);
  // Layers. The demo starts with only real reported cases on the map; trips
  // (heat map / per club), NVDB accidents (fetched at zoom >= 12) and the club
  // venues are switched on one by one while presenting.
  const [layers, setLayers] = useState({ turer: false, saker: true, ulykker: false, anlegg: false });
  const fittedRef = useRef(false);
  const timerRef = useRef(null);

  const load = useCallback(async (modeFilter) => {
    try {
      const id = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null;
      const params = new URLSearchParams();
      if (id) params.set('id', id);
      if (modeFilter) params.set('mode', modeFilter);
      const r = await fetch(`/api/demo/spor${params.toString() ? `?${params}` : ''}`);
      if (!r.ok) { setStatus(r.status === 404 ? 'Fant ingen demo-konkurranse.' : 'Kunne ikke hente demo-data.'); return; }
      setData(await r.json());
      setStatus('');
    } catch (_e) {
      setStatus('Kunne ikke hente demo-data.');
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const trips = useMemo(() => {
    const all = data?.trips || [];
    return mode ? all.filter((t) => t.mode === mode) : all;
  }, [data, mode]);

  const allGeo = useMemo(() => tripsToGeoJson(trips), [trips]);

  // Draw whatever the current view/filter/replay says, once map + data exist.
  useEffect(() => {
    if (!mapApi || !data) return;
    const opts = { keepReports: true };
    if (!layers.turer) {
      mapApi.clearRouteLines?.(opts);
      mapApi.clearHeatLines?.(opts);
      return;
    }
    if (view === 'tetthet') {
      mapApi.clearRouteLines?.(opts);
      mapApi.showHeatLines?.(data.geojson, opts);
    } else {
      mapApi.clearHeatLines?.(opts);
      const shown = replay ? tripsToGeoJson(trips.slice(0, replay.index)) : allGeo;
      mapApi.showRouteLines?.(shown, opts);
    }
    if (!fittedRef.current && allGeo.features.length) {
      fittedRef.current = true;
      mapApi.fitCompetition?.(allGeo);
    }
  }, [mapApi, data, view, replay, trips, allGeo, layers.turer]);

  // Context layers follow the toggles.
  useEffect(() => {
    if (!mapApi) return;
    mapApi.setReportsVisible?.(layers.saker);
    mapApi.setAccidentsVisible?.(layers.ulykker);
    mapApi.showVenues?.(layers.anlegg ? (data?.venues || []) : []);
  }, [mapApi, data, layers]);
  const toggleLayer = (key) => {
    if (key === 'turer' && layers.turer) stopReplayRef.current?.();
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };
  const stopReplayRef = useRef(null);

  // Replay: add trips in logged order over ~REPLAY_MS.
  const startReplay = () => {
    if (!trips.length) return;
    clearInterval(timerRef.current);
    setLayers((l) => ({ ...l, turer: true }));
    setView('turer');
    const stepMs = Math.max(30, Math.floor(REPLAY_MS / trips.length));
    setReplay({ index: 0, running: true });
    timerRef.current = setInterval(() => {
      setReplay((r) => {
        if (!r) return r;
        const next = r.index + 1;
        if (next >= trips.length) { clearInterval(timerRef.current); return { index: trips.length, running: false }; }
        return { index: next, running: true };
      });
    }, stepMs);
  };
  const stopReplay = () => { clearInterval(timerRef.current); setReplay(null); };
  stopReplayRef.current = stopReplay;
  useEffect(() => () => clearInterval(timerRef.current), []);

  const changeMode = (next) => {
    stopReplay();
    setMode(next);
    load(next); // density geojson is filtered server-side
  };

  const shownTrips = replay ? trips.slice(0, replay.index) : trips;
  const shownKm = shownTrips.reduce((s, t) => s + (t.distanceM || 0), 0);
  const lastShown = shownTrips[shownTrips.length - 1];
  const totals = data?.totals;
  const helmetPct = totals?.trips ? Math.round((totals.helmetTrips / totals.trips) * 100) : 0;

  return (
    <>
      <Head>
        <title>Demo – Sykkelspor · Finns Fairway</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content" />
      </Head>
      <main className="app-shell demo-shell demo-shell--labels">
        <ReportMap className="map-canvas" showReports onMapReady={setMapApi} mapStyle="mapbox://styles/mapbox/light-v11" enableNvdbLayers initialNvdbLayers={[]} />

        <div className="demo-actions">
          <Link href="/backoffice" className="demo-backoffice">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            Backoffice
          </Link>
          <Link href="/?meld=1" className="fab-meld demo-fab">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            Meld fra
          </Link>
        </div>

        <div className={panelOpen ? 'demo-panel' : 'demo-panel demo-panel--collapsed'}>
          <div className="demo-panel__head">
            <Link href="/" className="demo-panel__brand" aria-label="Til appen"><Logo size="sm" /></Link>
            <div className="demo-panel__title">
              <strong>{data?.competition?.name?.replace(/^DEMO\s*[–-]\s*/i, '') || 'Sykkelspor'}</strong>
              <span className="comp-demo">DEMO</span>
            </div>
            <button type="button" className="demo-panel__toggle" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? 'Skjul panel' : 'Vis panel'}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">{panelOpen ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}</svg>
            </button>
          </div>

          {status && <p className="spor-panel__msg">{status}</p>}

          {data && panelOpen && (
            <>
              <div className="demo-toggles" role="group" aria-label="Lag">
                <button type="button" className={layers.saker ? 'demo-toggle demo-toggle--on' : 'demo-toggle'} onClick={() => toggleLayer('saker')} aria-pressed={layers.saker}><i className="demo-toggle__dot" style={{ background: '#0b5d4d' }} aria-hidden="true" />Meldte saker</button>
                <button type="button" className={layers.ulykker ? 'demo-toggle demo-toggle--on' : 'demo-toggle'} onClick={() => toggleLayer('ulykker')} aria-pressed={layers.ulykker}><i className="demo-toggle__dot" style={{ background: '#6D233F' }} aria-hidden="true" />Ulykker</button>
                <button type="button" className={layers.turer ? 'demo-toggle demo-toggle--on' : 'demo-toggle'} onClick={() => toggleLayer('turer')} aria-pressed={layers.turer}><i className="demo-toggle__dot" style={{ background: '#ef4444' }} aria-hidden="true" />Sykkelturer</button>
                <button type="button" className={layers.anlegg ? 'demo-toggle demo-toggle--on' : 'demo-toggle'} onClick={() => toggleLayer('anlegg')} aria-pressed={layers.anlegg}><i className="demo-toggle__dot" style={{ background: '#1d4ed8' }} aria-hidden="true" />Anlegg</button>
              </div>

              {layers.turer && (<>
              <div className="comp-totals demo-totals">
                <div><strong>{replay ? shownTrips.length : totals.trips}</strong><span>turer</span></div>
                <div><strong>{fmtKm(replay ? shownKm : totals.distanceM)}</strong><span>km</span></div>
                <div><strong>{helmetPct}%</strong><span>med hjelm</span></div>
              </div>

              <div className="demo-controls">
                <div className="demo-seg" role="group" aria-label="Visning">
                  <button type="button" className={view === 'tetthet' ? 'demo-seg__btn demo-seg__btn--on' : 'demo-seg__btn'} onClick={() => { stopReplay(); setView('tetthet'); }}>Varmekart</button>
                  <button type="button" className={view === 'turer' ? 'demo-seg__btn demo-seg__btn--on' : 'demo-seg__btn'} onClick={() => { stopReplay(); setView('turer'); }}>Per klubb</button>
                </div>
                <div className="demo-seg" role="group" aria-label="Type">
                  <button type="button" className={mode === '' ? 'demo-seg__btn demo-seg__btn--on' : 'demo-seg__btn'} onClick={() => changeMode('')}>Alle</button>
                  <button type="button" className={mode === 'sykkel' ? 'demo-seg__btn demo-seg__btn--on' : 'demo-seg__btn'} onClick={() => changeMode('sykkel')}>Sykkel</button>
                  <button type="button" className={mode === 'gange' ? 'demo-seg__btn demo-seg__btn--on' : 'demo-seg__btn'} onClick={() => changeMode('gange')}>Gange</button>
                </div>
              </div>

              <button type="button" className={replay?.running ? 'big-button big-button--secondary demo-play' : 'big-button big-button--primary demo-play'} onClick={replay?.running ? stopReplay : startReplay}>
                {replay?.running ? (
                  <>Stopp · {lastShown ? fmtDay(lastShown.createdAt) : ''}</>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>
                    Spill av perioden
                  </>
                )}
              </button>

              {data.weatherHero && (
                <p className="comp-weather-note demo-weather">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14a5 5 0 0 1 1.4-9.8A6 6 0 0 1 17 6a4 4 0 0 1 1 7.9" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>
                  <span><b>Værhelt:</b> {data.weatherHero.club} – {data.weatherHero.bonusTrips} turer i regn</span>
                </p>
              )}

              <ol className="comp-board__list demo-board">
                {data.leaderboard.map((row, index) => (
                  <li key={row.club} className={index === 0 && row.trips > 0 ? 'comp-row comp-row--lead' : 'comp-row'}>
                    <span className={`comp-row__rank ${row.trips > 0 ? (RANK_CLASS[index] || '') : ''}`}>{index + 1}</span>
                    <span className="comp-row__club">
                      <i className="demo-dot" style={{ background: row.color }} aria-hidden="true" />
                      {row.club}
                    </span>
                    <span className="comp-row__stats">
                      <span className="comp-row__helmet" title="Andel med hjelm"><Icon name="helmet" size={14} /> {row.helmetPct}%</span>
                      <span className="comp-row__count">{row.trips} turer</span>
                      <span className="comp-row__count comp-row__count--muted">{fmtKm(row.distanceM)} km</span>
                    </span>
                  </li>
                ))}
              </ol>

              </>)}

              <p className="demo-note">Syntetiske turer for demonstrasjon – ingen ekte barn. Ekte ruter vises aldri enkeltvis, kun som tetthet for kommunen, og de første 50 m fra hjemmet fjernes før noe lagres.</p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
