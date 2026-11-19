import { writeFactMessage } from './factMessage';
import { ensureReportContext, refreshSiteRoad } from './reportContext';
import { SITE_VERSION } from './nvdbSite';
import { getFactMessage, getInsightSetting, getReportById, listCasesWithoutFactMessage, listLinkedReports, listReportsDueFactMessage, saveFactMessage } from './supabaseRest';

const SELECT = 'id,lat,lng,status,category,main_category,reporter_type,support_count,aadt,speed_limit,road_reference,place_road,place_kommune,trello_card_id,parent_report_id';

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
export async function draftFactMessage(reportId, { batch = null } = {}) {
  const out = await composeFactMessage(reportId);
  const report = out.report;
  const row = { report_id: report.id, message: out.message, facts: out.facts, status: 'utkast', model: out.model, created_at: new Date().toISOString(), decided_by: null, decided_at: null, batch };
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

// Bulk run for existing cases: a proposal per case, saved as a draft marked
// with the batch name. Only runs after staff have confirmed the cost (the
// confirmation is stored in the setting «faktaforslag_bekreftet»).
export const PROPOSAL_SETTING = 'faktaforslag_bekreftet';
// Measured per message on Opus 5.5 at low effort (USD): input ~1 000 tokens,
// output ~450–1 050 incl. thinking. Shown to staff before they confirm.
export const COST_PER_MESSAGE_USD = { low: 0.013, high: 0.025 };

export async function proposalStatus() {
  const [ready, all, confirmed] = await Promise.all([
    listCasesWithoutFactMessage({ siteVersion: SITE_VERSION, readyOnly: true }),
    listCasesWithoutFactMessage({ siteVersion: SITE_VERSION, readyOnly: false }),
    getInsightSetting(PROPOSAL_SETTING).catch(() => null),
  ]);
  return {
    remaining: all.length,
    ready: ready.length,
    waiting_for_road_data: all.length - ready.length,
    cost_usd: { low: Math.round(all.length * COST_PER_MESSAGE_USD.low), high: Math.round(all.length * COST_PER_MESSAGE_USD.high) },
    confirmed: confirmed || null,
  };
}

export async function draftProposals({ batch, deadline, concurrency = 6 }) {
  // Cases still on old road data get it fetched first, so no proposal is
  // written from the old sidewalk and traffic numbers.
  const [ids, ready] = await Promise.all([
    listCasesWithoutFactMessage({ siteVersion: SITE_VERSION, readyOnly: false }),
    listCasesWithoutFactMessage({ siteVersion: SITE_VERSION, readyOnly: true }),
  ]);
  const readySet = new Set(ready);
  let drafted = 0; let failed = 0;
  const queue = [...ids];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length && Date.now() < deadline) {
      const id = queue.shift();
      try {
        if (!readySet.has(id)) {
          const r = await getReportById(id, { select: 'id,lat,lng' });
          if (r) await refreshSiteRoad(r);
        }
        await draftFactMessage(id, { batch }); drafted += 1;
      } catch (e) {
        failed += 1;
        console.error(JSON.stringify({ scope: 'faktaforslag', id, error: String(e?.message || e).slice(0, 200) }));
      }
    }
  }));
  return { drafted, failed, left: queue.length };
}
