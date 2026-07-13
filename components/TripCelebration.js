import Icon from './Icon';
import BudTip from './BudTip';

// Shown to a child right after they log a trip. Praises the effort, shows how
// far they went, calls out the weather bonus, and teaches one of Finns 10 bud
// — instead of dropping them into the competition standings. `streak` is the
// on-device Turstreak state from lib/tripStreak.js (optional — older callers
// or a storage error just mean the callout doesn't render).
export default function TripCelebration({ km, mode = 'sykkel', weatherKind = null, streak = null, onDone }) {
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

      {streak?.current > 1 && (
        <div className="trip-cheer__streak">
          <Icon name="flame" size={16} strokeWidth={2} />
          {streak.current} dager på rad!
        </div>
      )}
      {streak?.current === 1 && streak?.isNewStreak && (
        <div className="trip-cheer__streak trip-cheer__streak--new">
          <Icon name="flame" size={16} strokeWidth={2} />
          Første tur logget!
        </div>
      )}

      <BudTip audience="barn" />

      <button type="button" className="kid-big kid-big--green kid-big--cta" onClick={onDone}><span>Ferdig</span></button>
    </section>
  );
}
