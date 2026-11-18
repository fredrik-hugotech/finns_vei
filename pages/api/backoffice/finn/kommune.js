import { aiConfigured, draftLetter, writeMunicipalityReport } from '../../../../lib/aiAssist';
import { engagementTop, kommuneList, kommuneStats } from '../../../../lib/aiStats';
import { finnGuard, loadRows, notConfigured } from '../../../../lib/finnJobs';
import { REPORT_STATUS } from '../../../../lib/config';
import { getKommuneBarn, getLatestAiDocument, getReportsByIds, saveAiDocument } from '../../../../lib/supabaseRest';

// Per municipality: numbers, Finn's report (for the municipality or local
// press) and Finn's letter draft to a road owner about selected cases.
export const config = { maxDuration: 180 };

const slim = (c) => ({
  id: c.id, created_at: c.created_at, category: c.category, status: c.status, summary: c.summary, measure: c.measure,
  effort: c.effort, urgency: c.urgency, responsible: c.responsible, support_count: c.support_count,
  linked_count: c.linked_count, kommune_navn: c.kommune_navn, score: c.score,
  acc_10y: c.acc_10y, acc_vulnerable_10y: c.acc_vulnerable_10y, aadt: c.aadt, barn_6_15_1km: c.barn_6_15_1km,
});

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'kommune', limit: req.method === 'POST' ? 20 : 120 });
  if (!who) return undefined;
  try {
    const [rows, barn] = await Promise.all([loadRows(), getKommuneBarn().catch(() => new Map())]);
    const kode = String((req.method === 'GET' ? req.query.kommune : req.body?.kommune) || '');
    if (req.method === 'GET') {
      if (!kode) {
        const kommuner = kommuneList(rows).map((k) => {
          const b = barn.get(k.kode);
          return { ...k, barn_6_15: b?.barn_6_15 || null, per1000: b?.barn_6_15 ? Number(((k.antall / b.barn_6_15) * 1000).toFixed(1)) : null };
        });
        return res.status(200).json({ configured: aiConfigured(), kommuner });
      }
      const mine = rows.filter((r) => r.kommune === kode);
      if (!mine.length) return res.status(404).json({ error: 'Ingen saker i kommunen' });
      const [report, letters] = await Promise.all([
        getLatestAiDocument('kommunerapport', kode),
        Promise.all(['Kommunen', 'Fylkeskommunen', 'Statens vegvesen'].map((o) => getLatestAiDocument('brev', `${kode}|${o}`))),
      ]);
      return res.status(200).json({
        configured: aiConfigured(),
        navn: mine[0].kommune_navn,
        stats: kommuneStats(mine, barn.get(kode) || null),
        cases: mine.filter((r) => r.status !== REPORT_STATUS.DONE).sort((a, b) => b.score - a.score).map(slim),
        report,
        letters: letters.filter(Boolean),
      });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
    if (!aiConfigured()) return notConfigured(res);
    const mine = rows.filter((r) => r.kommune === kode);
    if (!mine.length) return res.status(404).json({ error: 'Ingen saker i kommunen' });
    const navn = mine[0].kommune_navn;

    if (req.body?.type === 'rapport') {
      const stats = kommuneStats(mine, barn.get(kode) || null);
      const out = await writeMunicipalityReport({ kommune: navn, stats, cases: engagementTop(mine, 12) });
      const doc = await saveAiDocument({ kind: 'kommunerapport', scope: kode, content: { ...out, stats, kommune: navn }, model: out.model, createdBy: who.by });
      return res.status(200).json({ ok: true, report: doc });
    }
    if (req.body?.type === 'brev') {
      const owner = String(req.body.responsible || 'Kommunen');
      const wanted = new Set(Array.isArray(req.body.caseIds) ? req.body.caseIds.map(String) : []);
      const picked = mine.filter((r) => wanted.has(r.id)).sort((a, b) => b.score - a.score).slice(0, 25);
      if (!picked.length) return res.status(400).json({ error: 'Velg minst én sak' });
      const extra = await getReportsByIds(picked.map((c) => c.id), 'id,road_reference');
      const ref = new Map(extra.map((e) => [e.id, e.road_reference]));
      const cases = picked.map((c) => ({ ...c, road_reference: ref.get(c.id) || null }));
      const out = await draftLetter({ kommune: navn, responsible: owner, cases, sender: req.body.sender || who.name || '' });
      const doc = await saveAiDocument({ kind: 'brev', scope: `${kode}|${owner}`, content: { ...out, kommune: navn, responsible: owner, cases: cases.map(slim) }, model: out.model, createdBy: who.by });
      return res.status(200).json({ ok: true, letter: doc });
    }
    return res.status(400).json({ error: 'Ukjent type' });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/kommune', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Finn klarte ikke dette nå.' });
  }
}
