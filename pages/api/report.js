import { REPORT_CATEGORIES, REPORT_STATUS, REPORTER_TYPES } from '../../lib/config';
import { runReportWorkflowBestEffort } from '../../lib/reportWorkflow';
import { createReport, hasSupabaseConfig } from '../../lib/supabaseRest';

function logApi(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/report', event, ...details }));
}

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
    nvdb_status: 'pending',
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
    const insertedReport = await createReport(reportInput);

    if (!insertedReport?.id) {
      logApi('insert_missing_id', { category: reportInput.category, lat: reportInput.lat, lng: reportInput.lng });
      throw new Error('Rapporten ble lagret uten ID');
    }

    logApi('report_inserted', {
      reportId: insertedReport.id,
      category: insertedReport.category || reportInput.category,
      lat: insertedReport.lat || reportInput.lat,
      lng: insertedReport.lng || reportInput.lng,
    });

    // Vercel serverless functions can stop after the response is returned, so the
    // Trello + NVDB workflow is awaited best-effort instead of fire-and-forget.
    const workflow = await runReportWorkflowBestEffort({ ...reportInput, ...insertedReport });
    const report = workflow.report || insertedReport;

    return res.status(201).json({
      id: report.id,
      status: report.status || REPORT_STATUS.NEW,
      nvdb_status: workflow.nvdbStatus || report.nvdb_status || 'failed',
      warning: workflow.trelloWarning,
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/report', event: 'request_failed', error: error?.message }));
    return res.status(400).json({ error: error.message || 'Kunne ikke lagre meldingen' });
  }
}
