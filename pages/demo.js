import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from '../components/Logo';
import ReportSheet from '../components/ReportSheet';
import DemoKidPhone from '../components/DemoKidPhone';
import DemoLaptop from '../components/DemoLaptop';
import DemoFinale from '../components/DemoFinale';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

// /demo — presentation page. Starts with only real reported cases on the map;
// NVDB accidents, the synthetic competition trips (heat map / per club) and
// the club venues are switched on one by one while presenting. Reads
// /api/demo/spor, which only ever serves competitions flagged "demo".
const REPLAY_MS = 15000;

const fmtInt = (n) => (Number(n) || 0).toLocaleString('nb-NO');
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

const LAYERS = [
  { key: 'saker', label: 'Meldte saker', hint: 'live', swatch: 'saker' },
  { key: 'ulykker', label: 'Ulykker', hint: 'NVDB', swatch: 'ulykker' },
  { key: 'turer', label: 'Sykkel- og gåturer', hint: null, swatch: 'turer' },
  { key: 'anlegg', label: 'Baner og haller', hint: null, swatch: 'anlegg' },
];

// Guided tour for screen recordings / presentations. Each step sets the
// whole page state (so «Tilbake» works too) and shows one short caption.
// Arrow keys, PageUp/PageDown and space work, so a presentation clicker
// drives it like a slide deck. /demo?tur=1 starts it straight away.
const VIEW_CITY = { lng: 8.0, lat: 58.152, zoom: 11.3 };
const VIEW_CASES = { lng: 8.017, lat: 58.156, zoom: 13.2 };
const VIEW_SPOT = { lng: 8.012, lat: 58.1525, zoom: 16.6 };
const VIEW_HOT = { lng: 8.008, lat: 58.153, zoom: 12.7 };
const VIEW_REPLAY = { lng: 7.995, lat: 58.155, zoom: 11.15 };
const VIEW_VENUE_A = { lng: 8.0185, lat: 58.1545, zoom: 14.3 }; // Kristiansand stadion · Gimlehallen
const VIEW_VENUE_B = { lng: 8.0855, lat: 58.1535, zoom: 14.4 }; // Sukkevann
const TOUR = [
  { title: 'Finns Fairway', text: 'Barn og voksne melder fra om utrygge steder. Finns Fairway følger opp.', layers: { saker: false, ulykker: false, turer: false, anlegg: false }, map: VIEW_CITY },
  { title: 'Meldte steder', text: 'Kartet viser alle stedene det er meldt fra om, så alle ser hvor det føles utrygt.', layers: { saker: true }, map: VIEW_CASES },
  { title: 'Meld fra på sekunder', text: 'Dra kartet til stedet og trykk «Velg dette stedet». Ingen innlogging.', report: 'pick', map: VIEW_SPOT, place: 'top' },
  { title: 'Hva er utrygt?', text: 'Velg hvem som melder og hva som er utrygt, og beskriv stedet med noen ord.', report: 'form', place: 'top' },
  { title: 'Melderen ser veien videre', text: 'Kvitteringen viser hva som skjer nå, og saken kan deles så flere kan støtte den.', report: 'success', place: 'top' },
  { title: 'Der ulykkene skjer', text: 'Steder med flere registrerte trafikkulykker (NVDB) vises sammen med meldingene.', layers: { saker: true, ulykker: false }, hotspots: true, map: VIEW_HOT },
  { title: 'Hvem logger?', text: 'Først velger man hvem som logger turen. Barn under 13 år logger aldri selv.', layers: { saker: false }, phone: 'who', map: VIEW_REPLAY },
  { title: 'En voksen er med', text: 'For de yngste logger en voksen som er med, på sin telefon. Gjerne sammen med andre fra klubben.', phone: 'under13' },
  { title: 'Sykkel, sparkesykkel eller gå', text: 'Velg hvordan og hvor turen går, og klubben turen teller for.', phone: 'setup' },
  { title: 'Turen logges underveis', text: 'Telefonen ligger i lomma. Utrygge punkter kan markeres med ett trykk.', phone: 'tracking' },
  { title: 'Bra jobba!', text: 'Etter turen får barnet ros, og lærer ett av Finns 10 bud.', phone: 'done' },
  { title: 'Kartet vokser fram', text: 'Hver tur barna logger blir en strek. Slik bygges en måned opp.', layers: { saker: false, turer: true, anlegg: false }, replay: true, map: VIEW_REPLAY },
  { title: 'Der barna faktisk ferdes', text: 'Varmekartet viser veiene barna bruker mest til klubbenes baner og haller.', layers: { saker: false, turer: true, anlegg: true }, view: 'tetthet', mapSeq: [VIEW_VENUE_A, VIEW_VENUE_B] },
  { title: 'Personvernet er ivaretatt', text: 'Startstedet fjernes automatisk, og ingen enkeltruter vises.', layers: { turer: true, saker: true, anlegg: true }, view: 'tetthet', map: VIEW_REPLAY },
  { title: 'Sparkesykler ved anlegg og skoler', text: 'Vi ser hvor delte elsparkesykler parkeres ved baner, haller og skoler i hele landet.', laptop: '/backoffice/sparkesykler' },
  { title: 'Alt samlet for oppfølging', text: 'Sakene følges opp i backoffice, med status, kart og historikk på ett sted.', laptop: '/backoffice' },
  { title: 'Hvert kvartal', text: 'Kart og historikk legges fram for veisjefen.', finale: true, layers: { saker: true, turer: true, anlegg: false }, view: 'tetthet', map: VIEW_REPLAY, end: true },
];

