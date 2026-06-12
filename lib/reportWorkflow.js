import { enrichPoint, roadCategoryLabel } from './nvdb';
import { normalizeImageEntries } from './reportImages';
import { findNearbyOpenCases, setReportCaseId, updateReport } from './supabaseRest';
import { addTrelloCardAttachment, addTrelloCardComment, createTrelloCard, getNewReportListId, hasTrelloConfig, updateTrelloCardDescription } from './trello';

const CASE_GROUP_RADIUS_M = Number(process.env.CASE_GROUP_RADIUS_M || 35);

function logWorkflow(event, details = {}) {
  console.log(JSON.stringify({ scope: 'report-workflow', event, ...details }));
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

function formatDistance(value, maxMeters = 1000) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= maxMeters ? `${Math.round(number)} m` : 'Ikke funnet';
}

function formatMaybe(value, suffix = '') {
  return value !== null && value !== undefined && value !== '' ? `${value}${suffix}` : 'Ikke funnet';
}

function imageLines(report = {}) {
  const images = normalizeImageEntries(report.image_urls);
  return [
    '## Bilder',
    ...(images.length ? images.map((image, index) => `* [Bilde ${index + 1}](${image.url})`) : ['Ingen bilder']),
  ];
}

async function attachImagesToTrelloBestEffort(cardId, report) {
  const images = normalizeImageEntries(report?.image_urls);
  if (!cardId || images.length === 0) return;
  await Promise.allSettled(images.map(async (image, index) => {
    try {
      await addTrelloCardAttachment(cardId, { url: image.url, name: `Bilde ${index + 1}` });
    } catch (error) {
      logWorkflow('trello_image_attachment_failed', { reportId: report.id, cardId, imageIndex: index, error: errorSummary(error) });
    }
  }));
}

export function accidentLines(data = {}) {
  const summary = data.accident_summary || {};
  const count = data.accident_count ?? summary.count;
  return [
    '## Ulykker på/nært punktet',
    `**Ulykker på/nært punktet:** ${Number(count) > 0 ? count : 'Ikke funnet'}`,
    `**Søkeradius:** ${formatMaybe(data.accident_search_radius_m ?? summary.radius_m, ' m')}`,
    `**Nærmeste ulykke:** ${formatDistance(data.nearest_accident_distance_m, Number(data.accident_search_radius_m || summary.radius_m || 20) * 2)}`,
    `**Alvorlighet:** ${formatSummaryCounts(summary.severity_counts)}`,
    `**År:** ${formatSummaryCounts(summary.year_counts)}`,
  ];
}

export function vegdataLines(data = {}) {
  return [
    '## Vegdata',
    `**Veieier:** ${formatMaybe(data.road_owner)}`,
    `**Vegmyndighet:** ${formatMaybe(data.road_authority)}`,
    `**Vegkategori:** ${formatMaybe(roadCategoryLabel(data.road_category))}`,
    `**Vegnummer:** ${formatMaybe(data.road_number)}`,
    `**Vegreferanse:** ${formatMaybe(data.road_reference)}`,
    `**Fartsgrense:** ${formatMaybe(data.speed_limit, ' km/t')}`,
    `**ÅDT:** ${formatMaybe(data.aadt)}`,
    `**Nærmeste gangfelt:** ${formatDistance(data.nearest_crossing_distance_m, 1000)}`,
  ];
}

export function buildBaseTrelloDescription(report, { includeImages = true } = {}) {
  const contactLines = report.reporter_type === 'voksen'
    ? [
        report.contact_name ? `**Navn:** ${report.contact_name}` : null,
        report.contact_email ? `**E-post:** ${report.contact_email}` : null,
        report.contact_phone ? `**Telefon:** ${report.contact_phone}` : null,
      ].filter(Boolean)
    : [];

  return [
    '## Innmelding',
    `**Kategori:** ${report.category}`,
    `**Beskrivelse:** ${report.description}`,
    `**Meldertype:** ${report.reporter_type}`,
    `**Status:** ${report.status}`,
    '',
    `**Kartlenke:** [Åpne i Google Maps](https://www.google.com/maps?q=${report.lat},${report.lng})`,
    `**Koordinater:** ${report.lat}, ${report.lng}`,
    `**Report ID:** ${report.id || 'Ikke lagret ennå'}`,
    ...(contactLines.length ? ['', '## Kontaktinfo', ...contactLines] : []),
    ...(includeImages ? ['', ...imageLines(report)] : []),
  ].join('\n');
}

