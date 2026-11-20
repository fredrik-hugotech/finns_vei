import { waitUntil } from '@vercel/functions';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { getReportById, getTriageOverviewRows, hasSupabaseConfig, listTrafficIncidents, listTrafficIncidentsNear } from '../../../lib/supabaseRest';
import { MATCH_RADIUS, casesNear, datexConfigured, meters } from '../../../lib/trafficIncidents';
import { readIncidentStatus, refreshIncidents } from '../../../lib/trafficIncidentStore';

// Recent traffic accidents (DATEX + Politiloggen) and the reported places
// they are near. Backoffice only. Fetches new incidents in the background
// when the last fetch is more than 15 minutes old.
export const config = { maxDuration: 120 };
const STALE_MS = 15 * 60 * 1000;

const short = (i) => ({
  id: i.id, source: i.source, title: i.title, text: String(i.text || '').slice(0, 600), severity: i.severity,
  lat: i.lat, lng: i.lng, precision: i.precision, place_text: i.place_text, occurred_at: i.occurred_at, district: i.district || null,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', ['GET']); return res.status(405).end(); }
  const rl = checkRequestRateLimit(req, 'backoffice-trafikkhendelser', 120, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  try {
    let status = await readIncidentStatus();
    const stale = !status?.at || Date.now() - new Date(status.at).getTime() > STALE_MS;
    if (req.query.oppdater === '1') status = await refreshIncidents();
    else if (stale) waitUntil(refreshIncidents().catch(() => {}));
    const sources = { datex: datexConfigured() ? (status?.datex || 'venter') : 'ikke konfigurert', politiloggen: status?.politiloggen || 'venter', at: status?.at || null };

    // One case: accidents near it, and whether they came after it was reported.
    if (typeof req.query.sak === 'string' && req.query.sak) {
      const report = await getReportById(req.query.sak, { select: 'id,lat,lng,created_at' });
      if (!report || report.lat == null) return res.status(200).json({ incidents: [], sources });
      const here = { lat: Number(report.lat), lng: Number(report.lng) };
      const incidents = (await listTrafficIncidentsNear(here.lat, here.lng, 600))
        .map((i) => ({ ...short(i), m: i.lat != null ? Math.round(meters(here, { lat: Number(i.lat), lng: Number(i.lng) })) : null }))
        .filter((i) => i.m != null && i.m <= (MATCH_RADIUS[i.precision] || 0))
        .map((i) => ({ ...i, after_report: Boolean(i.occurred_at && report.created_at && i.occurred_at > report.created_at) }));
      return res.status(200).json({ incidents, sources });
    }

    // Dashboard: accidents in the period, each with the reported places near it.
    const days = Math.min(365, Math.max(1, Number(req.query.dager) || 30));
    const [incidents, rows] = await Promise.all([listTrafficIncidents({ days }), getTriageOverviewRows()]);
    const cases = (rows || []).filter((r) => !r.parent_report_id);
    const out = incidents.map((i) => ({
      ...short(i),
      cases: casesNear(i, cases).map(({ c, m }) => ({ id: c.id, m, category: c.main_category || c.category, kommune: c.kommune_navn || null, created_at: c.created_at })),
    }));
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    return res.status(200).json({
      days,
      sources,
      total: out.length,
      placed: out.filter((i) => i.lat != null).length,
      near_cases: out.filter((i) => i.cases.length).length,
      near_cases_7d: out.filter((i) => i.cases.length && i.occurred_at >= weekAgo).length,
      incidents: out,
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/trafikkhendelser', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Kunne ikke hente trafikkhendelser' });
  }
}
