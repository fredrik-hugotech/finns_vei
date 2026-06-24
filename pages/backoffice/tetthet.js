import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

const ReportMap = dynamic(() => import('../../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

const SECRET_KEY = 'ff-admin-secret';

// Internal-only admin map: the tracks (density) left by competition rides.
export default function Sykkelspor() {
  const [mapApi, setMapApi] = useState(null);
  const [secret, setSecret] = useState('');
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState('');
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SECRET_KEY) : '';
    if (stored) setSecret(stored);
    else setStatus('not-authed');
  }, []);

  const load = useCallback(async (id) => {
    if (!id || !secret) return;
    setStatus('Henter …');
    try {
      const r = await fetch(`/api/backoffice/competition-trips?id=${encodeURIComponent(id)}`, { headers: { 'x-backoffice-secret': secret } });
      if (!r.ok) { setStatus('Kunne ikke hente data.'); return; }
      const d = await r.json();
      setStats(d);
      setStatus('');
    } catch (_e) { setStatus('Kunne ikke hente data.'); }
  }, [secret]);

  // Load the competition list once we have a password.
  useEffect(() => {
    if (!secret) return;
    fetch('/api/backoffice/competition-trips', { headers: { 'x-backoffice-secret': secret } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('feil'))))
      .then((d) => {
        const list = d.competitions || [];
        setCompetitions(list);
        // Prefer a competition that actually has tracks (DEMO often does).
        const first = (list.find((c) => c.active) || list[0])?.id || '';
        if (first) { setCompetitionId(first); load(first); }
      })
      .catch(() => setStatus('Feil passord eller utilgjengelig.'));
  }, [secret, load]);

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

  const onSelect = (id) => { setCompetitionId(id); load(id); };
  const trackCount = stats?.geojson?.features?.length || 0;

  return (
    <>
      <Head><title>Sykkelspor (internt)</title><meta name="robots" content="noindex" /></Head>
      <main className="app-shell">
        <ReportMap className="map-canvas" showReports={false} onMapReady={setMapApi} />

        <div className="spor-panel">
          <Link className="spor-panel__back" href="/backoffice">‹ Meny</Link>
          {status === 'not-authed' ? (
            <p className="spor-panel__msg">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>
          ) : (
            <>
              <strong>Sykkelspor</strong>
              {competitions.length > 0 && (
                <select className="comp-select" value={competitionId} onChange={(e) => onSelect(e.target.value)}>
                  {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (skjult)'}</option>)}
                </select>
              )}
              {stats && (
                <span className="spor-panel__meta">{stats.totals.trips} turer · {(stats.totals.distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 0 })} km</span>
              )}
              {stats && trackCount === 0 && (
                <span className="spor-panel__meta">Ingen lagrede spor i denne konkurransen ennå. Velg en annen, eller logg en tur.</span>
              )}
              {status && status !== 'not-authed' && <span className="spor-panel__meta">{status}</span>}
            </>
          )}
        </div>
      </main>
    </>
  );
}
