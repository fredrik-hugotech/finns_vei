import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import BackofficeHeader from '../../components/BackofficeHeader';
import { clipAndSnapCells, clipPath } from '../../lib/geoPrivacy';

// Real-ish Kristiansand sports venues (routing snaps to the nearest road anyway).
const VENUES = [
  { name: 'Kristiansand stadion', lat: 58.1566, lng: 8.0019 },
  { name: 'Idda Arena', lat: 58.1447, lng: 7.9897 },
  { name: 'Aquarama', lat: 58.1430, lng: 8.0036 },
  { name: 'Gimlehallen', lat: 58.1612, lng: 8.0290 },
  { name: 'Sukkevann idrettspark', lat: 58.1300, lng: 7.9600 },
];

// Residential neighbourhood centroids used as trip origins.
const HOODS = [
  { name: 'Lund', lat: 58.1490, lng: 8.0150 },
  { name: 'Grim', lat: 58.1620, lng: 7.9870 },
  { name: 'Kvadraturen', lat: 58.1470, lng: 8.0040 },
  { name: 'Tinnheia', lat: 58.1620, lng: 7.9760 },
  { name: 'Vågsbygd', lat: 58.1290, lng: 7.9760 },
  { name: 'Kongsgård', lat: 58.1530, lng: 8.0260 },
  { name: 'Eg', lat: 58.1700, lng: 7.9950 },
  { name: 'Slettheia', lat: 58.1480, lng: 7.9620 },
  { name: 'Justvik', lat: 58.1900, lng: 8.0500 },
];

function distMeters(a, b) {
  const R = 6371000, tr = (d) => (d * Math.PI) / 180;
  const dLa = tr(b.lat - a.lat), dLo = tr(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(tr(a.lat)) * Math.cos(tr(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function SeedSpor() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState('');
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (router.isReady && typeof router.query.secret === 'string') setSecret(router.query.secret);
  }, [router.isReady, router.query.secret]);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/backoffice/competitions');
      if (response.status === 403) { setStatus('Logg inn på /backoffice først.'); return; }
      const data = await response.json();
      const list = (data.competitions || []).filter((c) => c.active);
      setCompetitions(list);
      const demo = list.find((c) => c.name.includes('DEMO'));
      setCompetitionId((demo || list[0])?.id || '');
    } catch (error) {
      setStatus('Kunne ikke hente konkurranser.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function routeCells(from, to) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Mapbox-feil ' + res.status);
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) return null;
    const points = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const cells = clipAndSnapCells(points);
    const path = clipPath(points);
    return { cells, path, distanceM: Math.round(route.distance), durationS: Math.round(route.duration) };
  }

  const generate = async () => {
    if (!token) { setStatus('Mangler NEXT_PUBLIC_MAPBOX_TOKEN i nettleseren.'); return; }
    const competition = competitions.find((c) => c.id === competitionId);
    if (!competition) { setStatus('Velg en konkurranse.'); return; }
    const clubNames = (competition.clubs || []).map((c) => c.name);
    if (clubNames.length === 0) { setStatus('Konkurransen har ingen klubber.'); return; }

    // Build (hood -> venue) pairs: each venue gets its 4 nearest neighbourhoods.
    const pairs = [];
    for (const venue of VENUES) {
      const near = [...HOODS].sort((a, b) => distMeters(a, venue) - distMeters(b, venue)).slice(0, 4);
      for (const hood of near) { pairs.push({ hood, venue }); pairs.push({ hood, venue }); } // 2 trips each
    }

    setRunning(true);
    setProgress({ done: 0, total: pairs.length });
    let ok = 0, fail = 0;
    for (let i = 0; i < pairs.length; i++) {
      const { hood, venue } = pairs[i];
      const jitter = { lat: hood.lat + (Math.random() - 0.5) * 0.004, lng: hood.lng + (Math.random() - 0.5) * 0.004 };
      try {
        const result = await routeCells(jitter, venue);
        if (result && result.path.length >= 2) {
          await fetch('/api/bike-trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              competitionId,
              club: clubNames[i % clubNames.length],
              helmet: Math.random() > 0.25,
              distanceM: result.distanceM,
              durationS: result.durationS,
              cells: result.cells,
              path: result.path,
            }),
          });
          ok += 1;
        } else { fail += 1; }
      } catch (error) {
        fail += 1;
      }
      setProgress({ done: i + 1, total: pairs.length });
      await sleep(180); // be gentle on the Directions API
    }
    setRunning(false);
    setStatus(`Ferdig: ${ok} ruter lagt inn${fail ? `, ${fail} hoppet over` : ''}. Åpne 🏆 → konkurransen og «Vis spor på kart».`);
  };

  return (
    <>
      <Head><title>Seed spor – backoffice</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Demo-spor" />
      <main className="page admin-page">
        <h1>Generer demo-spor</h1>
        <p className="admin-help">Lager ekte, vei-følgende sykkelruter fra Kristiansand-nabolag til idrettsanlegg (via Mapbox i nettleseren) og legger dem inn som turer på valgt konkurranse. Kjør gjerne på «DEMO – Sykkelspor».</p>

        {competitions.length > 0 && (
          <label className="admin-field">
            <span>Konkurranse</span>
            <select className="comp-select" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
              {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <button type="button" className="big-button big-button--primary" onClick={generate} disabled={running || !competitionId}>
          {running ? `Genererer … ${progress.done}/${progress.total}` : 'Generer ~40 vei-ruter'}
        </button>

        {status && <div className="admin-status">{status}</div>}
        {!token && <div className="notice notice--error">Fant ikke Mapbox-token i nettleseren – sjekk NEXT_PUBLIC_MAPBOX_TOKEN i Vercel.</div>}
      </main>
    </>
  );
}
