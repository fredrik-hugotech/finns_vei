import Icon from './Icon';

// Shown to a child right after they log a trip. Praises the effort, ties it to
// traffic safety, and shows how far they went — instead of dropping them into
// the competition standings (which mean nothing to a kid).
const SAFETY_LINES = [
  'Hver tur gjør skoleveien litt tryggere for alle barn.',
  'Jo flere som sykler og går, jo roligere kjører bilene.',
  'Du viser vei for andre – bra for hele nabolaget!',
];

export default function TripCelebration({ km, mode = 'sykkel', weatherKind = null, onDone }) {
  const verb = mode === 'gange' ? 'gikk' : 'syklet';
  const isPrecip = weatherKind === 'rain' || weatherKind === 'sleet' || weatherKind === 'snow';
  const weatherWord = weatherKind === 'snow' ? 'snøen' : 'regnet';
  const safety = SAFETY_LINES[String(km || '').length % SAFETY_LINES.length];

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

      <p className="trip-cheer__safety">{safety} Takk for at du logget turen!</p>

      <button type="button" className="kid-big kid-big--green" onClick={onDone}><span>Ferdig</span></button>
    </section>
  );
}
