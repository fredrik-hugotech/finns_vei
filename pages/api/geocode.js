import { checkRequestRateLimit } from '../../lib/rateLimit';

// Place search backend for the topbar "Søk etter sted" field.
//
// Mapbox's forward geocoding is thin on Norwegian points of interest — it
// finds streets and towns but not "Lovisenlund skole" — so we search
// Kartverket's open place-name register (stedsnavn: schools, kindergartens,
// sports grounds, farms, hills …) and address register first. Both are free,
// key-less and proxied here so the browser needs no new CSP host. Mapbox is
// only used as a fallback when Kartverket comes up short, so a typo'd or
// unusual query still gets a best-effort answer.
const KARTVERKET_UA = 'FinnsFairway/1.0 (https://finnsvei.no; fredrik@hugo.as)';
const FETCH_TIMEOUT_MS = 4000;
const MAX_RESULTS = 8;

// Search is fired on every debounced keystroke, so budget for a person
// typing a few different queries — tight enough to slow a script down.
const RATE_LIMIT = 120;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

// Friendlier labels for the most common Kartverket navneobjekttype values.
const TYPE_LABELS = {
  Skole: 'Skole',
  Barnehage: 'Barnehage',
  Idrettsanlegg: 'Idrettsanlegg',
  Idrettshall: 'Idrettshall',
  Kirke: 'Kirke',
  Bydel: 'Bydel',
  Tettsted: 'Tettsted',
  By: 'By',
  Tettbebyggelse: 'Tettbebyggelse',
  Boligfelt: 'Boligfelt',
  Grend: 'Grend',
  Bruk: 'Gård',
  Gard: 'Gård',
  Gård: 'Gård',
  Busstopp: 'Busstopp',
  Holdeplass: 'Holdeplass',
  Stasjon: 'Stasjon',
  Sykehus: 'Sykehus',
  Kjøpesenter: 'Kjøpesenter',
  Park: 'Park',
  Torg: 'Torg',
  Veg: 'Vei',
  Gate: 'Gate',
};

// Ranking nudges per navneobjekttype (see rank()).
const TYPE_BOOST = {
  Skole: 5,
  Barnehage: 5,
  Idrettsanlegg: 4,
  Idrettshall: 4,
  Busstopp: 3,
  Holdeplass: 3,
  Stasjon: 3,
  Tettsted: 3,
  By: 3,
  Bydel: 2,
  Boligfelt: 2,
  Park: 2,
  Torg: 2,
  Kirke: 2,
  Bruk: -3,
  Gard: -3,
  Gård: -3,
  Bekk: -4,
  Elv: -4,
  Tjern: -4,
  Vann: -4,
  Myr: -4,
  Haug: -4,
  Ås: -4,
  Fjell: -4,
  Skog: -4,
};

function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s-])\S/g, (m) => m.toUpperCase());
}

// Kartverket stedsnavn v1 — representasjonspunkt comes back as {øst, nord}
// (with utkoordsys=4258 that's lon/lat). Be lenient about the exact field
// names so a minor API revision degrades to "no results" rather than a crash.
async function searchPlaceNames(q) {
  const url = 'https://ws.geonorge.no/stedsnavn/v1/navn'
    + `?sok=${encodeURIComponent(q.includes('*') ? q : `${q}*`)}`
    + '&fuzzy=true&utkoordsys=4258&treffPerSide=12&side=1';
  const data = await fetchJson(url, { 'User-Agent': KARTVERKET_UA });
  const list = Array.isArray(data?.navn) ? data.navn : [];
  const out = [];
  for (const n of list) {
    const name = n?.skrivemåte || n?.skrivemaate || n?.stedsnavn?.[0]?.skrivemåte;
    const rp = n?.representasjonspunkt || {};
    const lng = Number(rp.øst ?? rp.ost ?? rp.lon ?? rp.x);
    const lat = Number(rp.nord ?? rp.lat ?? rp.y);
    if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const kommune = n?.kommuner?.[0]?.kommunenavn || '';
    const type = n?.navneobjekttype || '';
    const typeLabel = TYPE_LABELS[type] || type;
    out.push({
      id: `sn-${n.stedsnummer || `${lng},${lat}`}`,
      primary: name,
      secondary: [typeLabel, kommune].filter(Boolean).join(' · '),
      lng,
      lat,
      source: 'stedsnavn',
      typeBoost: TYPE_BOOST[type] || 0,
    });
  }
  return out;
}

