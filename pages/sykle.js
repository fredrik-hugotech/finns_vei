import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import TripTracker from '../components/TripTracker';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster …</div>,
});

const DANGER_CHOICES = [
  { category: 'Høy fart', label: 'Biler kjører fort' },
  { category: 'Utrygt kryss', label: 'Skummelt kryss' },
  { category: 'Dårlig sikt', label: 'Vanskelig å se' },
  { category: 'Mangler fortau', label: 'Ikke plass å gå/sykle' },
  { category: 'Farlig for sykkel', label: 'Farlig på sykkel' },
  { category: 'Annet', label: 'Noe annet' },
];

function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

export default function Sykle() {
  const mapApiRef = useRef(null);
  const [view, setView] = useState('hub'); // hub | setup | tracking | done | danger | danger-done
  const [competition, setCompetition] = useState(null);
  const [routeType, setRouteType] = useState('fritid');
  const [mode, setMode] = useState('sykkel'); // sykkel | gange
  const [club, setClub] = useState('');
  const [helmet, setHelmet] = useState(true);
  const [result, setResult] = useState(null);
  const [dangerStatus, setDangerStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/competitions')
      .then((r) => (r.ok ? r.json() : { competitions: [] }))
      .then((d) => {
        const first = (d.competitions || [])[0] || null;
        setCompetition(first);
        if (first?.clubs?.length === 1) setClub(first.clubs[0].name);
      })
      .catch(() => {});
  }, []);

  const handleMapReady = useCallback((api) => { mapApiRef.current = api; }, []);

  const tripToken = () => {
    const key = 'finns-vei-trip-token';
    let token = window.localStorage.getItem(key);
    if (!token) { token = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; window.localStorage.setItem(key, token); }
    return token;
  };

  const startTrip = () => {
    if (competition?.clubs?.length && !club) { setDangerStatus(''); haptic(20); return; }
    haptic(12);
    setView('tracking');
  };

  const finishTrip = async ({ distanceM, durationS, cells, path, weather }) => {
    setBusy(true);
    try {
      if (competition) {
        await fetch('/api/bike-trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competitionId: competition.id, club, helmet, routeType, mode, weather, distanceM, durationS, cells, path, tripToken: tripToken() }),
        });
      }
    } catch (_e) { /* best-effort */ }
    setResult({ km: (distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 2 }) });
    setBusy(false);
    setView('done');
  };

  const resetToHub = () => {
    setView('hub'); setResult(null); setClub(competition?.clubs?.length === 1 ? competition.clubs[0].name : ''); setRouteType('fritid'); setMode('sykkel'); setHelmet(true);
  };

  // --- Danger reporting (kids) ---
  const openDanger = () => {
    haptic(10);
    setDangerStatus('Finner hvor du er …');
    setView('danger');
    if (!navigator.geolocation) { setDangerStatus('Enheten finner ikke posisjon.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { dangerPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setDangerStatus('ready'); },
      () => setDangerStatus('Vi trenger posisjon for å melde stedet.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };
  const dangerPosRef = useRef(null);

  const sendDanger = async (choice) => {
    const pos = dangerPosRef.current;
    if (!pos) { setDangerStatus('Venter på posisjon …'); return; }
    haptic([15, 30, 15]);
    setBusy(true);
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_type: 'barn',
          category: choice.category,
          description: `Meldt av barn via sykkel-appen: ${choice.label}.`,
          lat: pos.lat,
          lng: pos.lng,
          bike_route_type: routeType,
        }),
      });
    } catch (_e) { /* best-effort */ }
    setBusy(false);
    setView('danger-done');
  };

  return (
    <>
      <Head>
        <title>Finns Fairway – Sykle</title>
        <meta name="description" content="Registrer sykkelturen din og meld fra om farlige steder." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
      </Head>
      <main className="kid-app">
        <ReportMap className="map-canvas" showReports={false} onMapReady={handleMapReady} />

        {view === 'hub' && (
          <section className="kid-screen kid-hub">
            <div className="kid-brand"><Logo size="md" /></div>
            <h1 className="kid-title">Hva vil du gjøre?</h1>
            <button type="button" className="kid-big kid-big--green" onClick={() => { haptic(10); setView('setup'); }}>
              <Icon name="bike" size={42} strokeWidth={1.7} />
              <span>Registrer sykkeltur</span>
            </button>
            <button type="button" className="kid-big kid-big--outline" onClick={openDanger}>
              <Icon name="flag" size={40} strokeWidth={1.8} />
              <span>Meld farlig sted</span>
            </button>
          </section>
        )}

        {view === 'setup' && (
          <section className="kid-screen">
            <button type="button" className="kid-back" onClick={() => setView('hub')}>‹ Tilbake</button>
            <h1 className="kid-title">Klar for tur?</h1>

            <div className="kid-choice">
              <button type="button" className={mode === 'sykkel' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setMode('sykkel'); }}><Icon name="bike" size={26} /><span>Sykle</span></button>
              <button type="button" className={mode === 'gange' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setMode('gange'); }}><Icon name="activity" size={26} /><span>Gå</span></button>
            </div>

            <div className="kid-choice">
              <button type="button" className={routeType === 'fritid' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setRouteType('fritid'); }}><Icon name="activity" size={26} /><span>Fritid</span></button>
              <button type="button" className={routeType === 'skole' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setRouteType('skole'); }}><Icon name="school" size={26} /><span>Skole</span></button>
            </div>

            {competition?.clubs?.length > 1 && (
              <div className="kid-clubs">
                {competition.clubs.map((c) => (
                  <button type="button" key={c.name} className={club === c.name ? 'kid-club kid-club--on' : 'kid-club'} onClick={() => { haptic(6); setClub(c.name); }}>{c.name}</button>
                ))}
              </div>
            )}

            <button type="button" className={helmet ? 'kid-helmet kid-helmet--on' : 'kid-helmet'} onClick={() => { haptic(6); setHelmet((v) => !v); }}>
              <Icon name="helmet" size={26} /><span>Jeg har hjelm</span><span className="kid-helmet__check">{helmet ? <Icon name="check" size={22} /> : ''}</span>
            </button>

            <button type="button" className="kid-big kid-big--green kid-start" onClick={startTrip} disabled={competition?.clubs?.length > 1 && !club}>
              <Icon name="bike" size={34} /><span>Start tur</span>
            </button>
            {competition?.clubs?.length > 1 && !club && <p className="kid-hint">Velg laget ditt først</p>}
          </section>
        )}

        {view === 'tracking' && (
          <TripTracker club={club} helmet={helmet} routeType={routeType} mapApi={mapApiRef.current} onDone={finishTrip} onCancel={resetToHub} />
        )}

        {view === 'done' && (
          <section className="kid-screen kid-done">
            <div className="kid-done__badge"><Icon name="check" size={56} strokeWidth={2.2} /></div>
            <h1 className="kid-title">Bra jobba!</h1>
            <p className="kid-big-number">{result?.km} km</p>
            <p className="kid-sub">Turen er registrert.</p>
            <button type="button" className="kid-big kid-big--green" onClick={resetToHub}><span>Ferdig</span></button>
          </section>
        )}

        {view === 'danger' && (
          <section className="kid-screen">
            <button type="button" className="kid-back" onClick={resetToHub}>‹ Tilbake</button>
            <h1 className="kid-title">Hva er farlig her?</h1>
            {dangerStatus && dangerStatus !== 'ready' && <p className="kid-hint">{dangerStatus}</p>}
            <div className="kid-danger-grid">
              {DANGER_CHOICES.map((choice) => (
                <button type="button" key={choice.category} className="kid-danger" disabled={busy || dangerStatus !== 'ready'} onClick={() => sendDanger(choice)}>
                  <Icon name="pin" size={26} /><span>{choice.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === 'danger-done' && (
          <section className="kid-screen kid-done">
            <div className="kid-done__badge kid-done__badge--amber"><Icon name="flag" size={50} strokeWidth={2} /></div>
            <h1 className="kid-title">Takk!</h1>
            <p className="kid-sub">Vi sjekker stedet du meldte fra om.</p>
            <button type="button" className="kid-big kid-big--green" onClick={resetToHub}><span>Ferdig</span></button>
          </section>
        )}
      </main>
    </>
  );
}
