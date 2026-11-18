import { accidentsNear } from './nvdbAccidents';
import { childrenNear } from './localChildren';
import { getReportContext, getReportExposure, saveReportContext } from './supabaseRest';

// Accidents and children around a report, stored in report_accidents. Built
// once per report (and again on request); used on the case page, in the
// queues and in Finn's assessment.
export async function buildReportContext({ id, lat, lng }) {
  const [acc, exp, kids] = await Promise.all([
    accidentsNear({ lat: Number(lat), lng: Number(lng), radiusM: 100 }),
    getReportExposure([id]).then((r) => r[0] || {}).catch(() => ({})),
    childrenNear({ lat: Number(lat), lng: Number(lng), radiusM: 1000 }).catch(() => ({})),
  ]);
  const row = {
    report_id: id,
    ...acc,
    nearest_school: exp.nearest_school || null,
    nearest_school_m: exp.nearest_school_m ?? null,
    students_1km: exp.students_1km ?? null,
    schools_1km: exp.schools_1km ?? null,
    venues_500m: exp.venues_500m ?? null,
    grunnkrets_kode: kids.grunnkrets_kode ?? null,
    grunnkrets_navn: kids.grunnkrets_navn ?? null,
    barn_6_15_grunnkrets: kids.barn_6_15_grunnkrets ?? null,
    barn_6_15_1km: kids.barn_6_15_1km ?? null,
    barn_0_19_1km: kids.barn_0_19_1km ?? null,
    fetched_at: new Date().toISOString(),
  };
  await saveReportContext(row);
  return row;
}

export async function ensureReportContext(report) {
  const have = await getReportContext(report.id).catch(() => null);
  if (have && have.barn_6_15_1km !== null && have.barn_6_15_1km !== undefined) return have;
  if (!Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lng))) return null;
  return buildReportContext(report);
}

// Lines for Finn's prompts.
export function exposureLines(report, ctx) {
  const out = [];
  if (report?.aadt) out.push(`ÅDT (biler per døgn i snitt): ${report.aadt}`);
  if (ctx?.nearest_school) out.push(`Nærmeste skole: ${ctx.nearest_school}, ${ctx.nearest_school_m} m unna. Elever ved skoler innen 1 km: ${ctx.students_1km || 0}.`);
  if (ctx?.barn_6_15_1km != null) out.push(`Barn som bor innen 1 km (SSB, anslag): ca. ${ctx.barn_6_15_1km} i alderen 6–15 år, ca. ${ctx.barn_0_19_1km} i alderen 0–19 år${ctx.grunnkrets_navn ? `. Grunnkretsen «${ctx.grunnkrets_navn}» har ${ctx.barn_6_15_grunnkrets} barn 6–15 år` : ''}.`);
  if (ctx?.venues_500m) out.push(`Idrettsanlegg innen 500 m: ${ctx.venues_500m}`);
  return out;
}
