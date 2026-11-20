// Recent traffic incidents for staff, from two sources:
// - DATEX traffic messages from Statens vegvesen (accidents with
//   coordinates). Needs a free DATEX account: DATEX_USERNAME / DATEX_PASSWORD.
// - Politiloggen, category Trafikk. Has no coordinates, so the place is worked
//   out from the street or place name in the message (precision «gate» or
//   «sted»), or only the municipality is known.
// Backoffice only: never shown publicly or used in messages to citizens.
// Statens vegvesen's accident register (NVDB) is about a year behind, so this
// is the only way to see accidents near reported places as they happen.

const DATEX_URL = process.env.DATEX_SITUATION_URL || 'https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata';
const POLITI_URL = process.env.POLITILOGGEN_URL || 'https://api.politiet.no/politiloggen/v1/messages';
const UA = { 'User-Agent': 'finnsvei (Finns.Fairway)' };

const log = (event, details = {}) => console.log(JSON.stringify({ scope: 'trafikkhendelser', event, ...details }));

async function get(url, { headers = {}, timeoutMs = 20000, as = 'json' } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ctl.signal });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, body: as === 'text' ? await r.text() : await r.json() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e).slice(0, 120) };
  } finally { clearTimeout(t); }
}

const ACCIDENT = /(ulykk|kollisjon|kollider|påkjør|trafikkuhell|utforkjøring|frontkoll|velt(et|a)\b|bil mot|truffet av|kjørt på|mc-ulykke|sykkelulykke)/i;

// --- DATEX ---------------------------------------------------------------

export const datexConfigured = () => Boolean(process.env.DATEX_USERNAME && process.env.DATEX_PASSWORD);

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([^<]*)</(?:\\w+:)?${name}>`));
  return m ? m[1].trim() : null;
};

const ACCIDENT_TYPES = {
  collision: 'kollisjon', collisionWithPerson: 'påkjørt person', collisionWithAnimal: 'viltpåkjørsel', collisionWithObstruction: 'kollisjon med hindring',
  headOnCollision: 'frontkollisjon', rearCollision: 'påkjøring bakfra', sideCollision: 'sidekollisjon', multivehicleCollision: 'flere kjøretøy',
  vehicleOffRoad: 'utforkjøring', overturnedVehicle: 'veltet kjøretøy', vehicleSpunAround: 'kjøretøy snurret rundt', accident: 'ulykke',
  seriousAccident: 'alvorlig ulykke', accidentInvolvingBicycles: 'syklist involvert', accidentInvolvingHeavyLorries: 'tungbil involvert', accidentInvolvingBuses: 'buss involvert',
};

// Tolerant reading of DATEX II situation records (namespaces vary).
export function parseDatex(xml) {
  const out = [];
  const parts = String(xml || '').split(/<(?:\w+:)?situationRecord\b/).slice(1);
  for (const raw of parts) {
    const head = raw.slice(0, 400);
    const type = (head.match(/xsi:type="(?:\w+:)?(\w+)"/) || [])[1] || '';
    if (!/accident/i.test(type)) continue;
    const id = (head.match(/\bid="([^"]+)"/) || [])[1];
    const lat = Number(tag(raw, 'latitude'));
    const lng = Number(tag(raw, 'longitude'));
    if (!id) continue;
    const comment = (raw.match(/generalPublicComment[\s\S]*?<(?:\w+:)?value\b[^>]*>([^<]+)</) || [])[1] || null;
    const accidentType = (raw.match(/<(?:\w+:)?accidentType>([^<]+)</) || [])[1] || null;
    out.push({
      id: `datex:${id}`,
      source: 'datex',
      external_id: id,
      is_accident: true,
      title: accidentType ? `Ulykke (${ACCIDENT_TYPES[accidentType] || accidentType})` : 'Ulykke',
      text: comment,
      severity: tag(raw, 'severity'),
      lat: Number.isFinite(lat) && lat ? lat : null,
      lng: Number.isFinite(lng) && lng ? lng : null,
      precision: Number.isFinite(lat) && lat ? 'punkt' : 'ukjent',
      place_text: tag(raw, 'roadName') || tag(raw, 'roadNumber') || null,
      occurred_at: tag(raw, 'overallStartTime') || tag(raw, 'situationRecordCreationTime'),
      updated_at: tag(raw, 'situationRecordVersionTime'),
      active: true,
    });
  }
  return out;
}

export async function fetchDatex() {
  if (!datexConfigured()) return { ok: false, reason: 'ikke konfigurert', rows: [] };
  const auth = Buffer.from(`${process.env.DATEX_USERNAME}:${process.env.DATEX_PASSWORD}`).toString('base64');
  const r = await get(DATEX_URL, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/xml' }, as: 'text', timeoutMs: 45000 });
  if (!r.ok) { log('datex_failed', { status: r.status, error: r.error }); return { ok: false, reason: `HTTP ${r.status}`, rows: [] }; }
  const rows = parseDatex(r.body);
  log('datex_fetched', { bytes: r.body.length, accidents: rows.length, records: (r.body.match(/situationRecord\b/g) || []).length });
  return { ok: true, rows };
}

// --- Politiloggen --------------------------------------------------------

// Street or road name in the text: «i Hillevågsveien», «på Kongsgårdbakken».
const STREET = /\b((?:[A-ZÆØÅ][a-zæøå]+[\s-])?[A-ZÆØÅ][a-zæøåé]+(?:veien|vegen|vei|veg|gata|gate|allé|alle|bakken|plassen|plass|krysset|rundkjøringen))\b/;

async function geocode({ text, area, municipality }) {
  const kommune = municipality ? `&kommunenavn=${encodeURIComponent(municipality)}` : '';
  const street = (String(text || '').match(STREET) || [])[1];
  if (street && municipality) {
    const r = await get(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(street)}${kommune}&treffPerSide=1&utkoordsys=4326`, { timeoutMs: 8000 });
    const a = r.ok ? r.body?.adresser?.[0] : null;
    if (a?.representasjonspunkt?.lat) return { lat: a.representasjonspunkt.lat, lng: a.representasjonspunkt.lon, precision: 'gate', place_text: street, kommune: a.kommunenummer || null };
  }
  if (area && municipality && area.toLowerCase() !== municipality.toLowerCase()) {
    const r = await get(`https://api.kartverket.no/stedsnavn/v1/navn?sok=${encodeURIComponent(area)}${kommune}&treffPerSide=1&utkoordsys=4326`, { timeoutMs: 8000 });
    const n = r.ok ? r.body?.navn?.[0] : null;
    const p = n?.representasjonspunkt;
    if (p?.nord) return { lat: p.nord, lng: p['øst'], precision: 'sted', place_text: area, kommune: n.kommuner?.[0]?.kommunenummer || null };
  }
  return { lat: null, lng: null, precision: 'kommune', place_text: area || null, kommune: null };
}

