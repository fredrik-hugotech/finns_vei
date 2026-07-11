import Link from 'next/link';
import { useState } from 'react';
import Icon from './Icon';
import { KID_COMMANDMENTS } from '../lib/safetyCommandments';

// Rotate through the five child commandments so a kid meets a new one after
// each trip (persisted per device). Runs once, on the client, in useState init.
function pickRotatingKidBud() {
  let idx = 0;
  if (typeof window !== 'undefined') {
    try {
      idx = parseInt(window.localStorage.getItem('ff-bud-idx') || '0', 10) || 0;
      window.localStorage.setItem('ff-bud-idx', String((idx + 1) % KID_COMMANDMENTS.length));
    } catch (_e) { /* ignore */ }
  }
  return KID_COMMANDMENTS[idx % KID_COMMANDMENTS.length];
}

// Shown to a child right after they log a trip. Praises the effort, shows how
// far they went, calls out the weather bonus, and teaches one of Finns 10 bud
// — instead of dropping them into the competition standings.
export default function TripCelebration({ km, mode = 'sykkel', weatherKind = null, onDone }) {
  const [bud] = useState(pickRotatingKidBud);
  const verb = mode === 'gange' ? 'gikk' : 'syklet';
  const isPrecip = weatherKind === 'rain' || weatherKind === 'sleet' || weatherKind === 'snow';
  const weatherWord = weatherKind === 'snow' ? 'snøen' : 'regnet';

  return (
    <section className="kid-screen kid-done trip-cheer">
      <div className="kid-done__badge"><Icon name="check" size={56} strokeWidth={2.2} /></div>
      <h1 className="kid-title">Bra jobba!</h1>
      <p className="kid-big-number">{km} km</p>
      <p className="kid-sub">Du {verb} {km} km i dag.</p>

      {isPrecip && (
        <div className="trip-cheer__weather">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14a5 5 0 0 1 1.4-9.8A6 6 0 0 1 17 6a4 4 0 0 1 1 7.9" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>
          Værhelt! Du var ute i {weatherWord} – ekstra tøft.
        </div>
      )}

      {bud && (
        <div className="trip-cheer__bud">
          <span className="trip-cheer__bud-label">Finns bud {bud.n}</span>
          <strong>{bud.title}</strong>
          <p>{bud.text}</p>
        </div>
      )}

      <button type="button" className="kid-big kid-big--green" onClick={onDone}><span>Ferdig</span></button>
      <Link href="/bud" className="trip-cheer__budlink">Se alle 10 bud ›</Link>
    </section>
  );
}
