// Builds the "Trygghetsbadge" — a shields.io-style embeddable SVG stat badge
// (see pages/api/badge/status.js) — as a plain SVG string. No headless browser,
// no canvas: just two rounded rectangles and two <text> elements, the same
// spirit as shields.io's own flat badge style.
//
// Kept in lib/ (rather than inline in the API route) so the pure string-building
// logic can be exercised directly from a throwaway Node script without needing
// a running Next.js server or a real HTTP request.

const LABEL_TEXT = 'Finns Fairway';
const LABEL_BG = '#0b5d4d';
const MESSAGE_BG = '#2d2d2d';
const TEXT_COLOR = '#f4f6f2';
const SHADOW_COLOR = '#010101';
const FONT_SIZE = 11;
const HEIGHT = 20;
const H_PADDING = 8; // left/right padding inside each pill segment
const CORNER_RADIUS = 3;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Rough per-character advance widths for an ~11px sans-serif. This is a
// deliberately simple estimate (no font-metrics table, no canvas measureText)
// that errs on the wide side, so segment widths grow with the real string
// instead of ever being hardcoded — a 5-digit report count or a long share
// number just makes its segment wider, nothing clips.
function textWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    if ('iIl.,:;\'|!'.includes(ch)) width += 4;
    else if ('mMW'.includes(ch)) width += 11;
    else if (/[A-ZÆØÅ]/.test(ch)) width += 8;
    else if (/[0-9%]/.test(ch)) width += 7;
    else if (ch === ' ') width += 4;
    else width += 6.5;
  }
  return width;
}

function segment(text) {
  return { text, width: Math.round(textWidth(text) + H_PADDING * 2) };
}

// Formats a count for display: Norwegian (nb-NO) thousands grouping, so a
// 4-5 digit report count still reads cleanly (e.g. "12 345") instead of
// running the digits together.
function formatCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('nb-NO') : '0';
}

function formatShare(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// `stats` is the shape returned by lib/reportStats.js's buildReportStats():
// at minimum `{ total, resolvedShare }`. `scopeLabel`, if given, replaces
// "i Norge" (e.g. a category or municipality name) for a scoped badge.
export function renderStatusBadgeSvg({ total = 0, resolvedShare = 0 } = {}, { scopeLabel = 'i Norge' } = {}) {
  const totalLabel = formatCount(total);
  const shareLabel = formatShare(resolvedShare);
  const messageText = `${totalLabel} meldinger · ${shareLabel}% løst ${scopeLabel}`.trim();

  const label = segment(LABEL_TEXT);
  const message = segment(messageText);
  const width = label.width + message.width;
  const labelX = label.width / 2;
  const messageX = label.width + message.width / 2;
  const textY = HEIGHT / 2 + 4;

  const ariaLabel = escapeXml(`${LABEL_TEXT}: ${totalLabel} meldinger, ${shareLabel} prosent løst ${scopeLabel}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" role="img" aria-label="${ariaLabel}">
<title>${ariaLabel}</title>
<linearGradient id="tb-shadow" x2="0" y2="100%">
<stop offset="0" stop-color="#fff" stop-opacity=".08"/>
<stop offset="1" stop-opacity=".12"/>
</linearGradient>
<clipPath id="tb-round">
<rect width="${width}" height="${HEIGHT}" rx="${CORNER_RADIUS}" fill="#fff"/>
</clipPath>
<g clip-path="url(#tb-round)">
<rect width="${label.width}" height="${HEIGHT}" fill="${LABEL_BG}"/>
<rect x="${label.width}" width="${message.width}" height="${HEIGHT}" fill="${MESSAGE_BG}"/>
<rect width="${width}" height="${HEIGHT}" fill="url(#tb-shadow)"/>
</g>
<g fill="${TEXT_COLOR}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${FONT_SIZE}">
<text x="${labelX}" y="${textY}" fill="${SHADOW_COLOR}" fill-opacity=".3">${escapeXml(label.text)}</text>
<text x="${labelX}" y="${textY - 1}">${escapeXml(label.text)}</text>
<text x="${messageX}" y="${textY}" fill="${SHADOW_COLOR}" fill-opacity=".3">${escapeXml(message.text)}</text>
<text x="${messageX}" y="${textY - 1}">${escapeXml(message.text)}</text>
</g>
</svg>`;
}

export const __internal = { textWidth, escapeXml, formatCount, formatShare };
