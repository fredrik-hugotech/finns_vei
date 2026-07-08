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

const CREAM = '#f4f6f2';
const CREAM_MUTED = 'rgba(244, 246, 242, 0.72)';
const GREEN = '#0b5d4d';
const GREEN_DARK = '#08463a';

const FALLBACK_TITLE = 'Finns Fairway';
const FALLBACK_DESCRIPTION = 'Meld fra om utrygge steder i trafikken, eller se kart over meldinger.';

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

function BrandMark({ size = 40 }) {
  // Redraws the three-circle mark from components/Logo.js with plain divs,
  // since satori can't take arbitrary SVG path/currentColor markup easily.
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

function renderCard({ category, statusLabel, statusColor, description, footer }) {
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
    ),
    { width: WIDTH, height: HEIGHT },
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
    footer: `Sak #${id} · finns-fairway.no`,
  });
}
