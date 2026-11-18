import { FYLKER } from './fylker';
import { REPORT_STATUS } from './config';

// Shared numbers for Finn's brief, the municipality report and «Spør Finn».
// Rows come from the triage_overview_rows RPC (linked child reports excluded).

const EFFORT_FACTOR = { enkel: 1.25, middels: 1, stor: 0.85 };

// Score = AI urgency, raised by citizen support, linked reports, other
// reports at the same spot, accidents, traffic and children nearby; lowered
// when the work is large.
export function priorityScore(r) {
  const urgency = Number(r.urgency) || 2;
  const support = Math.log2(1 + (Number(r.support_count) || 0) + (Number(r.linked_count) || 0) * 1.5);
  const cluster = Math.log2(1 + (Number(r.nearby) || 0));
  // Facts about the place: police-registered accidents nearby (more weight
  // when a pedestrian or cyclist was involved), traffic and children around.
  const accidents = Math.log2(1 + (Number(r.acc_10y) || 0)) * 1.2 + Math.log2(1 + (Number(r.acc_vulnerable_10y) || 0)) * 1.5;
  const traffic = Number(r.aadt) >= 10000 ? 1 : Number(r.aadt) >= 4000 ? 0.6 : Number(r.aadt) >= 1000 ? 0.25 : 0;
  // Children who live nearby (SSB) when known, otherwise pupils at schools nearby.
  const kids = r.barn_6_15_1km != null ? Number(r.barn_6_15_1km) : Number(r.students_1km) || 0;
  const children = kids >= 800 ? 0.9 : kids >= 300 ? 0.6 : kids >= 100 ? 0.3 : 0;
  const small = Number(r.kindergarten_children_500m) >= 50 ? 0.3 : 0;
  // Missing protection where it matters: no sidewalk or foot/cycle path, or no
  // crossing nearby, on a busy road.
  const busy = Number(r.aadt) >= 2000 || Number(r.speed_limit) >= 50;
  const gaps = busy ? ((r.has_sidewalk === false && r.has_cycleway !== true ? 0.6 : 0) + (r.crossings_100m === 0 ? 0.3 : 0)) : 0;
  return Number(((urgency * 2 + support + cluster * 1.5 + accidents + traffic + children + small + gaps) * (EFFORT_FACTOR[r.effort] || 1)).toFixed(2));
}

export function enrichRows(rows) {
  return (rows || []).map((r) => ({
    ...r,
    fylke: r.kommune ? FYLKER[String(r.kommune).slice(0, 2)] || '' : '',
    score: r.urgency ? priorityScore(r) : 0,
  }));
}

const isOpen = (r) => r.status !== REPORT_STATUS.DONE;
const countBy = (rows, f, top = 8) => {
  const m = new Map();
  for (const r of rows) { const k = f(r) || 'Ukjent'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([navn, antall]) => ({ navn, antall }));
};

export function overviewStats(rows, { days = 1 } = {}) {
  const now = Date.now();
  const since = new Date(now - days * 864e5).toISOString();
  const prevSince = new Date(now - days * 2 * 864e5).toISOString();
  const open = rows.filter(isOpen);
  const recent = rows.filter((r) => String(r.created_at) >= since);
  return {
    periode_dager: days,
    saker_totalt: rows.length,
    meldinger_samlet_i_saker: rows.reduce((s, r) => s + (Number(r.linked_count) || 0), 0),
    apne_saker: open.length,
    nye_i_perioden: recent.length,
    nye_forrige_periode: rows.filter((r) => String(r.created_at) >= prevSince && String(r.created_at) < since).length,
    hastesaker_apne: open.filter((r) => Number(r.urgency) >= 5).length,
    apne_med_ulykker_10ar: open.filter((r) => Number(r.acc_10y) > 0).length,
    apne_med_fotgjenger_sykkel_ulykker: open.filter((r) => Number(r.acc_vulnerable_10y) > 0).length,
    hoy_hast_apne: open.filter((r) => Number(r.urgency) === 4).length,
    raske_gevinster_apne: open.filter((r) => r.quick_win).length,
    trenger_befaring: open.filter((r) => r.needs_site_visit).length,
    apne_med_kontaktperson: open.filter((r) => Number(r.contact_count) > 0).length,
    ikke_vurdert: open.filter((r) => !r.urgency).length,
    fullfort_i_perioden: rows.filter((r) => r.status === REPORT_STATUS.DONE).length,
    nye_per_kommune: countBy(recent, (r) => r.kommune_navn, 6),
    nye_per_kategori: countBy(recent, (r) => r.category, 6),
  };
}

export function topCases(rows, n = 12) {
  return rows.filter((r) => isOpen(r) && r.urgency).sort((a, b) => b.score - a.score).slice(0, n);
}

export function kommuneList(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r.kommune) continue;
    const k = m.get(r.kommune) || { kode: r.kommune, navn: r.kommune_navn || r.kommune, fylke: r.fylke, antall: 0 };
    k.antall += 1 + (Number(r.linked_count) || 0);
    m.set(r.kommune, k);
  }
  return [...m.values()].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
}

