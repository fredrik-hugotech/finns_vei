// How much each municipality has registered in NVDB on municipal roads
// (crossings and sidewalks), per 1000 children aged 6–15. Where it is low,
// «no crossing / no sidewalk registered» says little about the place:
// Kristiansand has 70 crossings registered on municipal roads, Oslo 4 549.
// Fylkesveg, riksveg and europaveg are registered by the road owner and are
// not judged here.
const BASE = (process.env.NVDB_BASE_URL || 'https://nvdbapiles.atlas.vegvesen.no').replace(/\/+$/, '');
const HEADERS = { Accept: 'application/json', 'X-Client': 'finnsvei' };

// Per 1000 children 6–15. Median among municipalities with 1000+ children
// (2026-11): 10.8 crossings and 1.8 km sidewalk.
const LIMITS = { gangfelt: { weak: 8, good: 20 }, fortau: { weak: 1, good: 5 } };

const level = (v, lim) => (v == null ? null : v < lim.weak ? 'svak' : v < lim.good ? 'delvis' : 'god');

export function coverageFor(row) {
  if (!row || !Number(row.barn_6_15)) return null;
  const per = (x) => (x == null ? null : Number(((Number(x) / Number(row.barn_6_15)) * 1000).toFixed(1)));
  const g = per(row.kv_gangfelt); const f = per(row.kv_fortau_km);
  return {
    kommune: row.kommune,
    kv_gangfelt: row.kv_gangfelt, kv_fortau_km: row.kv_fortau_km,
    gangfelt_per_1000: g, fortau_km_per_1000: f,
    gangfelt: level(g, LIMITS.gangfelt), fortau: level(f, LIMITS.fortau),
  };
}

// Municipal or private road (or unknown): the municipality's registration applies.
export const isMunicipalRoad = (cat) => !cat || cat === 'K' || cat === 'P';

// Whether «not registered» can be trusted for this case.
export function absenceTrusted(cov, roadCategory, what) {
  if (!isMunicipalRoad(roadCategory)) return true;
  return cov?.[what] !== 'svak';
}

async function stat(type, kommune, ref) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`${BASE}/vegobjekter/api/v4/vegobjekter/${type}/statistikk?kommune=${encodeURIComponent(kommune)}&vegsystemreferanse=${ref}`, { headers: HEADERS, signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch (_e) { return null; } finally { clearTimeout(t); }
}

// Fetches the counts for the given municipalities ([{ kommune, barn_6_15 }]).
export async function fetchCoverage(kommuner, concurrency = 8) {
  const out = []; const q = [...kommuner];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (q.length) {
      const k = q.shift();
      const [g, gf, f] = await Promise.all([stat(174, k.kommune, 'K'), stat(174, k.kommune, 'F'), stat(48, k.kommune, 'K')]);
      if (!g || !f) continue;
      out.push({ kommune: k.kommune, barn_6_15: k.barn_6_15, kv_gangfelt: g.antall ?? null, fv_gangfelt: gf?.antall ?? null, kv_fortau_km: Math.round((Number(f.lengde) || 0) / 1000), updated_at: new Date().toISOString() });
    }
  }));
  return out;
}

// Fetches the counts again when the stored ones are more than 30 days old.
export async function ensureCoverage({ oldest, kommuneBarn, save }) {
  const at = oldest ? new Date(oldest).getTime() : 0;
  if (at && Date.now() - at < 30 * 864e5) return 0;
  const kommuner = Array.from(kommuneBarn.entries()).map(([kommune, b]) => ({ kommune, barn_6_15: b.barn_6_15 })).filter((k) => k.barn_6_15 > 0);
  const rows = await fetchCoverage(kommuner);
  await save(rows);
  return rows.length;
}
