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
    return res.status(200).json({ scope: kommune ? (scope[0]?.kommune_navn || kommune) : 'Hele landet', analysis: gisAnalysis(scope), kommuner, kommune: kommune || null });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lage kartanalysen' });
  }
}
