import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeFetchError } from '../../lib/backofficeFormat';

const ReportMap = dynamic(() => import('../../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});


// Internal-only admin map: the tracks (density) left by competition rides.
export default function Sykkelspor() {
  const [mapApi, setMapApi] = useState(null);
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState('');
  const [mode, setMode] = useState('');
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  // requestId guards against out-of-order responses when the competition or
  // mode filter is switched again before an earlier fetch has resolved.
  const requestIdRef = useRef(0);

  const load = useCallback(async (id, modeFilter) => {
    if (!id) return;
    const requestId = ++requestIdRef.current;
    setStats(null);
    setStatus('Henter …');
    try {
      const modeQuery = modeFilter ? `&mode=${encodeURIComponent(modeFilter)}` : '';
      const r = await fetch(`/api/backoffice/competition-trips?id=${encodeURIComponent(id)}${modeQuery}`);
      if (requestId !== requestIdRef.current) return;
      if (r.status === 403) { setStatus('not-authed'); return; }
      if (!r.ok) { setStatus(await describeFetchError(r, 'Kunne ikke hente data.')); return; }
      const d = await r.json();
      if (requestId !== requestIdRef.current) return;
      setStats(d);
      setStatus('');
    } catch (_e) {
      if (requestId === requestIdRef.current) setStatus('Kunne ikke hente data.');
    }
  }, []);

  // Cookie session authorises admin requests — load the competition list on mount.
  useEffect(() => {
    fetch('/api/backoffice/competition-trips')
      .then(async (r) => {
        if (r.status === 403) throw new Error('not-authed');
        if (!r.ok) throw new Error(await describeFetchError(r, 'Utilgjengelig.'));
        return r.json();
      })
      .then((d) => {
        const list = d.competitions || [];
        setCompetitions(list);
        const first = (list.find((c) => c.active) || list[0])?.id || '';
        if (first) { setCompetitionId(first); load(first, ''); }
      })
      .catch((e) => setStatus(e.message === 'not-authed' ? 'not-authed' : e.message))
      .finally(() => setLoaded(true));
  }, [load]);

  // Draw whenever BOTH the map and the data are ready (order-independent).
  useEffect(() => {
    if (!mapApi) return;
    if (stats?.geojson) {
      mapApi.showCompetitionTrips?.(stats.geojson);
      if (stats.geojson.features?.length) mapApi.fitCompetition?.(stats.geojson);
    } else {
      mapApi.clearCompetitionTrips?.();
    }
  }, [mapApi, stats]);

  const onSelect = (id) => { setCompetitionId(id); load(id, mode); };
  const onModeChange = (nextMode) => { setMode(nextMode); load(competitionId, nextMode); };
  const trackCount = stats?.geojson?.features?.length || 0;
  const modeCounts = stats?.modeCounts || null;

  return (
    <>
      <Head>
        <title>Sykkelspor (internt)</title>
        <meta name="robots" content="noindex" />
        {/* Map page: pinch-zoom disabled so pinch gestures control the Mapbox
            map instead of the page (overrides the permissive default in _app.js). */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content" />
      </Head>
      <main className="app-shell">
        <ReportMap className="map-canvas" showReports={false} onMapReady={setMapApi} />

        <div className="spor-panel">
          <Link className="spor-panel__back" href="/backoffice">‹ Meny</Link>
          {status === 'not-authed' ? (
            <p className="spor-panel__msg">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>
          ) : (
            <>
              <strong>Sykkelspor</strong>
              {!loaded && <span className="spor-panel__meta">Laster …</span>}
              {loaded && !status && competitions.length === 0 && (
                <span className="spor-panel__meta">Ingen konkurranser ennå. Opprett en på <Link href="/backoffice/konkurranser">/backoffice/konkurranser</Link>.</span>
              )}
              {competitions.length > 0 && (
                <select className="comp-select" value={competitionId} onChange={(e) => onSelect(e.target.value)}>
                  {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (skjult)'}</option>)}
                </select>
              )}
              {modeCounts && (modeCounts.sykkel > 0 && modeCounts.gange > 0) && (
                <select className="comp-select" value={mode} onChange={(e) => onModeChange(e.target.value)}>
                  <option value="">Alle ({modeCounts.sykkel + modeCounts.gange})</option>
                  <option value="sykkel">Sykkel ({modeCounts.sykkel})</option>
                  <option value="gange">Gange ({modeCounts.gange})</option>
                </select>
              )}
              {stats && (
                <span className="spor-panel__meta">{stats.totals.trips} turer · {(stats.totals.distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 0 })} km</span>
              )}
              {stats && trackCount === 0 && (
                <span className="spor-panel__meta">Ingen lagrede spor i denne konkurransen ennå. Velg en annen, eller logg en tur.</span>
              )}
              {status && status !== 'not-authed' && <span className="spor-panel__meta">{status}</span>}
              {stats?.leaderboard?.length > 0 && (
                <ol className="comp-board__list spor-panel__leaderboard">
                  {stats.leaderboard.map((row, index) => (
                    <li key={row.club} className="comp-row">
                      <span className="comp-row__rank">{index + 1}</span>
                      <span className="comp-row__club">{row.club}</span>
                      <span className="comp-row__stats">
                        <span className="comp-row__helmet">Hjelm {row.helmetPct}%</span>
                        <span className={stats.metric === 'distance' ? 'comp-row__count comp-row__count--muted' : 'comp-row__count'}>{row.trips} turer</span>
                        <span className={stats.metric === 'distance' ? 'comp-row__count' : 'comp-row__count comp-row__count--muted'}>{(row.distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} km</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