const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return null; };

function threadText(t) {
  const msgs = Array.isArray(t.messages) ? t.messages : [];
  const texts = msgs.map((m) => pick(m, 'text', 'content', 'body')).filter(Boolean);
  return (texts.length ? texts.reverse().join('\n') : pick(t, 'text', 'content', 'body')) || '';
}

export async function fetchPolitiloggen({ take = 100, known = new Map() } = {}) {
  const r = await get(`${POLITI_URL}?Categories=Trafikk&Take=${take}`);
  if (!r.ok) { log('politiloggen_failed', { status: r.status, error: r.error }); return { ok: false, reason: `HTTP ${r.status}`, rows: [] }; }
  const list = Array.isArray(r.body) ? r.body : (r.body?.data || r.body?.messageThreads || r.body?.items || []);
  if (list[0]) log('politiloggen_shape', { keys: Object.keys(list[0]).slice(0, 30), count: list.length });
  const rows = [];
  for (const t of list) {
    const id = pick(t, 'id', 'threadId');
    if (!id) continue;
    const text = threadText(t).slice(0, 2000);
    const municipality = pick(t, 'municipality', 'kommune');
    const area = pick(t, 'area', 'place', 'location');
    const isAccident = ACCIDENT.test(text);
    // Only accidents are placed on the map; other traffic messages are kept
    // without a lookup.
    const prev = known.get(`politiloggen:${id}`);
    const place = !isAccident ? { lat: null, lng: null, precision: 'kommune', place_text: area, kommune: null }
      : (prev && prev.text === text ? prev : await geocode({ text, area, municipality }));
    rows.push({
      id: `politiloggen:${id}`,
      source: 'politiloggen',
      external_id: String(id),
      is_accident: isAccident,
      title: [municipality, area].filter(Boolean).join(', ') || 'Politiloggen',
      text,
      severity: null,
      kommune: place.kommune,
      area: area || null,
      district: pick(t, 'district', 'districtName'),
      lat: place.lat, lng: place.lng, precision: place.precision, place_text: place.place_text,
      occurred_at: pick(t, 'createdOn', 'created', 'createdAt'),
      updated_at: pick(t, 'updatedOn', 'lastMessageOn', 'updated', 'updatedAt'),
      active: t.isActive ?? null,
    });
  }
  log('politiloggen_fetched', { threads: list.length, accidents: rows.filter((x) => x.is_accident).length, placed: rows.filter((x) => x.lat).length });
  return { ok: true, rows };
}

// --- Matching ------------------------------------------------------------

const R = 6371000;
export function meters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// How close counts as «at the reported place», by how exact the position is.
export const MATCH_RADIUS = { punkt: 200, gate: 300, sted: 600 };

// Cases near an incident: [{ id, m, ... }] nearest first.
export function casesNear(incident, cases, max = 5) {
  const r = MATCH_RADIUS[incident.precision];
  if (!r || incident.lat == null) return [];
  const here = { lat: Number(incident.lat), lng: Number(incident.lng) };
  return cases
    .filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)))
    .map((c) => ({ c, m: Math.round(meters(here, { lat: Number(c.lat), lng: Number(c.lng) })) }))
    .filter((x) => x.m <= r)
    .sort((a, b) => a.m - b.m)
    .slice(0, max);
}

// --- Refresh -------------------------------------------------------------

// Fetches both sources and stores what they return. `store` gives the
// database functions (lib/supabaseRest.js) so this file has no imports.
export async function refreshTrafficIncidents(store) {
  const known = await store.knownPolitiloggen().catch(() => new Map());
  const [datex, politi] = await Promise.all([
    fetchDatex().catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 80), rows: [] })),
    fetchPolitiloggen({ known }).catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 80), rows: [] })),
  ]);
  const rows = [...datex.rows, ...politi.rows].map((r) => ({ ...r, fetched_at: new Date().toISOString() }));
  if (rows.length) await store.save(rows);
  const status = { at: new Date().toISOString(), datex: datex.ok ? 'ok' : datex.reason, politiloggen: politi.ok ? 'ok' : politi.reason, saved: rows.length };
  await store.setStatus(status).catch(() => {});
  return status;
}