// Kartverket adresser v1 — representasjonspunkt is {lat, lon}.
async function searchAddresses(q) {
  const url = 'https://ws.geonorge.no/adresser/v1/sok'
    + `?sok=${encodeURIComponent(q.includes('*') ? q : `${q}*`)}`
    + '&fuzzy=true&utkoordsys=4258&treffPerSide=8&side=0';
  const data = await fetchJson(url, { 'User-Agent': KARTVERKET_UA });
  const list = Array.isArray(data?.adresser) ? data.adresser : [];
  const out = [];
  for (const a of list) {
    const rp = a?.representasjonspunkt || {};
    const lng = Number(rp.lon ?? rp.øst ?? rp.x);
    const lat = Number(rp.lat ?? rp.nord ?? rp.y);
    const text = a?.adressetekst;
    if (!text || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const place = [a.postnummer, titleCase(a.poststed)].filter(Boolean).join(' ');
    out.push({
      id: `adr-${a.adresseId || a.id || `${lng},${lat}`}`,
      primary: text,
      secondary: place || titleCase(a.kommunenavn),
      lng,
      lat,
      source: 'adresse',
    });
  }
  return out;
}

// Mapbox fallback — the search the app used before Kartverket was wired in.
async function searchMapbox(q, proximity) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];
  const prox = proximity ? `&proximity=${proximity.lng},${proximity.lat}` : '';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
    + `?access_token=${token}&country=no&language=no&limit=6&autocomplete=true`
    + `&types=place,locality,neighborhood,address,poi,postcode${prox}`;
  const data = await fetchJson(url);
  const feats = Array.isArray(data?.features) ? data.features : [];
  return feats
    .filter((f) => Array.isArray(f.center) && Number.isFinite(Number(f.center[0])))
    .map((f) => ({
      id: `mb-${f.id}`,
      primary: f.text || (f.place_name || '').split(',')[0],
      secondary: (f.place_name || '').split(',').slice(1).join(',').trim(),
      lng: Number(f.center[0]),
      lat: Number(f.center[1]),
      source: 'mapbox',
    }));
}

function dedupe(results) {
  const seen = [];
  return results.filter((r) => {
    const key = r.primary.toLowerCase();
    const dup = seen.some((s) => s.key === key && distanceKm(s, r) < 0.3);
    if (dup) return false;
    seen.push({ key, lng: r.lng, lat: r.lat });
    return true;
  });
}

function rank(results, q, proximity) {
  const needle = q.toLowerCase();
  const looksLikeAddress = /\d/.test(q);
  return results
    .map((r) => {
      const name = r.primary.toLowerCase();
      let score = 0;
      // Text match matters, but not so much that "Lovisenlund" (a farm)
      // buries "Lovisenlund skole" when someone has typed the first word.
      if (name === needle) score += 12;
      else if (name.startsWith(needle)) score += 10;
      else if (name.includes(needle)) score += 5;
      if (r.source === 'stedsnavn') score += looksLikeAddress ? 0 : 6;
      // Places people actually navigate to in a school-run context outrank
      // farms, hills and streams that happen to share the name.
      if (r.typeBoost) score += r.typeBoost;
      if (r.source === 'adresse') score += looksLikeAddress ? 6 : 0;
      if (r.source === 'mapbox') score -= 4;
      const km = proximity ? distanceKm(proximity, r) : null;
      // Nearby wins ties: something within the same town beats the same
      // name 400 km away. Cap so distance never outweighs a text match.
      if (km !== null) score += Math.max(0, 8 - Math.min(8, km / 15));
      return { ...r, score, km };
    })
    .sort((a, b) => b.score - a.score || (a.km ?? 0) - (b.km ?? 0));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'geocode', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ ok: false, error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (q.length < 2) return res.status(400).json({ ok: false, error: 'Søket er for kort' });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const proximity = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;

  try {
    const [places, addresses] = await Promise.all([searchPlaceNames(q), searchAddresses(q)]);
    let results = [...places, ...addresses];
    // Kartverket is authoritative for Norway; only lean on Mapbox when it
    // found little (typos, colloquial names, businesses).
    if (results.length < 3) results = results.concat(await searchMapbox(q, proximity));
    results = rank(dedupe(results), q, proximity).slice(0, MAX_RESULTS)
      .map(({ id, primary, secondary, lng: x, lat: y, source }) => ({ id, primary, secondary, lng: x, lat: y, source }));

    // Public data keyed by the full query string (text + rounded proximity)
    // — safe to cache at the edge so repeated searches skip Kartverket.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ ok: true, results });
  } catch (_e) {
    return res.status(200).json({ ok: false, results: [] });
  }
}
