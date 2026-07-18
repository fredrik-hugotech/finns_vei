import { ImageResponse } from 'next/og';
import { getCompetitionStats, hasSupabaseConfig } from '../../../../../lib/supabaseRest';

// Printable "winner certificate" for a finished cycling/walking competition.
// Mirrors pages/api/og/sak/[id].js: built with next/og's built-in
// ImageResponse (Satori under the hood, only a constrained flexbox-y subset
// of CSS, no dangerouslySetInnerHTML) — so the brand mark and every accent
// here is redrawn as plain divs, same as the case share-card, rather than
// reusing SVG icon strings.
export const config = {
  runtime: 'edge',
};

const WIDTH = 1200;
const HEIGHT = 630;

const CREAM = '#fdf7e6';
const CREAM_MUTED = 'rgba(253, 247, 230, 0.74)';
const GREEN = '#276a4a';
const GREEN_DARK = '#1a4d34';
const OCHRE = '#e3a13a';

const FALLBACK_TITLE = 'Finns Fairway';
const FALLBACK_DESCRIPTION = 'Diplomer for vinnerklubben deles her når en konkurranse er avsluttet.';

const MONTHS_NB = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

function formatDateNb(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]}`;
}

function periodLabelFor(competition) {
  const start = formatDateNb(competition?.starts_on);
  const end = formatDateNb(competition?.ends_on);
  if (start && end) return `${start} – ${end}`;
  if (end) return `Til ${end}`;
  if (start) return `Fra ${start}`;
  return null;
}

// Same "is this competition over" rule the UI uses: an explicit ends_on date
// in the past, or the backoffice has switched it off (active: false).
function isCompetitionOver(competition) {
  if (!competition) return false;
  if (competition.active === false) return true;
  if (!competition.ends_on) return false;
  const end = new Date(`${competition.ends_on}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
}

function metricValueText(metric, entry) {
  if (metric === 'distance') {
    const km = (Number(entry?.distanceM) || 0) / 1000;
    const rounded = Math.round(km * 10) / 10;
    return `${String(rounded).replace('.', ',')} km`;
  }
  const trips = Number(entry?.trips) || 0;
  return `${trips} ${trips === 1 ? 'tur' : 'turer'}`;
}

function BrandMark({ size = 44 }) {
  // Faithful redraw of the official three-circle mark (public/brand/
  // finns-fairway-mark.svg, viewBox 48): a small outline ring top-right with
  // two filled dots along the bottom — an L / triangle, NOT a horizontal row.
  const s = size / 48;
  const ring = 11 * s;
  const dot = 14 * s;
  const border = Math.max(2, Math.round(3 * s));
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: Math.round(42 * s) }}>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: Math.round(28 * s),
          top: Math.round(9 * s),
          width: ring,
          height: ring,
          borderRadius: '50%',
          border: `${border}px solid ${CREAM}`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: Math.round(7.5 * s),
          top: Math.round(26.5 * s),
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: CREAM,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: Math.round(26.5 * s),
          top: Math.round(26.5 * s),
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: CREAM,
        }}
      />
    </div>
  );
}

function Pill({ children, background = OCHRE, color = GREEN_DARK, fontSize = 26 }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 24px',
        borderRadius: 999,
        background,
        color,
        fontSize,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

function renderCertificate({ badge, eyebrow, title, metricLabel, periodLabel, description, footer }) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: 44,
          background: GREEN,
          color: CREAM,
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: 52,
            borderRadius: 34,
            border: `3px solid ${OCHRE}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <BrandMark size={44} />
              <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: -0.5, marginLeft: 18 }}>Finns Fairway</div>
            </div>
            {badge && <Pill fontSize={24}>{badge}</Pill>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20 }}>
            {eyebrow && (
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: CREAM_MUTED }}>{eyebrow}</div>
            )}
            <div style={{ display: 'flex', fontSize: 70, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>
              {title}
            </div>
            {description && (
              <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.45, color: CREAM_MUTED, maxWidth: 980 }}>
                {description}
              </div>
            )}
            {(metricLabel || periodLabel) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                {metricLabel && <Pill fontSize={28}>{metricLabel}</Pill>}
                {periodLabel && <div style={{ display: 'flex', fontSize: 24, color: CREAM_MUTED }}>{periodLabel}</div>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', fontSize: 24, color: CREAM_MUTED }}>{footer}</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      // The certificate flips from "Snart klart" to a real finished
      // certificate once the competition ends, so this must not be cached
      // effectively-forever like Next's ImageResponse default.
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600' },
    },
  );
}

function fallbackCard(description = FALLBACK_DESCRIPTION) {
  return renderCertificate({
    badge: null,
    eyebrow: null,
    title: FALLBACK_TITLE,
    description,
    footer: 'finns-fairway.no',
  });
}

export default async function handler(req) {
  const { pathname } = new URL(req.url);
  // .../konkurranse/<id>/sertifikat — id is the second-to-last segment.
  const parts = pathname.split('/').filter(Boolean);
  const id = decodeURIComponent(parts[parts.length - 2] || '');

  if (!id || !hasSupabaseConfig()) {
    return fallbackCard();
  }

  let stats = null;
  try {
    stats = await getCompetitionStats(id);
  } catch (_error) {
    stats = null;
  }

  if (!stats || !stats.competition) {
    return fallbackCard();
  }

  const { competition, metric, leaderboard, totals } = stats;

  if (!isCompetitionOver(competition)) {
    return renderCertificate({
      badge: 'DIPLOM',
      eyebrow: 'Snart klart',
      title: truncate(competition.name, 34) || FALLBACK_TITLE,
      description: 'Diplomet er klart når konkurransen er avsluttet.',
      footer: 'finns-fairway.no',
    });
  }

  const hasData = Number(totals?.trips) > 0 && Array.isArray(leaderboard) && leaderboard.length > 0;
  if (!hasData) {
    return renderCertificate({
      badge: 'DIPLOM',
      eyebrow: truncate(competition.name, 40),
      title: 'Ingen turer registrert',
      description: 'Konkurransen er avsluttet uten registrerte turer.',
      periodLabel: periodLabelFor(competition),
      footer: 'finns-fairway.no',
    });
  }

  const winner = leaderboard[0];

  return renderCertificate({
    badge: 'DIPLOM',
    eyebrow: `Vinner av ${truncate(competition.name, 46)}`,
    title: truncate(winner.club, 26) || 'Vinnerklubben',
    metricLabel: metricValueText(metric, winner),
    periodLabel: periodLabelFor(competition),
    footer: 'finns-fairway.no',
  });
}
