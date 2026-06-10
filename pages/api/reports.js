import { CATEGORY_LABELS, DEFAULT_CENTER, REPORT_STATUS, SEVERITY_LABELS } from '../../lib/config';
import { createReport, hasSupabaseConfig, listReports, updateReport } from '../../lib/supabaseRest';
import { createTrelloCard, hasTrelloConfig } from '../../lib/trello';

const DEMO_REPORTS = [
  {
    id: 'demo-1',
    lat: DEFAULT_CENTER[1],
    lng: DEFAULT_CENTER[0],
    category: 'crossing',
    severity: 'medium',
    status: REPORT_STATUS.NEW,
    description: 'Demo: uoversiktlig kryssing ved sentrum. Koble til Supabase for ekte innmeldinger.',
    created_at: new Date('2026-01-01T12:00:00Z').toISOString(),
  },
];

function cleanString(value, maxLength = 1000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function parseCoordinate(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} må være et gyldig tall`);
  }
  return number;
}

function validateReport(body = {}) {
  const lat = parseCoordinate(body.lat, 'lat');
  const lng = parseCoordinate(body.lng, 'lng');

  if (lat < -90 || lat > 90) throw new Error('lat må være mellom -90 og 90');
  if (lng < -180 || lng > 180) throw new Error('lng må være mellom -180 og 180');

  const description = cleanString(body.description, 1600);
  if (description.length < 5) {
    throw new Error('Beskrivelse må være minst 5 tegn');
  }

  const category = CATEGORY_LABELS[body.category] ? body.category : 'other';
  const severity = SEVERITY_LABELS[body.severity] ? body.severity : 'medium';

  return {
    lat,
    lng,
    category,
    severity,
    description,
    contact: cleanString(body.contact, 320),
    address: cleanString(body.address, 320),
    status: REPORT_STATUS.NEW,
    source: 'mobile-web-map',
  };
}

function reportToFeature(report) {
  const lng = Number(report.lng ?? report.longitude);
  const lat = Number(report.lat ?? report.latitude);

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    properties: {
      id: report.id,
      status: report.status || REPORT_STATUS.NEW,
      category: report.category || 'other',
      categoryLabel: CATEGORY_LABELS[report.category] || CATEGORY_LABELS.other,
      severity: report.severity || 'medium',
      severityLabel: SEVERITY_LABELS[report.severity] || SEVERITY_LABELS.medium,
      description: report.description || report.text || '',
      address: report.address || '',
      contact: report.contact || '',
      createdAt: report.created_at || report.createdAt || '',
      trelloUrl: report.trello_card_url || report.trelloUrl || '',
    },
  };
}

function toGeoJson(reports, meta = {}) {
  return {
    type: 'FeatureCollection',
    features: reports
      .filter((report) => Number.isFinite(Number(report.lat ?? report.latitude)) && Number.isFinite(Number(report.lng ?? report.longitude)))
      .map(reportToFeature),
    meta,
  };
}

function buildTrelloDescription(report) {
  const lines = [
    `Kategori: ${CATEGORY_LABELS[report.category]}`,
    `Alvorlighet: ${SEVERITY_LABELS[report.severity]}`,
    `Status: ${report.status}`,
    `Koordinater: ${report.lat}, ${report.lng}`,
  ];

  if (report.address) lines.push(`Sted/adresse: ${report.address}`);
  if (report.contact) lines.push(`Kontakt: ${report.contact}`);

  lines.push('', report.description, '', `Kart: https://www.google.com/maps?q=${report.lat},${report.lng}`);
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!hasSupabaseConfig()) {
      return res.status(200).json(toGeoJson(DEMO_REPORTS, { demo: true, supabaseConfigured: false }));
    }

    try {
      const reports = await listReports();
      return res.status(200).json(toGeoJson(reports, { demo: false, supabaseConfigured: true }));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunne ikke hente innmeldinger' });
    }
  }

  if (req.method === 'POST') {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase er ikke konfigurert for mottak av innmeldinger' });
    }

    try {
      const reportInput = validateReport(req.body);
      let report = await createReport(reportInput);
      let trelloCard = null;
      let trelloWarning = null;

      if (hasTrelloConfig()) {
        try {
          trelloCard = await createTrelloCard({
            name: `${CATEGORY_LABELS[reportInput.category]} • ${SEVERITY_LABELS[reportInput.severity]} risiko`,
            desc: buildTrelloDescription(reportInput),
          });

          if (trelloCard?.id) {
            report = await updateReport(report.id, {
              trello_card_id: trelloCard.id,
              trello_card_url: trelloCard.url,
            });
          }
        } catch (trelloError) {
          console.error(trelloError);
          trelloWarning = 'Innmelding lagret, men Trello-kort kunne ikke opprettes';
        }
      }

      return res.status(201).json({ report, trelloCard, warning: trelloWarning });
    } catch (error) {
      console.error(error);
      return res.status(400).json({ error: error.message || 'Kunne ikke lagre innmelding' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end('Method Not Allowed');
}
