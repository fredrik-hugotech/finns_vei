import { countRows, listKommuneNumbers, upsertBarnehager } from './supabaseRest';

// Kindergartens with number of children, from Barnehagefakta (Udir), one
// request per municipality (~360). Stored in the barnehager table.
const BASE = 'https://www.barnehagefakta.no/api/Location/kommune/';

async function forKommune(nr) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`${BASE}${encodeURIComponent(nr)}`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return [];
    const list = await r.json();
    return (Array.isArray(list) ? list : []).filter((b) => Array.isArray(b.koordinatLatLng) && b.koordinatLatLng.length === 2).map((b) => ({
      orgnr: String(b.orgnr),
      navn: b.navn || null,
      kommune: b.kommunenummer || nr,
      lat: Number(b.koordinatLatLng[0]),
      lng: Number(b.koordinatLatLng[1]),
      antall_barn: Number.isFinite(Number(b.antallBarn)) ? Number(b.antallBarn) : null,
      alder: b.alder || null,
      eierform: b.eierform || null,
      updated_at: new Date().toISOString(),
    })).filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng));
  } catch (_e) {
    return [];
  } finally { clearTimeout(t); }
}

export async function loadBarnehager() {
  const kommuner = await listKommuneNumbers();
  let total = 0;
  const queue = [...kommuner];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const nr = queue.shift();
      const rows = await forKommune(nr);
      if (rows.length) { await upsertBarnehager(rows); total += rows.length; }
    }
  }));
  return { barnehager: total, kommuner: kommuner.length };
}

export async function ensureBarnehager() {
  const n = await countRows('barnehager', '?select=orgnr').catch(() => 0);
  if (n > 1000) return { loaded: false, rows: n };
  return { loaded: true, ...(await loadBarnehager()) };
}
