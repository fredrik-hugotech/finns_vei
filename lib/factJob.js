import { writeFactMessage } from './factMessage';
import { ensureReportContext } from './reportContext';
import { getFactMessage, getInsightSetting, getReportById, listLinkedReports, listReportsDueFactMessage, saveFactMessage } from './supabaseRest';

const SELECT = 'id,lat,lng,status,category,main_category,reporter_type,support_count,aadt,speed_limit,place_road,place_kommune,trello_card_id,parent_report_id';

// Writes Finn's fact message for one case (not stored).
export async function composeFactMessage(reportId) {
  const report = await getReportById(reportId, { select: SELECT });
  if (!report) throw new Error('Fant ikke saken');
  const [ctx, linked] = await Promise.all([
    ensureReportContext(report).catch(() => null),
    listLinkedReports(report.id).catch(() => []),
  ]);
  return { report, ...(await writeFactMessage({ report, ctx, linkedCount: linked.length })) };
}

// Writes it and stores it as a draft. Nothing is published here: staff
// publish it from the case page.
export async function draftFactMessage(reportId) {
  const out = await composeFactMessage(reportId);
  const report = out.report;
  const row = { report_id: report.id, message: out.message, facts: out.facts, status: 'utkast', model: out.model, created_at: new Date().toISOString(), decided_by: null, decided_at: null };
  await saveFactMessage(row);
  return row;
}

// Daily: drafts for reports that are a day old (only those sent after the
// start date, so old cases aren't swept in).
export async function draftDueFactMessages(limit = 40) {
  const from = await getInsightSetting('faktamelding_fra').catch(() => null);
  if (!from) return { drafted: 0 };
  const ids = await listReportsDueFactMessage(from, limit);
  let drafted = 0;
  for (const id of ids) {
    if (await getFactMessage(id).catch(() => null)) continue;
    try { await draftFactMessage(id); drafted += 1; } catch (e) { console.error(JSON.stringify({ scope: 'faktamelding', id, error: String(e?.message || e).slice(0, 200) })); }
  }
  return { drafted };
}
