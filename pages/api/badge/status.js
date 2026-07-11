import { getPublicReportGeoJson, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { buildReportStats } from '../../../lib/reportStats';
import { renderStatusBadgeSvg } from '../../../lib/badgeSvg';

// "Trygghetsbadge" — a live, embeddable SVG stats badge (shields.io-style),
// e.g. "132 meldinger · 68% løst i Norge". Meant to be embedded as a plain
// <img src="/api/badge/status.svg"> on a school/neighbourhood-association
// site (see the "Bygg embed-kode" panel on pages/statistikk.js), so it must
// stay a cheap, cacheable, no-JS image response — no headless browser or
// canvas rendering, just an SVG string built server-side.
//
// Reuses the same aggregation (lib/reportStats.js's buildReportStats) that
// pages/statistikk.js uses, over the same public GeoJSON that GET /api/reports
// serves, so the badge, the stats page and the map never disagree on the
// numbers.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  let stats = { total: 0, resolvedShare: 0 };
  try {
    if (hasSupabaseConfig()) {
      const geojson = await getPublicReportGeoJson();
      stats = buildReportStats(geojson.features || []);
    }
  } catch (error) {
    // A badge embedded on a third-party site should still render something
    // (falls back to a 0/0 badge) rather than surface a broken <img> icon.
    console.error(JSON.stringify({ scope: 'badge', event: 'status_failed', message: String(error?.message || '').slice(0, 240) }));
  }

  const svg = renderStatusBadgeSvg(stats);

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  // Same s-maxage/stale-while-revalidate convention as GET /api/reports, but
  // longer: this will be embedded as an <img> on third-party sites and hit
  // repeatedly, and a stats badge doesn't need second-by-second freshness the
  // way the live map does.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  return res.status(200).send(svg);
}
