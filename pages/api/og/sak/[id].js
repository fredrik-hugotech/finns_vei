import { ImageResponse } from 'next/og';
import { LOGO_PATHS, LOGO_VIEWBOX } from '../../../../lib/brandArtwork';
import { STATUS_COLORS } from '../../../../lib/config';
import { reportStatusMeta } from '../../../../lib/reportStatusMeta';
import { getPublicReportById, hasSupabaseConfig } from '../../../../lib/supabaseRest';
import { checkEdgeRateLimit } from '../../../../lib/rateLimitEdge';

const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

// Social preview card for a public case (`/sak/<id>`). Built with next/og's
// built-in ImageResponse (Satori under the hood), which only understands a
// constrained flexbox-y subset of CSS — every container needs an explicit
// `display`, and there is no dangerouslySetInnerHTML, so brand glyphs are
// redrawn here as plain shapes rather than reusing the HTML icon strings from
// lib/reportCategoryGlyphs.js / lib/reportStatusMeta.js.
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
const FALLBACK_DESCRIPTION = 'Meld fra om utrygge steder i trafikken, eller se kart over meldinger.';

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

// The official logo (lib/brandArtwork.js), drawn as SVG paths in cream.
function BrandLogo({ height = 56 }) {
  const [, , vw, vh] = LOGO_VIEWBOX.split(' ').map(Number);
  return (
    <svg width={Math.round((height * vw) / vh)} height={height} viewBox={LOGO_VIEWBOX}>
      {LOGO_PATHS.map((d) => <path key={d.slice(0, 24)} d={d} fill={CREAM} />)}
    </svg>
  );
}

function renderCard({ category, statusLabel, statusColor, description, footer }) {
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
          border: `3px solid ${CREAM_MUTED}`,
        }}
       >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <BrandLogo height={56} />
          </div>
          <div style={{ display: 'flex', width: 46, height: 12, borderRadius: 999, background: OCHRE }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 24 }}>
          {statusLabel && (
            <div style={{ display: 'flex' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 24px',
                  borderRadius: 999,
                  background: statusColor,
                  color: GREEN_DARK,
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                {statusLabel}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>
            {category}
          </div>
          {description && (
            <div style={{ display: 'flex', fontSize: 30, lineHeight: 1.45, color: CREAM_MUTED, maxWidth: 980 }}>
              {description}
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
      // Case status (and, once set, the public update text) changes over
      // time, so this must not be cached effectively-forever like Next's
      // ImageResponse default — keep it short-lived instead.
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600' },
    },
  );
}

export default async function handler(req) {
  const rateLimit = checkEdgeRateLimit(req, 'og-sak', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: 'For mange forespørsler' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)),
      },
    });
  }

  const { pathname } = new URL(req.url);
  const rawId = pathname.split('/').filter(Boolean).pop() || '';
  let id = '';
  try {
    id = decodeURIComponent(rawId);
  } catch {
    // Malformed percent-encoding in the path segment — fall through to the
    // not-found/fallback card below instead of a 500.
  }

  let report = null;
  if (id && hasSupabaseConfig()) {
    try {
      report = await getPublicReportById(id);
    } catch (_error) {
      report = null;
    }
  }

  if (!report) {
    return renderCard({
      category: FALLBACK_TITLE,
      statusLabel: null,
      statusColor: CREAM,
      description: FALLBACK_DESCRIPTION,
      footer: 'finns-fairway.no',
    });
  }

  const meta = reportStatusMeta(report.status);
  const statusColor = STATUS_COLORS[report.status] || meta.marker || CREAM;

  return renderCard({
    category: report.category || 'Sak',
    statusLabel: meta.label,
    statusColor,
    description: truncate(report.description, 150),
    footer: 'finns-fairway.no',
  });
}
