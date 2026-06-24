import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

const ReportMap = dynamic(() => import('../../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

// Internal-only density map: where children cycle to/from activities.
export default function TetthetInternal() {
  const router = useRouter();
  const mapApiRef = useRef(null);
  const [secret, setSecret] = useState('');
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState('');
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (router.isReady && typeof router.query.secret === 'string') setSecret(router.query.secret);
  }, [router.isReady, router.query.secret]);

  const headers = useCallback(() => ({ 'x-backoffice-secret': secret }), [secret]);

  const loadList = useCallback(async () => {
    if (!secret) return;
    setStatus('');
    try {
      const r = await fetch('/api/backoffice/competition-trips', { headers: headers() });
      if (r.status === 403) { setStatus('Feil passord.'); return; }
      const d = await r.json();
      setCompetitions(d.competitions || []);
      if ((d.competitions || []).length && !competitionId) setCompetitionId(d.competitions[0].id);
    } catch (_e) { setStatus('Kunne ikke hente konkurranser.'); }
  }, [secret, headers, competitionId]);

  useEffect(() => { loadList(); }, [loadList]);

  const handleMapReady = useCallback((api) => { mapApiRef.current = api; if (stats) api.showCompetitionTrips?.(stats.geojson); }, [stats]);

  const show = useCallback(async () => {
    if (!competitionId) return;
    setStatus('Henter …');
    try {
      const r = await fetch(`/api/backoffice/competition-trips?id=${encodeURIComponent(competitionId)}`, { headers: headers() });
      if (!r.ok) { setStatus('Kunne ikke hente data.'); return; }
      const d = await r.json();
      setStats(d);
      setStatus('');
      mapApiRef.current?.showCompetitionTrips?.(d.geojson);
      mapApiRef.current?.fitCompetition?.(d.geojson);
    } catch (_e) { setStatus('Kunne ikke hente data.'); }
  }, [competitionId, headers]);

  return (
    <>
      <Head><title>Tetthet (internt)</title><meta name="robots" content="noindex" /></Head>
      <main className="app-shell">
        <ReportMap className="map-canvas" showReports={false} onMapReady={handleMapReady} />

        <div className="tetthet-panel">
          <strong>Tetthet · internt</strong>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="BACKOFFICE_SECRET" />
          <button type="button" className="big-button big-button--secondary" onClick={loadList} disabled={!secret}>Hent</button>
          {competitions.length > 0 && (
            <select className="comp-select" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
              {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (skjult)'}</option>)}
            </select>
          )}
          <button type="button" className="big-button big-button--primary" onClick={show} disabled={!competitionId}>Vis tetthet</button>
          {stats && <span className="tetthet-meta">{stats.totals.trips} turer · {(stats.totals.distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 0 })} km</span>}
          {status && <span className="tetthet-meta">{status}</span>}
        </div>
      </main>
    </>
  );
}