export function kommuneStats(rows, kommuneBarn = null) {
  const months = new Map();
  const start = new Date(); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 11);
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(start); d.setUTCMonth(start.getUTCMonth() + i);
    months.set(d.toISOString().slice(0, 7), 0);
  }
  for (const r of rows) {
    const k = String(r.created_at).slice(0, 7);
    if (months.has(k)) months.set(k, months.get(k) + 1 + (Number(r.linked_count) || 0));
  }
  return {
    meldinger_totalt: rows.reduce((s, r) => s + 1 + (Number(r.linked_count) || 0), 0),
    saker: rows.length,
    apne: rows.filter(isOpen).length,
    fullfort: rows.filter((r) => r.status === REPORT_STATUS.DONE).length,
    stotte_fra_innbyggere: rows.reduce((s, r) => s + (Number(r.support_count) || 0), 0),
    siste_30_dager: rows.filter((r) => String(r.created_at) >= new Date(Date.now() - 30 * 864e5).toISOString()).length,
    hastesaker: rows.filter((r) => isOpen(r) && Number(r.urgency) >= 5).length,
    per_kategori: countBy(rows, (r) => r.category, 8),
    per_tiltak: countBy(rows.filter((r) => r.measure_type), (r) => r.measure_type, 8),
    per_veieier: countBy(rows.filter((r) => r.responsible), (r) => r.responsible, 5),
    per_innsats: countBy(rows.filter((r) => r.effort), (r) => r.effort, 3),
    per_maned: [...months.entries()].map(([maned, antall]) => ({ maned, antall })),
    saker_med_ulykker_10ar: rows.filter((r) => Number(r.acc_10y) > 0).length,
    ulykker_10ar_ved_saker: rows.reduce((s2, r) => s2 + (Number(r.acc_10y) || 0), 0),
    ulykker_fotgjenger_sykkel_10ar: rows.reduce((s2, r) => s2 + (Number(r.acc_vulnerable_10y) || 0), 0),
    saker_med_mye_trafikk: rows.filter((r) => Number(r.aadt) >= 4000).length,
    ...(kommuneBarn ? {
      barn_6_15_i_kommunen: kommuneBarn.barn_6_15,
      meldinger_per_1000_barn: kommuneBarn.barn_6_15 ? Number(((rows.reduce((s2, r) => s2 + 1 + (Number(r.linked_count) || 0), 0) / kommuneBarn.barn_6_15) * 1000).toFixed(1)) : null,
    } : {}),
  };
}

export function engagementTop(rows, n = 10) {
  const eng = (r) => (Number(r.support_count) || 0) + (Number(r.linked_count) || 0) * 1.5 + (Number(r.urgency) || 0);
  return [...rows].sort((a, b) => eng(b) - eng(a)).slice(0, n);
}

export function osloDate(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
}

// Kartanalyse: what characterises the places people report, nationally or for
// one municipality. Shares are of reports with the data in question.
export function gisAnalysis(rows) {
  const has = (f) => rows.filter((r) => r[f] !== null && r[f] !== undefined);
  const share = (list, pred) => (list.length ? Math.round((list.filter(pred).length / list.length) * 100) : null);
  const withAcc = has('acc_10y'); const withAadt = has('aadt'); const withSide = has('has_sidewalk');
  const withCross = has('crossings_100m'); const withKids = has('barn_6_15_1km'); const withSchool = has('nearest_school_m');
  const median = (vals) => { const v = vals.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  return {
    saker: rows.length,
    andel_naer_skole_300m: share(withSchool, (r) => Number(r.nearest_school_m) <= 300),
    andel_naer_skole_500m: share(withSchool, (r) => Number(r.nearest_school_m) <= 500),
    andel_med_barnehage_500m: share(has('kindergarten_children_500m'), (r) => Number(r.kindergarten_children_500m) > 0),
    andel_med_idrettsanlegg_500m: share(has('venues_500m'), (r) => Number(r.venues_500m) > 0),
    median_barn_6_15_1km: median(withKids.map((r) => Number(r.barn_6_15_1km))),
    andel_adt_over_4000: share(withAadt, (r) => Number(r.aadt) >= 4000),
    andel_adt_over_10000: share(withAadt, (r) => Number(r.aadt) >= 10000),
    median_adt: median(withAadt.map((r) => Number(r.aadt))),
    andel_fart_50_pluss: share(has('speed_limit'), (r) => Number(r.speed_limit) >= 50),
    andel_uten_fortau_eller_gs: share(withSide, (r) => r.has_sidewalk === false && r.has_cycleway !== true),
    andel_uten_gangfelt_100m: share(withCross, (r) => Number(r.crossings_100m) === 0),
    andel_med_ulykker_10ar: share(withAcc, (r) => Number(r.acc_10y) > 0),
    andel_med_fotgjenger_sykkel_ulykke: share(withAcc, (r) => Number(r.acc_vulnerable_10y) > 0),
    ulykker_10ar_totalt: withAcc.reduce((s2, r) => s2 + (Number(r.acc_10y) || 0), 0),
    ulykker_i_morke: withAcc.reduce((s2, r) => s2 + (Number(r.dark_10y) || 0), 0),
    risikosteder: rows.filter((r) => Number(r.barn_6_15_1km) >= 300 && (Number(r.aadt) >= 4000 || Number(r.speed_limit) >= 50) && (r.has_sidewalk === false || Number(r.crossings_100m) === 0 || Number(r.acc_vulnerable_10y) > 0)).length,
    dekning: { ulykker: withAcc.length, adt: withAadt.length, fortau: withSide.length, barn: withKids.length },
  };
}
