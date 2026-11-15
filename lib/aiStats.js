import { FYLKER } from './fylker';
import { REPORT_STATUS } from './config';

// Shared numbers for Finn's brief, the municipality report and «Spør Finn».
// Rows come from the triage_overview_rows RPC (linked child reports excluded).

const EFFORT_FACTOR = { enkel: 1.25, middels: 1, stor: 0.85 };

// Score = AI urgency, raised by citizen support, linked reports and other
// reports at the same spot, lowered when the work is large.
export function priorityScore(r) {
  const urgency = Number(r.urgency) || 2;
  const support = Math.log2(1 + (Number(r.support_count) || 0) + (Number(r.linked_count) || 0) * 1.5);
  const cluster = Math.log2(1 + (Number(r.nearby) || 0));
  return Number(((urgency * 2 + support + cluster * 1.5) * (EFFORT_FACTOR[r.effort] || 1)).toFixed(2));
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
    hastesaker_apne: open.filter((r) => Number(r.urgency) >= 4).length,
    raske_gevinster_apne: open.filter((r) => r.quick_win).length,
    trenger_befaring: open.filter((r) => r.needs_site_visit).length,
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

export function kommuneStats(rows) {
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
    hastesaker: rows.filter((r) => isOpen(r) && Number(r.urgency) >= 4).length,
    per_kategori: countBy(rows, (r) => r.category, 8),
    per_tiltak: countBy(rows.filter((r) => r.measure_type), (r) => r.measure_type, 8),
    per_veieier: countBy(rows.filter((r) => r.responsible), (r) => r.responsible, 5),
    per_innsats: countBy(rows.filter((r) => r.effort), (r) => r.effort, 3),
    per_maned: [...months.entries()].map(([maned, antall]) => ({ maned, antall })),
  };
}

export function engagementTop(rows, n = 10) {
  const eng = (r) => (Number(r.support_count) || 0) + (Number(r.linked_count) || 0) * 1.5 + (Number(r.urgency) || 0);
  return [...rows].sort((a, b) => eng(b) - eng(a)).slice(0, n);
}

export function osloDate(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
}
