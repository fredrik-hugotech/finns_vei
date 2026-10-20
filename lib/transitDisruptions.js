import { distanceMeters } from './geoPrivacy';
import skoler from './skoler.json';

// Public-transport disruptions near schools ("Avvik ved skolevei"): closed
// stops and detours from Entur's open journey planner API (SIRI SX for Agder
// Kollektivtrafikk), matched against every primary school in the
// municipality (lib/skoler.json, from Utdanningsdirektoratet). Used by the
// backoffice list (/backoffice/skolevei-avvik).

const ENTUR_URL = 'https://api.entur.io/journey-planner/v3/graphql';
const CODESPACES = ['AKT'];
const NEAR_SCHOOL_M = 500; // a stop this close to a school counts as "ved skole"
const IN_AREA_M = 3000; // further away than this from every school: not our area
const UPCOMING_DAYS = 14; // also show disruptions starting within two weeks
const TTL_MS = 5 * 60 * 1000;

const QUERY = `query($codespaces: [String!]) {
  situations(codespaces: $codespaces) {
    id
    summary { value language }
    description { value language }
    advice { value language }
    validityPeriod { startTime endTime }
    affects {
      __typename
      ... on AffectedStopPlace { stopPlace { id name latitude longitude } quay { id name latitude longitude stopPlace { id name } } }
      ... on AffectedStopPlaceOnLine { stopPlace { id name latitude longitude } quay { id name latitude longitude stopPlace { id name } } line { publicCode } }
    }
  }
}`;

const pickText = (list) => {
  if (!Array.isArray(list) || !list.length) return '';
  const nb = list.find((t) => /^(no|nb|nob|nor)$/i.test(t?.language || ''));
  return String((nb || list[0])?.value || '').trim();
};

function nearestSchool(point) {
  let best = null;
  for (const s of skoler.schools) {
    const d = distanceMeters(point, s);
    if (!best || d < best.distanceM) best = { name: s.name, distanceM: Math.round(d), students: s.students, lat: s.lat, lng: s.lng };
  }
  return best;
}

export async function fetchSituations() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(ENTUR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ET-Client-Name': 'finnsfairway-finnsvei' },
      body: JSON.stringify({ query: QUERY, variables: { codespaces: CODESPACES } }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Entur svarte ${r.status}`);
    const d = await r.json();
    if (d.errors?.length) throw new Error('Entur-feil');
    return d?.data?.situations || [];
  } finally {
    clearTimeout(timer);
  }
}

export function shapeSituations(situations, now = Date.now()) {
  const horizon = now + UPCOMING_DAYS * 86400000;
  const out = [];
  for (const s of situations) {
    const start = s.validityPeriod?.startTime ? Date.parse(s.validityPeriod.startTime) : null;
    const end = s.validityPeriod?.endTime ? Date.parse(s.validityPeriod.endTime) : null;
    if (end && end < now) continue;
    if (start && start > horizon) continue;

    // One entry per stop, with every line the notice names there.
    const stops = new Map();
    for (const a of s.affects || []) {
      // Notices often name only the platform (quay); its stop gives the name.
      const sp = a.stopPlace || a.quay?.stopPlace || null;
      const lat = Number(a.quay?.latitude ?? a.stopPlace?.latitude);
      const lng = Number(a.quay?.longitude ?? a.stopPlace?.longitude);
      const id = sp?.id || a.quay?.id;
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const entry = stops.get(id) || { id, name: sp?.name || a.quay?.name || 'Holdeplass', lat, lng, lines: [] };
      const code = a.line?.publicCode;
      if (code && !entry.lines.includes(code)) entry.lines.push(code);
      stops.set(sp.id, entry);
    }
    if (!stops.size) continue; // fare/info notices without a place

    const list = [...stops.values()].map((stop) => ({ ...stop, school: nearestSchool(stop) }));
    list.sort((a, b) => a.school.distanceM - b.school.distanceM);
    const closest = list[0].school;
    if (closest.distanceM > IN_AREA_M) continue;

    // Night buses (N12 …) don't run when children go to and from school.
    const lines = [...new Set(list.flatMap((stop) => stop.lines))];
    const nightOnly = lines.length > 0 && lines.every((code) => /^N\d/i.test(code));

    out.push({
      id: s.id,
      nightOnly,
      summary: pickText(s.summary),
      description: pickText(s.description),
      advice: pickText(s.advice),
      start: s.validityPeriod?.startTime || null,
      end: s.validityPeriod?.endTime || null,
      upcoming: Boolean(start && start > now),
      nearSchool: !nightOnly && closest.distanceM <= NEAR_SCHOOL_M,
      closestSchool: closest,
      stops: list,
    });
  }
  out.sort((a, b) => (Number(b.nearSchool) - Number(a.nearSchool)) || (a.closestSchool.distanceM - b.closestSchool.distanceM));
  return out;
}


let cache = { at: 0, data: null };

// Cached for TTL_MS per server instance; on an Entur hiccup the previous
// answer is served (marked stale) rather than nothing.
export async function getSchoolRouteDisruptions() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return { ...cache.data, cachedAt: cache.at };
  try {
    const items = shapeSituations(await fetchSituations());
    cache = { at: Date.now(), data: { items, nearSchoolM: NEAR_SCHOOL_M, schools: skoler.schools.length, schoolsFetched: skoler.fetched } };
    return { ...cache.data, cachedAt: cache.at };
  } catch (error) {
    if (cache.data) return { ...cache.data, cachedAt: cache.at, stale: true };
    throw error;
  }
}
