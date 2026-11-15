import { aiConfigured, suggestProgress } from '../../../../lib/aiAssist';
import { finnGuard, loadRows, notConfigured } from '../../../../lib/finnJobs';
import { REPORT_STATUS } from '../../../../lib/config';
import {
  getCaseTimeline, getLatestAiDocument, getReportById, getReportTriage, getReportsByIds,
  getStatusUpdatesForCards, listLinkedReports, saveAiDocument,
} from '../../../../lib/supabaseRest';

// «Finn foreslår framdrift» for one case. Finn reads the case, what has
// happened in it, and earlier cases nearby or with the same road owner —
// especially ones that moved forward — and suggests how to get it further.
export const config = { maxDuration: 180 };

function meters(a, b) {
  const R = 6371000; const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

async function relatedCases(report, triage) {
  const rows = await loadRows();
  const self = rows.find((r) => r.id === report.id);
  const here = { lat: Number(report.lat), lng: Number(report.lng) };
  const others = rows.filter((r) => r.id !== report.id && Number.isFinite(Number(r.lat)));
  const near = others
    .map((r) => ({ ...r, distance_m: meters(here, { lat: Number(r.lat), lng: Number(r.lng) }) }))
    .filter((r) => r.distance_m <= 400)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 8);
  const owner = triage?.responsible;
  const kommune = self?.kommune;
  const moved = others
    .filter((r) => !near.some((n) => n.id === r.id) && kommune && r.kommune === kommune && (!owner || r.responsible === owner)
      && (r.status === REPORT_STATUS.STARTED || r.status === REPORT_STATUS.DONE))
    .slice(0, 8)
    .map((r) => ({ ...r, distance_m: null }));
  const list = [...near, ...moved];
  const details = await getReportsByIds(list.map((r) => r.id), 'id,trello_card_id');
  const cardById = new Map(details.map((d) => [d.id, d.trello_card_id]));
  const notes = await getStatusUpdatesForCards(details.map((d) => d.trello_card_id));
  return list.map((r) => ({
    id: r.id, distance_m: r.distance_m, kommune_navn: r.kommune_navn, category: r.category, status: r.status, summary: r.summary,
    notes: (notes.get(cardById.get(r.id)) || []).slice(-4),
  }));
}

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'framdrift', limit: req.method === 'POST' ? 20 : 120 });
  if (!who) return undefined;
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return res.status(400).json({ error: 'Mangler sak' });
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ configured: aiConfigured(), plan: await getLatestAiDocument('progress', id) });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
    if (!aiConfigured()) return notConfigured(res);
    const report = await getReportById(id, { select: 'id,status,category,description,created_at,reporter_type,support_count,lat,lng,road_owner,road_category,road_reference,speed_limit,trello_card_id' });
    if (!report) return res.status(404).json({ error: 'Fant ikke saken' });
    const [triage, timeline, linked] = await Promise.all([
      getReportTriage(id).catch(() => null),
      report.trello_card_id ? getCaseTimeline(report.trello_card_id) : [],
      listLinkedReports(id).catch(() => []),
    ]);
    const related = await relatedCases(report, triage).catch(() => []);
    const plan = await suggestProgress({ report, triage, timeline: timeline.slice(-12), linkedCount: linked.length, related });
    const doc = await saveAiDocument({ kind: 'progress', scope: id, content: { ...plan, related_count: related.length }, model: plan.model, createdBy: who.by });
    return res.status(200).json({ ok: true, plan: doc });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/framdrift', id, message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Finn klarte ikke å lage et forslag nå.' });
  }
}
