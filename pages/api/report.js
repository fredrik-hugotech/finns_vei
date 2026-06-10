import { REPORT_CATEGORIES, REPORT_STATUS, REPORTER_TYPES } from '../../lib/config';
import { createReport, hasSupabaseConfig, updateReport } from '../../lib/supabaseRest';
import { createTrelloCard, getNewReportListId, hasTrelloConfig } from '../../lib/trello';

function cleanString(value, maxLength = 1000) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function parseCoordinate(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} mangler`);
  return number;
}

function validatePayload(body = {}) {
  const reporterType = body.reporter_type === REPORTER_TYPES.ADULT ? REPORTER_TYPES.ADULT : REPORTER_TYPES.CHILD;
  const lat = parseCoordinate(body.lat, 'Posisjon');
  const lng = parseCoordinate(body.lng, 'Posisjon');

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Posisjonen ser ikke riktig ut');
  }

  const category = REPORT_CATEGORIES.includes(body.category) ? body.category : null;
  if (!category) throw new Error('Velg en kategori');

  const description = cleanString(body.description, 1200);
  if (!description || description.length < 3) {
    throw new Error('Skriv en kort beskrivelse');
  }

  return {
    status: REPORT_STATUS.NEW,
    reporter_type: reporterType,
    category,
    description,
    lat,
    lng,
    contact_name: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_name, 160) : null,
    contact_email: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_email, 220) : null,
    contact_phone: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_phone, 80) : null,
  };
}

function buildTrelloDescription(report) {
  const contactLines = report.reporter_type === REPORTER_TYPES.ADULT
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
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase er ikke konfigurert' });
  }

  try {
    const reportInput = validatePayload(req.body);
    let report = await createReport(reportInput);
    let trelloWarning = null;

    if (hasTrelloConfig()) {
      try {
        const trelloCard = await createTrelloCard({
          name: `Ny melding: ${reportInput.category}`,
          desc: buildTrelloDescription(reportInput),
        });

        if (trelloCard?.id) {
          report = await updateReport(report.id, {
            trello_card_id: trelloCard.id,
            trello_list_id: trelloCard.idList || getNewReportListId(),
          });
        }
      } catch (error) {
        console.error(error);
        trelloWarning = 'Meldingen er lagret, men Trello-kort ble ikke laget.';
      }
    }

    return res.status(201).json({ id: report?.id, status: report?.status || REPORT_STATUS.NEW, warning: trelloWarning });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message || 'Kunne ikke lagre meldingen' });
  }
}
