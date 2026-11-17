import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { countRows, hasSupabaseConfig, listReportSources } from '../../../lib/supabaseRest';
import { sourceChannel } from '../../../lib/visitSource';

// Where reports come from: channel (Facebook, Instagram, a newspaper …) and
// campaign tags from shared links. Only reports sent after measuring started
// have a source.
export default async function handler(req, res) {
  const rl = checkRequestRateLimit(req, 'backoffice-kilder', 60, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forsøk.' });
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  try {
    const list = await listReportSources();
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const group = (items, f) => {
      const m = new Map();
      for (const r of items) { const k = f(r); if (k) m.set(k, (m.get(k) || 0) + 1); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([navn, antall]) => ({ navn, antall }));
    };
    const total = await countRows('reports', '?select=id').catch(() => null);
    return res.status(200).json({
      measuredSince: list[0]?.created_at || null,
      measured: list.length,
      totalReports: total,
      channels: group(list, sourceChannel),
      channels30: group(list.filter((r) => String(r.created_at) >= since30), sourceChannel),
      campaigns: group(list.filter((r) => r.source_utm_campaign), (r) => `${r.source_utm_campaign}${r.source_utm_source ? ` (${r.source_utm_source})` : ''}`).slice(0, 15),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente kilder' });
  }
}
