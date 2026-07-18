import { ImageResponse } from 'next/og';
import { STATUS_COLORS } from '../../../../lib/config';
import { reportStatusMeta } from '../../../../lib/reportStatusMeta';
import { getPublicReportById, hasSupabaseConfig } from '../../../../lib/supabaseRest';

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
            <BrandMark size={44} />
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: -0.5, marginLeft: 18 }}>Finns Fairway</div>
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
  const { pathname } = new URL(req.url);
  const id = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');

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
