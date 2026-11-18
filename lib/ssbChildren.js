import { countRows, upsertGrunnkretsBarn } from './supabaseRest';

// Children and young people per grunnkrets from SSB (table 04362), loaded
// into grunnkrets_barn. One request fetches the whole country (~1.6 MB).
// SSB rounds 1s and 2s to 0 or 3 to protect privacy.
const URL = 'https://data.ssb.no/api/v0/no/table/04362/';

async function latestYear() {
  const r = await fetch(URL);
  const d = await r.json();
  const tid = d.variables.find((v) => v.code === 'Tid');
  return tid.values[tid.values.length - 1];
}

export async function loadGrunnkretsChildren() {
  const year = await latestYear();
  const body = {
    query: [
      { code: 'Region', selection: { filter: 'all', values: ['*'] } },
      { code: 'Alder', selection: { filter: 'item', values: ['00-05', '06-15', '16-19'] } },
      { code: 'Tid', selection: { filter: 'item', values: [year] } },
    ],
    response: { format: 'json-stat2' },
  };
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`SSB ${r.status}`);
  const d = await r.json();
  const reg = d.dimension.Region.category;
  const ages = d.dimension.Alder.category.index;
  const per = d.size[1];
  const v = d.value;
  const rows = [];
  for (const [kode, i] of Object.entries(reg.index)) {
    if (kode.length !== 8 || kode.endsWith('0000')) continue;
    const at = (age) => Number(v[i * per + ages[age]]) || 0;
    const b05 = at('00-05'); const b615 = at('06-15'); const u1619 = at('16-19');
    if (!b05 && !b615 && !u1619) continue;
    rows.push({ kode, navn: String(reg.label[kode] || '').replace(/\s+/g, ' ').trim(), kommune: kode.slice(0, 4), barn_0_5: b05, barn_6_15: b615, ungdom_16_19: u1619, aar: Number(year), updated_at: new Date().toISOString() });
  }
  for (let i = 0; i < rows.length; i += 1000) await upsertGrunnkretsBarn(rows.slice(i, i + 1000));
  return { year: Number(year), grunnkretser: rows.length };
}

export async function ensureGrunnkretsChildren() {
  const n = await countRows('grunnkrets_barn', '?select=kode').catch(() => 0);
  if (n > 1000) return { loaded: false, rows: n };
  return { loaded: true, ...(await loadGrunnkretsChildren()) };
}
