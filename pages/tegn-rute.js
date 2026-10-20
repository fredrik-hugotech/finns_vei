import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { clipPath, randomOffsetPoint } from '../lib/geoPrivacy';
import { addMyTrip } from '../lib/myTrips';

const RouteDrawer = dynamic(() => import('../components/RouteDrawer'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart …</div>,
});

function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

function tripToken() {
  try {
    const key = 'finns-vei-trip-token';
    let token = window.localStorage.getItem(key);
    if (!token) { token = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; window.localStorage.setItem(key, token); }
    return token;
  } catch (_e) { return null; }
}

// Adults register a regular route a child uses (to training, school …) by
// tapping it out on the map — no GPS, no phone on the child, no competition
// needed. The start (often home) is clipped on the device before sending, and
// again on the server, exactly like a live trip.
export default function TegnRute() {
  const router = useRouter();
  const [step, setStep] = useState('draw'); // draw | done | error
  const [adult, setAdult] = useState(false);
  const [mode, setMode] = useState('sykkel');
  const [routeType, setRouteType] = useState('fritid');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedKm, setSavedKm] = useState('');
  const [drawKey, setDrawKey] = useState(0);

  // Coming from the "Hvem logger?" step, the adult has already said so;
  // anyone arriving directly (menu, link) confirms it once on the map.
  // `ready` waits for the query on the client, so the server HTML (no
  // overlay) and the first client render match.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.voksen === '1') setAdult(true);
    setReady(true);
  }, [router.isReady, router.query.voksen]);
  const leave = () => router.push(backTo);

  const backTo = typeof router.query.fra === 'string' && router.query.fra.startsWith('/') && !router.query.fra.startsWith('//') ? router.query.fra : '/';

  const save = async ({ points, distanceM }) => {
    const homeRef = randomOffsetPoint(points[0]);
    const path = clipPath(points, { homeRef });
    if (path.length < 2) { setError('Ruten er for kort. Tegn litt lenger.'); setStep('error'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/bike-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manuell', mode, routeType, path, tripToken: tripToken() }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Kunne ikke lagre ruten.');
      }
      addMyTrip({ distanceM, mode, routeType, weather: null, source: 'manuell' });
      haptic([10, 40, 14]);
      setSavedKm((distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 }));
      setStep('done');
    } catch (e) {
      setError(e.message || 'Noe gikk galt. Prøv igjen.');
      setStep('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Tegn en rute – Finns Fairway</title>
        <meta name="description" content="Tegn veien barnet bruker til trening, skole eller fritid." />
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content" />
      </Head>
      <main className="kid-app">
        {/* Stays mounted behind the error screen so a failed save keeps the drawing. */}
        {(step === 'draw' || step === 'error') && (
          <RouteDrawer
            key={drawKey}
            mode={mode}
            onModeChange={setMode}
            routeType={routeType}
            onRouteTypeChange={setRouteType}
            saving={saving}
            onSave={save}
            onCancel={leave}
          />
        )}

        {step === 'draw' && ready && !adult && (
          <div className="rd-gate" role="dialog" aria-modal="true" aria-label="For voksne">
            <div className="rd-gate__card">
              <span className="rd-gate__ic" aria-hidden="true"><Icon name="pencil" size={24} /></span>
              <strong>Tegn veien barnet bruker</strong>
              <p>Dette er for voksne. Barn under 13 år logger ikke selv.</p>
              <button type="button" className="big-button big-button--primary" onClick={() => { haptic(10); setAdult(true); }}>Jeg er voksen</button>
              <button type="button" className="rd-gate__cancel" onClick={leave}>Avbryt</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <section className="kid-screen kid-done">
            <div className="kid-done__badge"><Icon name="check" size={56} strokeWidth={2.2} /></div>
            <h1 className="kid-title">Takk, ruten er lagret</h1>
            <p className="kid-big-number">{savedKm} km</p>
            <button type="button" className="kid-big kid-big--outline kid-big--cta" onClick={() => { setDrawKey((k) => k + 1); setStep('draw'); }}><span>Tegn en til</span></button>
            <button type="button" className="kid-big kid-big--green kid-big--cta" onClick={() => router.push(backTo)}><span>Ferdig</span></button>
          </section>
        )}

        {step === 'error' && (
          <section className="kid-screen kid-done">
            <div className="kid-done__badge kid-done__badge--amber"><Icon name="flag" size={50} strokeWidth={2} /></div>
            <h1 className="kid-title">Oisann!</h1>
            <p className="kid-sub">{error}</p>
            <button type="button" className="kid-big kid-big--green kid-big--cta" onClick={() => setStep('draw')}><span>Prøv igjen</span></button>
          </section>
        )}
      </main>
    </>
  );
}
