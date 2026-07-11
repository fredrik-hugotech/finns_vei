import { WEATHER_LABEL, weatherPraise } from '../lib/weather';

// Ambient weather overlay shown while a trip is being timed.
//  - sun/fair: a bold, celebratory full-screen wash + rays.
//  - rain/sleet/snow: subtle falling particles + a small praise chip, so it
//    reads as "nice touch" rather than stealing focus from the tracker.
// pointer-events: none throughout — it never blocks the controls beneath.

// Deterministic particle layout (no Math.random → no hydration surprises).
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 61) % 100,
  delay: ((i * 0.17) % 1.6).toFixed(2),
  dur: (0.9 + ((i * 7) % 6) * 0.18).toFixed(2),
  drift: ((i % 5) - 2) * 6,
}));

export default function WeatherFx({ kind, tempC }) {
  if (!kind) return null;
  const isPrecip = kind === 'rain' || kind === 'sleet' || kind === 'snow';
  const label = WEATHER_LABEL[kind] || '';
  const praise = weatherPraise(kind);
  const temp = Number.isFinite(Number(tempC)) ? `${Math.round(Number(tempC))}°` : '';

  return (
    <div className={`wfx wfx--${kind}`} aria-hidden="true">
      {kind === 'sun' && (
        <>
          <div className="wfx-sunwash" />
          <div className="wfx-sun"><span className="wfx-sun__core" />{Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="wfx-sun__ray" style={{ transform: `rotate(${i * 30}deg)` }} />
          ))}</div>
        </>
      )}

      {(kind === 'rain' || kind === 'sleet') && (
        <div className="wfx-field">
          {PARTICLES.map((p, i) => (
            <span key={i} className="wfx-drop" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />
          ))}
        </div>
      )}

      {kind === 'snow' && (
        <div className="wfx-field">
          {PARTICLES.map((p, i) => (
            <span key={i} className="wfx-flake" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${(Number(p.dur) * 2.4).toFixed(2)}s`, '--drift': `${p.drift}px` }}>❄</span>
          ))}
        </div>
      )}

      <div className={`wfx-chip wfx-chip--${isPrecip ? 'precip' : 'nice'}`}>
        <span className="wfx-chip__label">{label}{temp ? ` · ${temp}` : ''}</span>
        {praise && <span className="wfx-chip__praise">{praise}</span>}
      </div>
    </div>
  );
}
