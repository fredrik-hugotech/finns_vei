import { useState } from 'react';
import Icon from './Icon';
import BudTip from './BudTip';
import BudQuiz from './BudQuiz';
import { isPrecipKind } from '../lib/weather';
import { BadgeIcon, LevelBar } from './KidProgress';

// Roughly one trip in three, swap the passive bud tip for a quick interactive
// "sant eller usant" mini-quiz (BudQuiz) instead. Kept low-frequency on purpose
// so the celebration screen stays light and non-naggy rather than turning into
// a quiz every single time — the tip still teaches a bud the rest of the time.
const QUIZ_CHANCE = 1 / 3;

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 6) * 0.12}s`,
  hue: ['#0b5d4d', '#d99a12', '#e8590c', '#1d4ed8', '#c2185b'][i % 5],
  rot: `${(i * 53) % 360}deg`,
}));

// Shown to a child right after they log a trip. Praises the effort, shows how
// far they went, unlocks badges / levels, calls out the weather bonus, and
// teaches one of Finns 10 bud — instead of dropping them into the standings.
//
// `queued` is true when the trip couldn't reach the server right away and was
// parked in lib/offlineTripQueue.js for automatic resend. The trip still
// counts, so only a small, calm note is added.
export default function TripCelebration({ km, mode = 'sykkel', weatherKind = null, queued = false, progress = null, newBadges = [], onDone }) {
  const verb = mode === 'gange' ? 'gikk' : 'syklet';
  const isPrecip = isPrecipKind(weatherKind);
  const weatherWord = weatherKind === 'snow' ? 'snøen' : weatherKind === 'sleet' ? 'sluddet' : 'regnet';
  const [showQuiz] = useState(() => Math.random() < QUIZ_CHANCE);
  const levelledUp = progress?.level && progress.level.index > 0 && progress.level.percent === 0;

  return (
    <section className="kid-screen kid-done trip-cheer">
      <div className="cheer-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <i key={i} style={{ left: c.left, animationDelay: c.delay, background: c.hue, '--rot': c.rot }} />
        ))}
      </div>

      <div className="kid-done__badge"><Icon name="check" size={56} strokeWidth={2.2} /></div>
      <h1 className="kid-title">Bra jobba!</h1>
      <p className="kid-big-number">{km} km</p>
      <p className="kid-sub">Du {verb} {km} km i dag.</p>

      {queued && (
        <p className="trip-cheer__queued">
          Turen er lagret på enheten – sendes automatisk når du får dekning igjen.
        </p>
      )}

      {newBadges.length > 0 && (
        <div className="cheer-unlock">
          <span className="cheer-unlock__label">{newBadges.length === 1 ? 'Nytt merke!' : `${newBadges.length} nye merker!`}</span>
          <ul className="cheer-unlock__list">
            {newBadges.map((b) => (
              <li key={b.id} className="cheer-unlock__badge">
                <span className="cheer-unlock__icon"><BadgeIcon icon={b.icon} /></span>
                <strong>{b.name}</strong>
                <span>{b.how}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {levelledUp && (
        <p className="cheer-level">Nytt nivå: <strong>{progress.level.name}</strong></p>
      )}

      {progress && <LevelBar progress={progress} compact />}

      {isPrecip && (
        <div className="trip-cheer__weather">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14a5 5 0 0 1 1.4-9.8A6 6 0 0 1 17 6a4 4 0 0 1 1 7.9" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>
          Værhelt! Du var ute i {weatherWord} – ekstra tøft.
        </div>
      )}

      {showQuiz ? <BudQuiz /> : <BudTip audience="barn" />}

      <div className="trip-cheer__off">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.4" /><path d="M10.5 5.5h3" /></svg>
        Legg telefonen bort nå, og kos deg med vennene dine.
      </div>

      <button type="button" className="kid-big kid-big--green kid-big--cta" onClick={onDone}><span>Ferdig</span></button>
    </section>
  );
}
