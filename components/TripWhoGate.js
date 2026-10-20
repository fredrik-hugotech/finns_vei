import { useState } from 'react';
import Icon from './Icon';

function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

// "Hvem logger turen?" — asked every time a trip is about to be logged, so it
// is always clear who is behind the phone:
//   - a child aged 13 or older logs their own trip live,
//   - a child under 13 is told that an adult who is along on the trip logs
//     it (on the adult's phone), ideally riding/walking with others from the
//     club — they never log location on their own,
//   - an adult either logs live while along on the trip, or draws a regular
//     route (to training, school …) on the map.
// The age itself is never stored; only who logged ('barn13' | 'voksen').
//
// onPick(choice): 'barn13' | 'voksen-live' | 'voksen-tegn'
export default function TripWhoGate({ onPick, onBack, variant = 'kid' }) {
  const [step, setStep] = useState('who'); // who | under13 | adult
  const [why, setWhy] = useState(false);
  const go = (next) => { haptic(6); setStep(next); };
  const pick = (choice) => { haptic(10); onPick?.(choice); };
  const back = () => { haptic(6); if (step === 'who') onBack?.(); else setStep('who'); };

  return (
    <div className={`who who--${variant}`}>
      {onBack || step !== 'who' ? (
        <button type="button" className="who__back" onClick={back}><Icon name="chevronLeft" size={20} strokeWidth={2.2} />Tilbake</button>
      ) : null}

      {step === 'who' && (
        <>
          <h2 className="who__title">Hvem logger turen?</h2>
          <div className="who__options">
            <button type="button" className="who-opt" onClick={() => pick('barn13')}>
              <span className="who-opt__ic"><Icon name="bike" size={26} /></span>
              <span className="who-opt__txt"><strong>Jeg er 13 år eller eldre</strong><span>Du logger turen selv</span></span>
              <Icon name="chevronRight" size={20} strokeWidth={2} />
            </button>
            <button type="button" className="who-opt" onClick={() => go('under13')}>
              <span className="who-opt__ic who-opt__ic--amber"><Icon name="child" size={26} /></span>
              <span className="who-opt__txt"><strong>Jeg er under 13 år</strong><span>En voksen logger turen for deg</span></span>
              <Icon name="chevronRight" size={20} strokeWidth={2} />
            </button>
            <button type="button" className="who-opt" onClick={() => go('adult')}>
              <span className="who-opt__ic"><Icon name="user" size={26} /></span>
              <span className="who-opt__txt"><strong>Jeg er voksen</strong><span>Forelder, trener eller annen voksen</span></span>
              <Icon name="chevronRight" size={20} strokeWidth={2} />
            </button>
          </div>
          <button type="button" className="who__why" aria-expanded={why} onClick={() => setWhy((v) => !v)}>
            <Icon name="shield" size={16} />Hvorfor spør vi om dette?
          </button>
          {why && (
            <p className="who__whytext">
              Barn under 13 år skal ikke logge hvor de er, og skal ikke trenge egen telefon.
              Vi lagrer aldri alder eller navn.
            </p>
          )}
        </>
      )}

      {step === 'under13' && (
        <>
          <h2 className="who__title who__title--icon"><span className="who__badge" aria-hidden="true"><Icon name="users" size={24} strokeWidth={1.8} /></span>En voksen logger turen</h2>
          <p className="who__lead">
            Under 13 år logger en voksen som er med på turen, på sin telefon. Du trenger ikke egen telefon.
          </p>
          <div className="who__tip">
            <Icon name="users" size={20} />
            <span><strong>Sykle eller gå sammen med andre</strong>gjerne fra klubben din. Det er tryggere og morsommere.</span>
          </div>
          <button type="button" className="who__primary" onClick={() => go('adult')}>
            <Icon name="user" size={20} />Jeg er voksen og er med på turen
          </button>
        </>
      )}

      {step === 'adult' && (
        <>
          <h2 className="who__title">Hvordan vil du registrere turen?</h2>
          <div className="who__options">
            <button type="button" className="who-opt" onClick={() => pick('voksen-live')}>
              <span className="who-opt__ic"><Icon name="route" size={26} /></span>
              <span className="who-opt__txt"><strong>Logg turen nå</strong><span>Telefonen din følger turen. Du må være med.</span></span>
              <Icon name="chevronRight" size={20} strokeWidth={2} />
            </button>
            <button type="button" className="who-opt" onClick={() => pick('voksen-tegn')}>
              <span className="who-opt__ic"><Icon name="pencil" size={24} /></span>
              <span className="who-opt__txt"><strong>Tegn ruten på kartet</strong><span>Trykk deg fram langs veien barnet bruker.</span></span>
              <Icon name="chevronRight" size={20} strokeWidth={2} />
            </button>
          </div>
          <p className="who__note">Ruten lagres uten navn, og de første 50 meterne fra start fjernes alltid.</p>
        </>
      )}
    </div>
  );
}
