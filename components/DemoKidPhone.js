import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import Logo from './Logo';
import TripCelebration from './TripCelebration';
import TripWhoGate from './TripWhoGate';

// The children's app as it looks during a competition, shown in a phone
// frame on top of the /demo map for the guided tour. Same markup and styles
// as /sykle, TripTracker and TripCelebration, with fixed demo values and no
// GPS or network. The tracking screen draws a real route from the demo data
// on a Mapbox static map.
const SCREEN_W = 390;
const SCREEN_H = 844;

function useFitScale() {
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const fit = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      if (w < 720) { setScale(Math.min(1, (h * 0.6) / (SCREEN_H + 28), (w - 32) / (SCREEN_W + 28))); return; }
      setScale(Math.min(1, (h * 0.86) / (SCREEN_H + 28)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

function staticMapUrl(path) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !Array.isArray(path) || path.length < 2) return null;
  const step = Math.max(1, Math.ceil(path.length / 60));
  const coords = path.filter((_, i) => i % step === 0 || i === path.length - 1)
    .map(([lng, lat]) => [Number(Number(lng).toFixed(5)), Number(Number(lat).toFixed(5))]);
  const line = { type: 'Feature', properties: { stroke: '#0d6b52', 'stroke-width': 7, 'stroke-opacity': 0.95 }, geometry: { type: 'LineString', coordinates: coords } };
  const [elng, elat] = coords[coords.length - 1];
  const overlay = `geojson(${encodeURIComponent(JSON.stringify(line))}),pin-s+0d6b52(${elng},${elat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/auto/${SCREEN_W}x${SCREEN_H}@2x?padding=90,50,430,50&access_token=${token}`;
}

function SetupScreen({ competitionName, clubs }) {
  const [club, setClub] = useState(clubs[0] || '');
  const [helmet, setHelmet] = useState(true);
  const [mode, setMode] = useState('sparkesykkel');
  const [routeType, setRouteType] = useState('fritid');
  return (
    <section className="kid-screen kid-screen--fit">
      <span className="kid-back"><Icon name="chevronLeft" size={20} strokeWidth={2.2} />Tilbake</span>
      <p className="kid-comp-note kid-comp-note--live"><Icon name="trophy" size={16} /> Turen teller i <strong>{competitionName}</strong></p>
      <div className="kid-choice kid-choice--3">
        <button type="button" className={mode === 'sykkel' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => setMode('sykkel')}><Icon name="bike" size={26} /><span>Sykle</span></button>
        <button type="button" className={mode === 'sparkesykkel' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => setMode('sparkesykkel')}><Icon name="scooter" size={26} /><span>Sparkesykkel</span></button>
        <button type="button" className={mode === 'gange' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => setMode('gange')}><Icon name="walk" size={26} /><span>Gå</span></button>
      </div>
      <div className="kid-choice">
        <button type="button" className={routeType === 'fritid' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => setRouteType('fritid')}><Icon name="ball" size={26} /><span>Fritid</span></button>
        <button type="button" className={routeType === 'skole' ? 'kid-pick kid-pick--on' : 'kid-pick'} onClick={() => setRouteType('skole')}><Icon name="school" size={26} /><span>Skole</span></button>
      </div>
      <div className="kid-clubs">
        {clubs.slice(0, 4).map((c) => (
          <button type="button" key={c} className={club === c ? 'kid-club kid-club--on' : 'kid-club'} onClick={() => setClub(c)}>{c}</button>
        ))}
      </div>
      <button type="button" className={helmet ? 'kid-helmet kid-helmet--on' : 'kid-helmet'} onClick={() => setHelmet((v) => !v)}>
        <Icon name="helmet" size={26} /><span>Jeg har hjelm</span><span className="kid-helmet__check">{helmet ? <Icon name="check" size={22} /> : ''}</span>
      </button>
      <button type="button" className="kid-big kid-big--green kid-start"><Icon name={mode === 'sparkesykkel' ? 'scooter' : mode === 'gange' ? 'walk' : 'bike'} size={34} /><span>Start tur</span></button>
    </section>
  );
}

function TrackingScreen({ path }) {
  const src = useMemo(() => staticMapUrl(path), [path]);
  return (
    <div className="dk-track">
      {src ? <img className="dk-track__map" src={src} alt="" /> : <div className="dk-track__map dk-track__map--empty" />}
      <div className="trip-tracker" aria-label="Sykkeltur pågår">
        <div className="trip-tracker__head">
          <span className="trip-tracker__pill"><Icon name="ball" size={15} />Fritidsrute</span>
          <span className="trip-tracker__pill trip-tracker__pill--ok"><Icon name="helmet" size={15} />Hjelm</span>
        </div>
        <div className="bike-track" aria-hidden="true">
          <div className="bike-track__road" />
          <div className="bike-track__bike"><Icon name="bike" size={34} strokeWidth={1.7} /></div>
        </div>
        <div className="trip-tracker__stats trip-tracker__stats--two">
          <div><strong>1,8</strong><span>km</span></div>
          <div><strong>0</strong><span>utrygge</span></div>
        </div>
        <button type="button" className="big-button trip-tracker__unsafe"><Icon name="flag" size={20} /> Marker utrygt punkt her</button>
        <div className="trip-tracker__actions">
          <button type="button" className="big-button big-button--secondary">Avbryt</button>
          <button type="button" className="big-button trip-tracker__stop"><Icon name="stop" size={18} /> Stopp og lagre</button>
        </div>
      </div>
    </div>
  );
}

export default function DemoKidPhone({ screen, competitionName = 'Sykle til trening', clubs = [], path = null }) {
  const scale = useFitScale();
  return (
    <div className="dk" aria-hidden="false">
      <div className="dk__phone" style={{ width: (SCREEN_W + 28) * scale, height: (SCREEN_H + 28) * scale }}>
        <div className="dk__bezel" style={{ transform: `scale(${scale})` }}>
          <div className="dk__screen" key={screen}>
            <div className="dk__status" aria-hidden="true"><span>07:42</span><span className="dk__notch" /><span>100 %</span></div>
            <div className="dk__app kid-app">
              {screen === 'who' && <section className="kid-screen kid-screen--fit"><TripWhoGate onPick={() => {}} onBack={() => {}} /></section>}
              {screen === 'under13' && <section className="kid-screen kid-screen--fit"><TripWhoGate initialStep="under13" onPick={() => {}} onBack={() => {}} /></section>}
              {screen === 'setup' && <SetupScreen competitionName={competitionName} clubs={clubs} />}
              {screen === 'tracking' && <TrackingScreen path={path} />}
              {screen === 'done' && <TripCelebration km="2,4" mode="sykkel" weatherKind="rain" quiz={false} onDone={() => {}} />}
              {screen === 'brand' && <div className="kid-screen kid-hub"><div className="kid-brand"><Logo size="md" /></div></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
