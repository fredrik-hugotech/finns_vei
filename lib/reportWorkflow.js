import { enrichPoint } from './nvdb';
import { updateReport } from './supabaseRest';
import { updateTrelloCardDescription } from './trello';

export function vegdataLines(data = {}) {
  return [
    'Vegdata (NVDB)',
    `Vegforvalter/eier: ${data.road_owner || 'Ikke funnet'}`,
    `Vegmyndighet: ${data.road_authority || 'Ikke funnet'}`,
    `Vegkategori/nummer: ${[data.road_category, data.road_number].filter(Boolean).join(' ') || 'Ikke funnet'}`,
    `Vegreferanse: ${data.road_reference || 'Ikke funnet'}`,
    `Fartsgrense: ${data.speed_limit || 'Ikke funnet'}`,
    `ÅDT: ${data.aadt || 'Ikke funnet'}`,
    `Avstand til nærmeste gangfelt: ${data.nearest_crossing_distance_m ? `${data.nearest_crossing_distance_m} m` : 'Ikke funnet'}`,
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
    `Status: ${report.status}`,
    `Meldt som: ${report.reporter_type}`,
    `Kategori: ${report.category}`,
    `Koordinater: ${report.lat}, ${report.lng}`,
    ...contactLines,
    '',
    report.description,
    '',
    `Kart: https://www.google.com/maps?q=${report.lat},${report.lng}`,
    '',
    'Bilde: kommer senere',
  ].join('\n');
}

export function buildEnrichedTrelloDescription(report, vegdata) {
  return [buildBaseTrelloDescription(report), '', ...vegdataLines(vegdata)].join('\n');
}

export async function enrichReportBestEffort(report) {
  if (!report?.id) return;

  try {
    const vegdata = await enrichPoint({ lat: Number(report.lat), lng: Number(report.lng) });
    const patch = vegdata
      ? { ...vegdata, nvdb_status: 'enriched', nvdb_enriched_at: new Date().toISOString() }
      : { nvdb_status: 'not_found', nvdb_enriched_at: new Date().toISOString() };

    await updateReport(report.id, patch);

    if (report.trello_card_id) {
      await updateTrelloCardDescription(report.trello_card_id, buildEnrichedTrelloDescription(report, patch));
    }
  } catch (error) {
    console.error(error);
    try {
      await updateReport(report.id, { nvdb_status: 'failed', nvdb_enriched_at: new Date().toISOString() });
    } catch (updateError) {
      console.error(updateError);
    }
  }
}
