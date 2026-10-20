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
  const [step, setStep] = useState('intro'); // intro | draw | done | error
  const [adult, setAdult] = useState(false);
  const [mode, setMode] = useState('sykkel');
  const [routeType, setRouteType] = useState('fritid');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedKm, setSavedKm] = useState('');
  const [drawKey, setDrawKey] = useState(0);

  // Coming from the "Hvem logger turen?" step, the adult has already said so.
  useEffect(() => {
    if (router.isReady && router.query.voksen === '1') setAdult(true);
  }, [router.isReady, router.query.voksen]);

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
          <RouteDrawer key={drawKey} mode={mode} saving={saving} onSave={save} onCancel={() => setStep('intro')} />
        )}

        {step === 'intro' && (
          <section className="kid-screen rd-intro">
            <button type="button" className="kid-back" onClick={() => router.push(backTo)}><Icon name="chevronLeft" size={20} strokeWidth={2.2} />Tilbake</button>
            <h1 className="kid-title">Tegn en fast rute</h1>
            <p className="kid-sub">
              Vis veien barnet bruker, for eksempel til trening eller skole. Da ser Finns Fairway hvor barn ferdes,
              og hvor det trengs tryggere veier.
            </p>

            <span className="kid-label">Hvordan?</span>
            <div className="kid-choice">
              <button type="button" className={mode === 'sykkel' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setMode('sykkel'); }}><Icon name="bike" size={26} /><span>Sykle</span></button>
              <button type="button" className={mode === 'gange' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setMode('gange'); }}><Icon name="walk" size={26} /><span>Gå</span></button>
            </div>

            <span className="kid-label">Hvor går ruten?</span>
            <div className="kid-choice">
              <button type="button" className={routeType === 'fritid' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setRouteType('fritid'); }}><Icon name="ball" size={26} /><span>Trening og fritid</span></button>
              <button type="button" className={routeType === 'skole' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => { haptic(6); setRouteType('skole'); }}><Icon name="school" size={26} /><span>Skole</span></button>
            </div>

            <label className={adult ? 'rd-adult rd-adult--on' : 'rd-adult'}>
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
              <span className="rd-adult__box" aria-hidden="true">{adult ? <Icon name="check" size={18} /> : null}</span>
              <span>Jeg er voksen og registrerer ruten for et barn</span>
            </label>

            <p className="rd-intro__privacy"><Icon name="shield" size={16} />Start gjerne hjemme. De første 50 meterne fjernes automatisk, og ruten lagres uten navn.</p>

            <button type="button" className="kid-big kid-big--green kid-start" disabled={!adult} onClick={() => { haptic(10); setStep('draw'); }}>
              <Icon name="pencil" size={28} /><span>Start tegning</span>
            </button>
          </section>
        )}

        {step === 'done' && (
          <section className="kid-screen kid-done">
            <div className="kid-done__badge"><Icon name="check" size={56} strokeWidth={2.2} /></div>
            <h1 className="kid-title">Ruten er lagret</h1>
            <p className="kid-big-number">{savedKm} km</p>
            <p className="kid-sub">Takk! Ruten hjelper Finns Fairway å se hvilke veier barna bruker, og hvor det trengs tiltak.</p>
            <button type="button" className="kid-big kid-big--outline kid-big--cta" onClick={() => { setDrawKey((k) => k + 1); setStep('draw'); }}><span>Tegn en rute til</span></button>
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
