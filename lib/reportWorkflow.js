import { enrichPoint, roadCategoryLabel } from './nvdb';
import { updateReport } from './supabaseRest';
import { createTrelloCard, getNewReportListId, hasTrelloConfig, updateTrelloCardDescription } from './trello';

function logWorkflow(event, details = {}) {
  console.log(JSON.stringify({ scope: 'report-workflow', event, ...details }));
}

function errorSummary(error) {
  const code = error?.cause?.code || error?.code;
  return [error?.name, code, error?.message].filter(Boolean).join(': ').slice(0, 500);
}

function hasUsefulVegdata(vegdata = {}) {
  return Boolean(
    vegdata.road_owner
    || vegdata.road_authority
    || vegdata.road_category
    || vegdata.road_number
    || vegdata.road_reference
    || (vegdata.speed_limit !== null && vegdata.speed_limit !== undefined)
    || (vegdata.aadt !== null && vegdata.aadt !== undefined)
    || (vegdata.nearest_crossing_distance_m !== null && vegdata.nearest_crossing_distance_m !== undefined),
  );
}

function formatSummaryCounts(counts = {}) {
  return Object.entries(counts)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ') || 'Ikke funnet';
}

export function accidentLines(data = {}) {
  const summary = data.accident_summary || {};
  return [
    'Ulykker i nærheten',
    `Søkeradius: ${data.accident_search_radius_m ?? summary.radius_m ?? 'Ikke funnet'} m`,
    `Antall registrerte ulykker: ${data.accident_count ?? summary.count ?? 'Ikke funnet'}`,
    `Nærmeste ulykke: ${data.nearest_accident_distance_m !== null && data.nearest_accident_distance_m !== undefined ? `${data.nearest_accident_distance_m} m` : 'Ikke funnet'}`,
    `Alvorlighet: ${formatSummaryCounts(summary.severity_counts)}`,
    `År: ${formatSummaryCounts(summary.year_counts)}`,
  ];
}

export function vegdataLines(data = {}) {
  return [
    'Vegdata',
    `Veieier: ${data.road_owner || 'Ikke funnet'}`,
    `Vegmyndighet: ${data.road_authority || 'Ikke funnet'}`,
    `Vegkategori: ${roadCategoryLabel(data.road_category) || 'Ikke funnet'}`,
    `Vegnummer: ${data.road_number || 'Ikke funnet'}`,
    `Vegreferanse: ${data.road_reference || 'Ikke funnet'}`,
    `Fartsgrense: ${data.speed_limit || 'Ikke funnet'}`,
    `ÅDT: ${data.aadt || 'Ikke funnet'}`,
    `Nærmeste gangfelt: ${data.nearest_crossing_distance_m ? `${data.nearest_crossing_distance_m} m` : 'Ikke funnet'}`,
  ];
}

export function buildBaseTrelloDescription(report) {
  const contactLines = report.reporter_type === 'voksen'
    ? [
        report.contact_name ? `Navn: ${report.contact_name}` : null,
        report.contact_email ? `E-post: ${report.contact_email}` : null,
        report.contact_phone ? `Telefon: ${report.contact_phone}` : null,
      ].filter(Boolean)
    : ['Meldt anonymt som barn'];

  return [
    'Innmelding',
    `Kategori: ${report.category}`,
    `Beskrivelse: ${report.description}`,
    `Meldertype: ${report.reporter_type}`,
    `Status: ${report.status}`,
    `Kartlenke: https://www.google.com/maps?q=${report.lat},${report.lng}`,
    `Koordinater: ${report.lat}, ${report.lng}`,
    `Report ID: ${report.id || 'Ikke lagret ennå'}`,
    ...contactLines,
    '',
    'Bilde: kommer senere',
  ].join('\n');
}

export function buildEnrichedTrelloDescription(report, vegdata) {
  return [buildBaseTrelloDescription(report), '', ...vegdataLines(vegdata), '', ...accidentLines(vegdata)].join('\n');
}

export async function createMissingTrelloCardBestEffort(report) {
  if (!report?.id) return { report, warning: null };

  if (report.trello_card_id && report.trello_list_id) {
    return { report, warning: null };
  }

  if (!hasTrelloConfig()) {
    logWorkflow('trello_create_skipped_missing_env', { reportId: report.id });
    return { report, warning: 'Trello er ikke konfigurert.' };
  }

  try {
    logWorkflow('trello_create_started', { reportId: report.id, category: report.category });
    const trelloCard = await createTrelloCard({
      name: `Ny melding: ${report.category}`,
      desc: buildBaseTrelloDescription(report),
    });

    if (!trelloCard?.id) {
      logWorkflow('trello_create_no_card_returned', { reportId: report.id });
      return { report, warning: 'Trello-kort ble ikke laget.' };
    }

    const listId = trelloCard.idList || getNewReportListId();
    const updatedReport = await updateReport(report.id, {
      trello_card_id: trelloCard.id,
      trello_list_id: listId,
    });
    logWorkflow('trello_supabase_update_completed', {
      reportId: report.id,
      trelloCardId: trelloCard.id,
      trelloListIdPresent: Boolean(listId),
    });
    return { report: { ...report, ...updatedReport, trello_card_id: trelloCard.id, trello_list_id: listId }, warning: null };
  } catch (error) {
    logWorkflow('trello_create_failed', { reportId: report.id, error: errorSummary(error) });
    try {
      await updateReport(report.id, { nvdb_note: `Trello-feil: ${errorSummary(error)}` });
    } catch (updateError) {
      logWorkflow('trello_failure_note_update_failed', { reportId: report.id, error: errorSummary(updateError) });
    }
    return { report, warning: 'Meldingen er lagret, men Trello-kort ble ikke laget.' };
  }
}

