import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { hasSupabaseConfig } from '../../../lib/supabaseRest';
import { gisAnalysis } from '../../../lib/aiStats';
import { loadRows } from '../../../lib/finnJobs';

// Kartanalyse: the reported places seen through maps and registers —
// children, schools, kindergartens, traffic, road layout and accidents.
export default async function handler(req, res) {
  const rl = checkRequestRateLimit(req, 'backoffice-kartanalyse', 60, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forsøk.' });
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  try {
    const rows = await loadRows();
    const kommune = typeof req.query.kommune === 'string' ? req.query.kommune : '';
    const scope = kommune ? rows.filter((r) => r.kommune === kommune) : rows;
    const groups = new Map();
    for (const r of rows) { if (!r.kommune) continue; if (!groups.has(r.kommune)) groups.set(r.kommune, []); groups.get(r.kommune).push(r); }
    const kommuner = [...groups.entries()].filter(([, list]) => list.length >= 5).map(([kode, list]) => ({ kode, navn: list[0].kommune_navn, fylke: list[0].fylke, ...gisAnalysis(list) }))
      .sort((a, b) => b.saker - a.saker);
    const risk = scope
      .filter((r) => r.status !== 'Fullført' && Number(r.barn_6_15_1km) >= 300 && (Number(r.aadt) >= 4000 || Number(r.speed_limit) >= 50) && (r.has_sidewalk === false || Number(r.crossings_100m) === 0 || Number(r.crossing_gap_m) > 300 || Number(r.destinations_far_from_crossing) > 0 || Number(r.acc_vulnerable_10y) > 0))
      .sort((a, b) => b.score - a.score).slice(0, 40)
      .map((r) => ({ id: r.id, kommune_navn: r.kommune_navn, category: r.category, summary: r.summary, measure: r.measure, aadt: r.aadt, speed_limit: r.speed_limit, barn_6_15_1km: r.barn_6_15_1km, acc_10y: r.acc_10y, acc_vulnerable_10y: r.acc_vulnerable_10y, has_sidewalk: r.has_sidewalk, crossings_100m: r.crossings_100m, nearest_school_m: r.nearest_school_m, crossing_gap_m: r.crossing_gap_m, destinations_far_from_crossing: r.destinations_far_from_crossing }));
    return res.status(200).json({ scope: kommune ? (scope[0]?.kommune_navn || kommune) : 'Hele landet', analysis: gisAnalysis(scope), kommuner, risk });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lage kartanalysen' });
  }
}