export default function Demo() {
  const [mapApi, setMapApi] = useState(null);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Henter …');
  const [view, setView] = useState('tetthet'); // tetthet | turer
  const [mode, setMode] = useState(''); // '' | sykkel | gange
  const [replay, setReplay] = useState(null); // { T, running } | null — T is 0..1
  const [hotspots, setHotspots] = useState(null);
  const [open, setOpen] = useState(true);
  const [layers, setLayers] = useState({ turer: false, saker: true, ulykker: false, anlegg: false });
  // In-page walkthrough of the report flow (pick a spot → form → receipt).
  // Nothing is sent: ReportSheet runs in demo mode.
  const [report, setReport] = useState('none'); // none | pick | form
  const [pickedPoint, setPickedPoint] = useState(null);
  const [demoView, setDemoView] = useState('form'); // form | success (tour)
  const [tourStep, setTourStep] = useState(-1); // -1 = tour off
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
  // Accident hot spots for the tour (edge-cached, so ready when needed).
  useEffect(() => {
    fetch('/api/demo/ulykker').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setHotspots(d); }).catch(() => {});
  }, []);

  const trips = useMemo(() => {
    const all = data?.trips || [];
    return mode ? all.filter((t) => t.mode === mode) : all;
  }, [data, mode]);
  const allGeo = useMemo(() => tripsToGeoJson(trips), [trips]);
  // Trips in logged order with a normalised time t (0..1) for the replay.
  const replayTrips = useMemo(() => {
    const list = trips.map((t) => ({ ...t, ms: Date.parse(t.createdAt) || 0 })).sort((a, b) => a.ms - b.ms);
    const min = list[0]?.ms || 0;
    const span = Math.max(1, (list[list.length - 1]?.ms || 0) - min);
    return list.map((t) => ({ ...t, t: (t.ms - min) / span }));
  }, [trips]);
  const replayGeo = useMemo(() => ({
    type: 'FeatureCollection',
    features: replayTrips.map((t) => ({ type: 'Feature', properties: { t: Number(t.t.toFixed(4)) }, geometry: { type: 'LineString', coordinates: t.path } })),
  }), [replayTrips]);
  const replayOn = Boolean(replay);

  // Draw whatever the current view/filter/replay says, once map + data exist.
  useEffect(() => {
    if (!mapApi || !data) return;
    const opts = { keepReports: true };
    if (!layers.turer) {
      mapApi.clearRouteLines?.(opts);
      mapApi.clearHeatLines?.(opts);
      mapApi.clearReplay?.();
      return;
    }
    if (replayOn) {
      mapApi.clearRouteLines?.(opts);
      mapApi.clearHeatLines?.(opts);
      mapApi.showReplay?.(replayGeo);
      return;
    }
    mapApi.clearReplay?.();
    if (view === 'tetthet') {
      mapApi.clearRouteLines?.(opts);
      mapApi.showHeatLines?.(data.geojson, opts);
    } else {
      mapApi.clearHeatLines?.(opts);
      mapApi.showRouteLines?.(allGeo, opts);
    }
    if (!fittedRef.current && allGeo.features.length) {
      fittedRef.current = true;
      mapApi.fitCompetition?.(allGeo);
    }
  }, [mapApi, data, view, replayOn, replayGeo, allGeo, layers.turer]);

  // Context layers follow the checkboxes.
  useEffect(() => {
    if (!mapApi) return;
    mapApi.setReportsVisible?.(layers.saker);
    mapApi.setAccidentsVisible?.(layers.ulykker);
    mapApi.showVenues?.(layers.anlegg ? (data?.venues || []) : []);
  }, [mapApi, data, layers]);

  const rafRef = useRef(0);
  const stopReplay = () => { cancelAnimationFrame(rafRef.current); clearInterval(timerRef.current); setReplay(null); };
  const toggleLayer = (key) => {
    if (key === 'turer' && layers.turer) stopReplay();
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };
  useEffect(() => () => clearInterval(timerRef.current), []);

  // Replay: a smooth sweep through the month. The map only gets a new paint
  // expression per frame (no re-adding data), and the HUD updates ~10×/s.
  const startReplay = () => {
    if (!trips.length) return;
    cancelAnimationFrame(rafRef.current);
    setLayers((l) => ({ ...l, turer: true }));
    setReplay({ T: 0, running: true });
    const t0 = performance.now();
    let lastHud = 0;
    const tick = (now) => {
      const T = Math.min(1.08, (now - t0) / REPLAY_MS);
      mapApi?.setReplayProgress?.(T);
      if (now - lastHud > 100 || T >= 1.08) { lastHud = now; setReplay({ T, running: T < 1.08 }); }
      if (T < 1.08) rafRef.current = requestAnimationFrame(tick);
    };
    // Let the source be added before the first frame.
    setTimeout(() => { rafRef.current = requestAnimationFrame(tick); }, 250);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const changeMode = (next) => { stopReplay(); setMode(next); load(next); };

  // --- Guided tour ---
  const applyStep = (index) => {
    const step = TOUR[index];
    if (!step) return;
    clearInterval(timerRef.current);
    clearTimeout(replayDelayRef.current);
    cancelAnimationFrame(rafRef.current);
    mapSeqRef.current.forEach(clearTimeout);
    mapSeqRef.current = [];
    setReplay(null);
    setLayers((l) => ({ ...l, ...(step.layers || {}) }));
    if (step.hotspots) mapApi?.showHotspots?.(hotspots || { type: 'FeatureCollection', features: [] });
    else mapApi?.clearHotspots?.();
    if (step.view) setView(step.view);
    if (step.report === 'pick') { setReport('pick'); setPickedPoint(null); setOpen(false); }
    else if (step.report === 'form' || step.report === 'success') {
      const c = mapApi?.getCenter?.() || { lng: VIEW_SPOT.lng, lat: VIEW_SPOT.lat };
      setPickedPoint(c);
      setDemoView(step.report);
      setReport('form');
      setOpen(false);
    } else {
      setReport('none');
      // Keep the side panel folded during the tour: the map, phone and
      // laptop carry the story, and the bubble carries the words.
      setOpen(false);
    }
    if (step.map) mapApi?.flyToView?.(step.map);
    if (step.mapSeq) {
      mapApi?.flyToView?.({ ...step.mapSeq[0], duration: 2200 });
      step.mapSeq.slice(1).forEach((v, k) => {
        mapSeqRef.current.push(setTimeout(() => mapApi?.flyToView?.({ ...v, duration: 3200 }), 5200 * (k + 1)));
      });
    }
    if (step.fit && allGeo.features.length) mapApi?.fitCompetition?.(allGeo);
    if (step.replay) replayDelayRef.current = setTimeout(() => startReplayRef.current?.(), 1500);
  };
  const startReplayRef = useRef(null);
  // A 2–3 km bike trip from the demo data for the phone's tracking screen.
  const kidTrip = useMemo(() => {
    const all = data?.trips || [];
    return all.find((t) => t.mode === 'sykkel' && t.distanceM > 1800 && t.distanceM < 3200 && (t.path || []).length > 8) || all[0] || null;
  }, [data]);
  const replayDelayRef = useRef(null);
  const mapSeqRef = useRef([]);
  startReplayRef.current = startReplay;
  const goStep = (index) => {
    const next = Math.max(0, Math.min(TOUR.length - 1, index));
    setTourStep(next);
    applyStep(next);
  };
  const startTour = () => goStep(0);
  const endTour = () => {
    clearInterval(timerRef.current);
    clearTimeout(replayDelayRef.current);
    cancelAnimationFrame(rafRef.current);
    mapSeqRef.current.forEach(clearTimeout);
    mapApi?.clearHotspots?.();
    setReplay(null);
    setTourStep(-1);
    setReport('none');
    setDemoView('form');
    setOpen(true);
  };
  const tourRef = useRef({});
  tourRef.current = { tourStep, goStep, endTour };
  useEffect(() => {
    const onKey = (e) => {
      const { tourStep: i, goStep: go, endTour: end } = tourRef.current;
      if (i < 0) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (i < TOUR.length - 1) go(i + 1); }
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); if (i > 0) go(i - 1); }
      else if (e.key === 'Escape') end();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // /demo?tur=1 starts the tour once the map and data are ready.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current || !mapApi || !data) return;
    try {
      if (new URLSearchParams(window.location.search).get('tur') === '1') {
        autoStartedRef.current = true;
        setTimeout(() => goStep(0), 400);
      }
    } catch (_e) { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapApi, data]);

  const startReport = () => { setOpen(false); setPickedPoint(null); setReport('pick'); };
  const confirmSpot = () => { const c = mapApi?.getCenter?.(); if (!c) return; setPickedPoint(c); setReport('form'); };
  const endReport = () => { setReport('none'); setPickedPoint(null); setDemoView('form'); setOpen(true); };

  const shownTrips = replay ? replayTrips.filter((t) => t.t <= replay.T) : trips;
  const shownKm = shownTrips.reduce((s, t) => s + (t.distanceM || 0), 0);
  const lastShown = shownTrips[shownTrips.length - 1];
  const totals = data?.totals;
  const helmetPct = totals?.trips ? Math.round((totals.helmetTrips / totals.trips) * 100) : 0;
  const title = data?.competition?.name?.replace(/^DEMO\s*[–-]\s*/i, '') || 'Sykle til trening';
  const layerCount = { turer: totals ? fmtInt(totals.trips) : null, anlegg: data?.venues?.length ? String(data.venues.length) : null };

  return (
    <>
      <Head>
        <title>Demo · Finns Fairway</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content" />
      </Head>
      <main className="app-shell demo-shell">
        <ReportMap className="map-canvas" showReports onMapReady={setMapApi} mapStyle="mapbox://styles/mapbox/light-v11" enableNvdbLayers initialNvdbLayers={[]} pickMode={report === 'pick'} adminChrome={false} />

        {report === 'pick' && (
          <>
            <div className="pick-hint">Dra kartet til stedet det gjelder</div>
            <div className="pick-bar">
              <button type="button" className="big-button big-button--primary pick-bar__confirm" onClick={tourStep >= 0 ? () => goStep(tourStep + 1) : confirmSpot}>Velg dette stedet</button>
              <button type="button" className="big-button big-button--secondary" onClick={endReport}>Avbryt</button>
            </div>
          </>
        )}
        {report === 'form' && pickedPoint && (
          <ReportSheet key={`${demoView}-${tourStep}`} demo demoView={demoView} demoScript={tourStep >= 0} point={pickedPoint} onClose={endReport} onChangeLocation={() => setReport('pick')} onViewCase={endReport} />
        )}

        {report === 'none' && tourStep < 0 && (
          <div className="dp-actions">
            <button type="button" className="dp-actions__tour" onClick={startTour} disabled={!data}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>
              Start demo
            </button>
            <Link href="/backoffice" className="dp-actions__bo">Logg inn i backoffice</Link>
            <button type="button" className="fab-meld dp-actions__meld" onClick={startReport}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              Meld fra
            </button>
          </div>
        )}

        {report === 'none' && (
          <aside className={open ? 'dp' : 'dp dp--folded'} aria-label="Demo">
            <header className="dp__head">
              <Link href="/" className="dp__brand" aria-label="Til appen"><Logo size="sm" /></Link>
              <span className="dp__muni">Kristiansand</span>
              <span className="dp__stamp">Demo</span>
              <button type="button" className="dp__fold" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Skjul' : 'Vis'}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="M5 12h14" /> : <path d="M12 5v14M5 12h14" />}</svg>
              </button>
            </header>

            {open && (
              <div className="dp__body">
                {status && <p className="dp__status">{status}</p>}
                <h1 className="dp__title">{title}</h1>
                <p className="dp__lede">Hvor barna sykler og går til trening, sett sammen med det innbyggerne melder inn og det som faktisk har skjedd på veiene.</p>

                <section className="dp__section">
                  <h2 className="dp__h">Kartlag</h2>
                  <ul className="dp__layers">
                    {LAYERS.map((l) => (
                      <li key={l.key}>
                        <label className={layers[l.key] ? 'dp__layer dp__layer--on' : 'dp__layer'}>
                          <input type="checkbox" checked={layers[l.key]} onChange={() => toggleLayer(l.key)} />
                          <i className={`dp__swatch dp__swatch--${l.swatch}`} aria-hidden="true" />
                          <span className="dp__layer-name">{l.label}</span>
                          <span className="dp__layer-meta">{layerCount[l.key] || l.hint || ''}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>

                {data && layers.turer && (
                  <section className="dp__section">
                    <dl className="dp__figures">
                      <div><dd>{fmtInt(replay ? shownTrips.length : totals.trips)}</dd><dt>turer</dt></div>
                      <div><dd>{fmtKm(replay ? shownKm : totals.distanceM)}</dd><dt>km</dt></div>
                      <div><dd>{helmetPct} %</dd><dt>med hjelm</dt></div>
                    </dl>

                    <div className="dp__tabsrow">
                      <nav className="dp__tabs" aria-label="Visning">
                        <button type="button" className={view === 'tetthet' ? 'dp__tab dp__tab--on' : 'dp__tab'} onClick={() => { stopReplay(); setView('tetthet'); }}>Varmekart</button>
                        <button type="button" className={view === 'turer' ? 'dp__tab dp__tab--on' : 'dp__tab'} onClick={() => { stopReplay(); setView('turer'); }}>Per klubb</button>
                      </nav>
                      <nav className="dp__tabs dp__tabs--filter" aria-label="Type">
                        <button type="button" className={mode === '' ? 'dp__tab dp__tab--on' : 'dp__tab'} onClick={() => changeMode('')}>Alle</button>
                        <button type="button" className={mode === 'sykkel' ? 'dp__tab dp__tab--on' : 'dp__tab'} onClick={() => changeMode('sykkel')}>Sykkel</button>
                        <button type="button" className={mode === 'gange' ? 'dp__tab dp__tab--on' : 'dp__tab'} onClick={() => changeMode('gange')}>Gange</button>
                      </nav>
                    </div>

                    <button type="button" className={replay?.running ? 'dp__play dp__play--stop' : 'dp__play'} onClick={replay?.running ? stopReplay : startReplay}>
                      {replay?.running ? (
                        <>Stopp<span className="dp__play-meta">{lastShown ? fmtDay(lastShown.createdAt) : ''}</span></>
                      ) : (
                        <><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>Spill av september</>
                      )}
                    </button>

                    <h2 className="dp__h">Stilling <span className="dp__h-meta">flest turer vinner</span></h2>
                    <table className="dp__table">
                      <thead>
                        <tr><th className="dp__num">#</th><th>Klubb</th><th className="dp__num">Turer</th><th className="dp__num">Km</th><th className="dp__num">Hjelm</th></tr>
                      </thead>
                      <tbody>
                        {data.leaderboard.map((row, index) => (
                          <tr key={row.club} className={index === 0 && row.trips > 0 ? 'dp__lead' : undefined}>
                            <td className="dp__num">{index + 1}</td>
                            <td className="dp__club"><i style={{ background: row.color }} aria-hidden="true" />{row.club}{data.weatherHero?.club === row.club && <span className="dp__hero" title={`Værhelt – flest turer i regn (${row.bonusTrips})`}>værhelt</span>}</td>
                            <td className="dp__num">{fmtInt(row.trips)}</td>
                            <td className="dp__num">{fmtKm(row.distanceM)}</td>
                            <td className="dp__num dp__pct">{row.helmetPct} %</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                <footer className="dp__foot">
                  <p>Turene er syntetiske og laget for demonstrasjon. Ekte ruter vises aldri enkeltvis, bare som tetthet, og de første 50 m fra hjemmet fjernes før noe lagres.</p>
                  <p className="dp__sources">Kilder: NVDB, Kartverket, OpenStreetMap, Mapbox og klubbene.</p>
                </footer>
              </div>
            )}
          </aside>
        )}
        {replay && (
          <div className="replay-hud" aria-live="off">
            <strong>{lastShown ? new Date(lastShown.createdAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' }) : '\u00a0'}</strong>
            <span>{fmtInt(shownTrips.length)} turer · {fmtKm(shownKm)} km</span>
          </div>
        )}

        {tourStep >= 0 && TOUR[tourStep]?.laptop && <DemoLaptop key={TOUR[tourStep].laptop} src={TOUR[tourStep].laptop} />}
        {tourStep >= 0 && TOUR[tourStep]?.finale && (
          <DemoFinale trips={data?.totals?.trips || 0} hotspots={hotspots?.features?.length || 0} onRestart={() => goStep(0)} onDone={endTour} />
        )}

        {tourStep >= 0 && TOUR[tourStep]?.phone && (
          <DemoKidPhone
            screen={TOUR[tourStep].phone}
            competitionName={title}
            clubs={(data?.leaderboard || []).map((r) => r.club)}
            path={kidTrip?.path || null}
          />
        )}

        {tourStep >= 0 && TOUR[tourStep] && !TOUR[tourStep].finale && (
          <div className={`tour tour--${TOUR[tourStep].place || 'bottom'}`} role="dialog" aria-live="polite" aria-label="Demo">
            <div className="tour__card" key={tourStep}>
              <span className="tour__bar" style={{ width: `${Math.round(((tourStep + 1) / TOUR.length) * 100)}%` }} aria-hidden="true" />
              <div className="tour__top">
                <span className="tour__count">{tourStep + 1} / {TOUR.length}</span>
                <button type="button" className="tour__close" onClick={endTour} aria-label="Avslutt demo">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <h2 className="tour__title">{TOUR[tourStep].title}</h2>
              <p className="tour__text">{TOUR[tourStep].text}</p>
              <div className="tour__nav">
                <button type="button" className="tour__back" onClick={() => goStep(tourStep - 1)} disabled={tourStep === 0} aria-label="Forrige">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                {TOUR[tourStep].end ? (
                  <>
                    <button type="button" className="tour__again" onClick={() => goStep(0)}>Start på nytt</button>
                    <button type="button" className="tour__next" onClick={endTour}>Ferdig</button>
                  </>
                ) : (
                  <button type="button" className="tour__next" onClick={() => goStep(tourStep + 1)}>
                    Neste
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