export async function enrichReportBestEffort(report) {
  if (!report?.id) return { status: 'skipped', report: null };

  logWorkflow('enrichment_started', { reportId: report.id, lat: report.lat, lng: report.lng });
  const finishedAt = new Date().toISOString();

  try {
    const vegdata = await enrichPoint({ lat: Number(report.lat), lng: Number(report.lng), reportId: report.id });
    const { accident_lookup_note: accidentLookupNote, ...dbVegdata } = vegdata || {};
    const patch = vegdata && hasUsefulVegdata(vegdata)
      ? {
          ...dbVegdata,
          nvdb_status: 'enriched',
          nvdb_enriched_at: finishedAt,
          nvdb_note: [report.nvdb_note, vegdata.nvdb_note, accidentLookupNote].filter(Boolean).join(' | ') || null,
        }
      : {
          ...dbVegdata,
          nvdb_status: 'not_found',
          nvdb_enriched_at: finishedAt,
          nvdb_note: [
            report.nvdb_note,
            vegdata?.nvdb_note,
            accidentLookupNote,
            'Fant ingen relevant vegdata i NVDB innenfor maks avstand.',
          ].filter(Boolean).join(' | '),
        };

    logWorkflow('enrichment_patch_ready', {
      reportId: report.id,
      nvdb_status: patch.nvdb_status,
      fields: Object.keys(patch),
    });
    const updatedReport = await updateReport(report.id, patch);
    logWorkflow('enrichment_supabase_update_completed', { reportId: report.id, nvdb_status: updatedReport?.nvdb_status || patch.nvdb_status });

    const trelloCardId = updatedReport?.trello_card_id || report.trello_card_id;
    if (trelloCardId) {
      try {
        await updateTrelloCardDescription(trelloCardId, buildEnrichedTrelloDescription({ ...report, ...updatedReport }, patch));
      } catch (error) {
        logWorkflow('trello_enriched_update_failed', { reportId: report.id, error: errorSummary(error) });
      }
    }

    logWorkflow('enrichment_finished', { reportId: report.id, nvdb_status: patch.nvdb_status });
    return { status: patch.nvdb_status, report: { ...report, ...updatedReport, ...patch } };
  } catch (error) {
    const patch = {
      nvdb_status: 'failed',
      nvdb_enriched_at: new Date().toISOString(),
      nvdb_note: [report.nvdb_note, `NVDB-feil: ${errorSummary(error)}`].filter(Boolean).join(' | '),
    };

    logWorkflow('enrichment_failed', { reportId: report.id, error: errorSummary(error) });
    try {
      const updatedReport = await updateReport(report.id, patch);
      logWorkflow('enrichment_failure_supabase_update_completed', { reportId: report.id, nvdb_status: updatedReport?.nvdb_status || patch.nvdb_status });
      return { status: 'failed', report: { ...report, ...updatedReport, ...patch } };
    } catch (updateError) {
      logWorkflow('enrichment_failure_supabase_update_failed', { reportId: report.id, error: errorSummary(updateError) });
      return { status: 'failed', report: { ...report, ...patch } };
    }
  }
}

export async function runReportWorkflowBestEffort(report, { createMissingTrello = true } = {}) {
  if (!report?.id) return { report, trelloWarning: null, nvdbStatus: report?.nvdb_status || null };

  logWorkflow('workflow_started', { reportId: report.id });
  let currentReport = report;
  let trelloWarning = null;

  if (createMissingTrello) {
    const trelloResult = await createMissingTrelloCardBestEffort(currentReport);
    currentReport = trelloResult.report || currentReport;
    trelloWarning = trelloResult.warning;
  }

  const enrichmentResult = await enrichReportBestEffort(currentReport);
  currentReport = enrichmentResult.report || currentReport;
  logWorkflow('workflow_finished', { reportId: report.id, nvdb_status: enrichmentResult.status || currentReport?.nvdb_status });

  return {
    report: currentReport,
    trelloWarning,
    nvdbStatus: enrichmentResult.status || currentReport?.nvdb_status,
  };
}
