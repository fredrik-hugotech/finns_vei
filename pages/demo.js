import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from '../components/Logo';
import ReportSheet from '../components/ReportSheet';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

// /demo — presentation page. Starts with only real reported cases on the map;
// NVDB accidents, the synthetic competition trips (heat map / per club) and
// the club venues are switched on one by one while presenting. Reads
// /api/demo/spor, which only ever serves competitions flagged "demo".
const REPLAY_MS = 24000;

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

export default function Demo() {
  const [mapApi, setMapApi] = useState(null);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Henter …');
  const [view, setView] = useState('tetthet'); // tetthet | turer | paint
  const [mode, setMode] = useState(''); // '' | sykkel | gange
  const [replay, setReplay] = useState(null); // { index, running } | null
  const [open, setOpen] = useState(true);
  const [layers, setLayers] = useState({ turer: false, saker: true, ulykker: false, anlegg: false });
  // In-page walkthrough of the report flow (pick a spot → form → receipt).
  // Nothing is sent: ReportSheet runs in demo mode.
  const [report, setReport] = useState('none'); // none | pick | form
  const [pickedPoint, setPickedPoint] = useState(null);
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
    } else if (view === 'paint') {
      mapApi.clearHeatLines?.(opts);
      mapApi.showRouteLines?.(data.paint || { type: 'FeatureCollection', features: [] }, opts);
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

  // Context layers follow the checkboxes.
  useEffect(() => {
    if (!mapApi) return;
    mapApi.setReportsVisible?.(layers.saker);
    mapApi.setAccidentsVisible?.(layers.ulykker);
    mapApi.showVenues?.(layers.anlegg ? (data?.venues || []) : []);
  }, [mapApi, data, layers]);

  const stopReplay = () => { clearInterval(timerRef.current); setReplay(null); };
  const toggleLayer = (key) => {
    if (key === 'turer' && layers.turer) stopReplay();
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };
  useEffect(() => () => clearInterval(timerRef.current), []);

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

  const changeMode = (next) => { stopReplay(); setMode(next); load(next); };

  const startReport = () => { setOpen(false); setPickedPoint(null); setReport('pick'); };
  const confirmSpot = () => { const c = mapApi?.getCenter?.(); if (!c) return; setPickedPoint(c); setReport('form'); };
  const endReport = () => { setReport('none'); setPickedPoint(null); setOpen(true); };

  const shownTrips = replay ? trips.slice(0, replay.index) : trips;
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
        <ReportMap className="map-canvas" showReports onMapReady={setMapApi} mapStyle="mapbox://styles/mapbox/light-v11" enableNvdbLayers initialNvdbLayers={[]} pickMode={report === 'pick'} />

        {report === 'pick' && (
          <>
            <div className="pick-hint">Dra kartet til stedet det gjelder</div>
            <div className="pick-bar">
              <button type="button" className="big-button big-button--primary pick-bar__confirm" onClick={confirmSpot}>Velg dette stedet</button>
              <button type="button" className="big-button big-button--secondary" onClick={endReport}>Avbryt</button>
            </div>
          </>
        )}
        {report === 'form' && pickedPoint && (
          <ReportSheet demo point={pickedPoint} onClose={endReport} onChangeLocation={() => setReport('pick')} onViewCase={endReport} />
        )}

        {report === 'none' && (
          <div className="dp-actions">
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
                        <button type="button" className={view === 'paint' ? 'dp__tab dp__tab--on' : 'dp__tab'} onClick={() => { stopReplay(); setView('paint'); }}>Mal kartet</button>
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

                    {view === 'paint' && (
                      <p className="dp__lede dp__paintnote">Klubbene maler veiene de bruker. En vei blir malt når minst to fra samme klubb har syklet eller gått der, og klubben med flest malte veibiter vinner. {fmtInt(data.paintedEdges)} veibiter er malt.</p>
                    )}
                    <h2 className="dp__h">Stilling <span className="dp__h-meta">{view === 'paint' ? 'flest malte veibiter vinner' : 'flest turer vinner'}</span></h2>
                    {view === 'paint' ? (
                      <table className="dp__table">
                        <thead><tr><th className="dp__num">#</th><th>Klubb</th><th className="dp__num">Veibiter</th><th className="dp__num">Andel</th></tr></thead>
                        <tbody>
                          {(data.paintBoard || []).map((row, index) => (
                            <tr key={row.club} className={index === 0 ? 'dp__lead' : undefined}>
                              <td className="dp__num">{index + 1}</td>
                              <td className="dp__club"><i style={{ background: (data.leaderboard.find((r) => r.club === row.club) || {}).color }} aria-hidden="true" />{row.club}</td>
                              <td className="dp__num">{fmtInt(row.edges)}</td>
                              <td className="dp__num dp__pct">{row.percent} %</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
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
                    )}
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
      </main>
    </>
  );
}
