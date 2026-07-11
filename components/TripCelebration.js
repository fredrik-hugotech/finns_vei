import { useState } from 'react';
import Icon from './Icon';
import BudTip from './BudTip';
import BudQuiz from './BudQuiz';

// Roughly one trip in three, swap the passive bud tip for a quick interactive
// "sant eller usant" mini-quiz (BudQuiz) instead. Kept low-frequency on purpose
// so the celebration screen stays light and non-naggy rather than turning into
// a quiz every single time — the tip still teaches a bud the rest of the time.
const QUIZ_CHANCE = 1 / 3;

// Shown to a child right after they log a trip. Praises the effort, shows how
// far they went, calls out the weather bonus, and teaches one of Finns 10 bud
// — instead of dropping them into the competition standings.
export default function TripCelebration({ km, mode = 'sykkel', weatherKind = null, onDone }) {
  const verb = mode === 'gange' ? 'gikk' : 'syklet';
  const isPrecip = weatherKind === 'rain' || weatherKind === 'sleet' || weatherKind === 'snow';
  const weatherWord = weatherKind === 'snow' ? 'snøen' : 'regnet';
  const [showQuiz] = useState(() => Math.random() < QUIZ_CHANCE);

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

      {showQuiz ? <BudQuiz /> : <BudTip audience="barn" />}

      <button type="button" className="kid-big kid-big--green kid-big--cta" onClick={onDone}><span>Ferdig</span></button>
    </section>
  );
}