export function buildEnrichedTrelloDescription(report, vegdata) {
  return [
    buildBaseTrelloDescription(report, { includeImages: false }),
    '',
    ...vegdataLines(vegdata),
    '',
    ...accidentLines(vegdata),
    '',
    ...imageLines(report),
  ].join('\n');
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

    await attachImagesToTrelloBestEffort(trelloCard.id, report);

    const listId = trelloCard.idList || getNewReportListId();
    const updatedReport = await updateReport(report.id, {
      trello_card_id: trelloCard.id,
      trello_list_id: listId,
    });
    // This report anchors its own case.
    await setReportCaseId(report.id, report.id);
    logWorkflow('trello_supabase_update_completed', {
      reportId: report.id,
      trelloCardId: trelloCard.id,
      trelloListIdPresent: Boolean(listId),
    });
    return { report: { ...report, ...updatedReport, trello_card_id: trelloCard.id, trello_list_id: listId, case_id: report.id }, warning: null };
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

export async function enrichReportBestEffort(report, { updateTrelloCard = true } = {}) {
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
    if (updateTrelloCard && trelloCardId) {
      try {
        await updateTrelloCardDescription(trelloCardId, buildEnrichedTrelloDescription({ ...report, ...updatedReport }, patch));
        await attachImagesToTrelloBestEffort(trelloCardId, { ...report, ...updatedReport });
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

// Group a new report onto the nearest open case's Trello card (one card per place).
// Returns the linked report when grouped, or null to let the normal flow create a card.
async function tryGroupIntoExistingCase(report) {
  if (!hasTrelloConfig()) return null;
  const lat = Number(report.lat);
  const lng = Number(report.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const candidates = await findNearbyOpenCases({ lat, lng, radiusM: CASE_GROUP_RADIUS_M });
  const anchor = candidates
    .filter((row) => row.id !== report.id && row.trello_card_id && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
    .map((row) => ({ ...row, dist: distanceMeters(lat, lng, Number(row.lat), Number(row.lng)) }))
    .filter((row) => row.dist <= CASE_GROUP_RADIUS_M)
    .sort((a, b) => a.dist - b.dist)[0];

  if (!anchor) return null;

  const caseId = anchor.case_id || anchor.id;
  const updated = await updateReport(report.id, {
    trello_card_id: anchor.trello_card_id,
    trello_list_id: anchor.trello_list_id,
  });
  await setReportCaseId(report.id, caseId);

  try {
    const images = normalizeImageEntries(report.image_urls);
    const lines = [
      '➕ Ny melding på samme sted',
      `**Kategori:** ${report.category}`,
      `**Beskrivelse:** ${report.description}`,
      `**Meldertype:** ${report.reporter_type}`,
      `**Avstand fra forrige melding:** ${Math.round(anchor.dist)} m`,
      `**Report ID:** ${report.id}`,
    ];
    if (images.length) {
      lines.push('', '**Bilder:**', ...images.map((image, index) => `* [Bilde ${index + 1}](${image.url})`));
    }
    await addTrelloCardComment(anchor.trello_card_id, lines.join('\n'));
    await attachImagesToTrelloBestEffort(anchor.trello_card_id, report);
  } catch (error) {
    logWorkflow('case_comment_failed', { reportId: report.id, cardId: anchor.trello_card_id, error: errorSummary(error) });
  }

  logWorkflow('case_grouped', { reportId: report.id, anchorId: anchor.id, cardId: anchor.trello_card_id, distance: Math.round(anchor.dist) });
  return {
    ...report,
    ...updated,
    trello_card_id: anchor.trello_card_id,
    trello_list_id: anchor.trello_list_id,
    case_id: caseId,
  };
}

export async function runReportWorkflowBestEffort(report, { createMissingTrello = true } = {}) {
  if (!report?.id) return { report, trelloWarning: null, nvdbStatus: report?.nvdb_status || null };

  logWorkflow('workflow_started', { reportId: report.id });
  let currentReport = report;
  let trelloWarning = null;
  let grouped = false;

  if (createMissingTrello && !currentReport.trello_card_id) {
    try {
      const groupedReport = await tryGroupIntoExistingCase(currentReport);
      if (groupedReport) {
        currentReport = groupedReport;
        grouped = true;
      }
    } catch (error) {
      logWorkflow('case_grouping_failed', { reportId: currentReport.id, error: errorSummary(error) });
    }

    if (!grouped) {
      const trelloResult = await createMissingTrelloCardBestEffort(currentReport);
      currentReport = trelloResult.report || currentReport;
      trelloWarning = trelloResult.warning;
    }
  }

  // Grouped reports keep enrichment in Supabase but must not overwrite the shared card.
  const enrichmentResult = await enrichReportBestEffort(currentReport, { updateTrelloCard: !grouped });
  currentReport = enrichmentResult.report || currentReport;
  logWorkflow('workflow_finished', { reportId: report.id, grouped, nvdb_status: enrichmentResult.status || currentReport?.nvdb_status });

  return {
    report: currentReport,
    trelloWarning,
    nvdbStatus: enrichmentResult.status || currentReport?.nvdb_status,
  };
}
