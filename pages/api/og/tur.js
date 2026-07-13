import { ImageResponse } from 'next/og';
import { WEATHER_LABEL, isPrecipKind } from '../../../lib/weather';

// Shareable "turkort" image for a completed trip on the kids' bike/walk-to-
// -school tracker (pages/sykle.js → components/TripCelebration.js). Mirrors
// the pattern in pages/api/og/sak/[id].js (next/og's built-in ImageResponse,
// Satori under the hood) but takes its data from QUERY PARAMS ONLY — a trip
// has no durable server-side id/record to look up, and no DB read is wanted
// here, so km/mode/weather are passed straight from the celebration screen.
export const config = {
  runtime: 'edge',
};

const WIDTH = 1200;
const HEIGHT = 630;

const CREAM = '#f4f6f2';
const CREAM_MUTED = 'rgba(244, 246, 242, 0.72)';
const GREEN = '#0b5d4d';
const GREEN_DARK = '#08463a';
const AMBER = '#F4C542';

const MODE_LABEL = {
  sykkel: 'syklet',
  gange: 'gikk',
};

function BrandMark({ size = 40 }) {
  // Same three-circle mark as og/sak/[id].js's BrandMark — kept in sync by
  // hand since satori can't share components across edge route modules any
  // more easily than it can take arbitrary SVG markup.
  const ring = Math.round(size * 0.62);
  const dot = Math.round(size * 0.68);
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          width: ring,
          height: ring,
          borderRadius: '50%',
          border: `${Math.max(3, Math.round(size * 0.14))}px solid ${CREAM}`,
          marginRight: Math.round(size * 0.18),
        }}
      />
      <div
        style={{
          display: 'flex',
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: CREAM,
          marginRight: Math.round(size * -0.22),
        }}
      />
      <div
        style={{
          display: 'flex',
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: CREAM,
        }}
      />
    </div>
  );
}

// Query params are free-text from a share link, so every value is parsed
// defensively and falls back to something sane rather than ever throwing.
function parseParams(url) {
  const params = new URL(url).searchParams;

  const kmRaw = Number(params.get('km'));
  const km = Number.isFinite(kmRaw) && kmRaw > 0 ? Math.min(kmRaw, 999) : null;

  const modeRaw = params.get('mode');
  const mode = modeRaw === 'gange' ? 'gange' : 'sykkel';

  const weatherRaw = params.get('weather');
  const weatherKind = Object.prototype.hasOwnProperty.call(WEATHER_LABEL, weatherRaw) ? weatherRaw : null;

  return { km, mode, weatherKind };
}

export default async function handler(req) {
  const { km, mode, weatherKind } = parseParams(req.url);

  const verb = MODE_LABEL[mode];
  const headline = km != null ? `${km} km` : 'Fullført tur';
  const sub = km != null ? `${verb} ${km} km i dag` : `Ute og ${verb === 'gikk' ? 'gikk' : 'syklet'} i dag`;
  const weatherLabel = weatherKind ? WEATHER_LABEL[weatherKind] : null;
  const isPrecip = isPrecipKind(weatherKind);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: 72,
          background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`,
          color: CREAM,
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark size={44} />
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>Finns Fairway</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 24 }}>
          {isPrecip && weatherLabel && (
            <div style={{ display: 'flex' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 24px',
                  borderRadius: 999,
                  background: AMBER,
                  color: GREEN_DARK,
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                Værhelt · {weatherLabel}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 88, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            {headline}
          </div>
          <div style={{ display: 'flex', fontSize: 34, lineHeight: 1.45, color: CREAM_MUTED }}>
            {sub}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 24, color: CREAM_MUTED }}>Sykle/gå til skolen · finns-fairway.no</div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
