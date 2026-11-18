import { accidentsNear } from './nvdbAccidents';
import { childrenNear } from './localChildren';
import { siteNear } from './nvdbSite';
import { getPlacesNear, getReportContext, getReportExposure, saveReportContext } from './supabaseRest';

// Accidents and children around a report, stored in report_accidents. Built
// once per report (and again on request); used on the case page, in the
// queues and in Finn's assessment.
export async function buildReportContext({ id, lat, lng }) {
  const [acc, exp, kids, road, near] = await Promise.all([
    accidentsNear({ lat: Number(lat), lng: Number(lng), radiusM: 100 }),
    getReportExposure([id]).then((r) => r[0] || {}).catch(() => ({})),
    childrenNear({ lat: Number(lat), lng: Number(lng), radiusM: 1000 }).catch(() => ({})),
    siteNear({ lat: Number(lat), lng: Number(lng) }).catch(() => ({})),
    getPlacesNear(Number(lat), Number(lng)).catch(() => null),
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
    site: { road, near: near || {} },
    kindergartens_500m: near?.barnehager_antall ?? null,
    kindergarten_children_500m: near?.barnehagebarn ?? null,
    crossings_100m: road.crossings_100m ?? null,
    nearest_crossing_m: road.nearest_crossing_m ?? null,
    has_sidewalk: road.has_sidewalk ?? null,
    heavy_share: road.heavy_share ?? null,
    fetched_at: new Date().toISOString(),
  };
  await saveReportContext(row);
  return row;
}

export async function ensureReportContext(report) {
  const have = await getReportContext(report.id).catch(() => null);
  if (have && have.barn_6_15_1km != null && have.site) return have;
  if (!Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lng))) return null;
  return buildReportContext(report);
}

// Lines for Finn's prompts.
export function exposureLines(report, ctx) {
  const out = [];
  if (report?.aadt) out.push(`ÅDT (biler per døgn i snitt): ${report.aadt}`);
  if (ctx?.nearest_school) out.push(`Nærmeste skole: ${ctx.nearest_school}, ${ctx.nearest_school_m} m unna. Elever ved skoler innen 1 km: ${ctx.students_1km || 0}.`);
  if (ctx?.barn_6_15_1km != null) out.push(`Barn som bor innen 1 km (SSB, anslag): ca. ${ctx.barn_6_15_1km} i alderen 6–15 år, ca. ${ctx.barn_0_19_1km} i alderen 0–19 år${ctx.grunnkrets_navn ? `. Grunnkretsen «${ctx.grunnkrets_navn}» har ${ctx.barn_6_15_grunnkrets} barn 6–15 år` : ''}.`);
  const near = ctx?.site?.near || {};
  const road = ctx?.site?.road || {};
  if (near.skoler?.length) out.push(`Skoler innen 1 km: ${near.skoler.slice(0, 4).map((x) => `${x.navn} (${x.elever ?? '?'} elever, ${x.m} m)`).join('; ')}.`);
  if (near.barnehager?.length) out.push(`Barnehager innen 500 m: ${near.barnehager_antall} med til sammen ${near.barnehagebarn} barn (nærmeste ${near.barnehager[0].navn}, ${near.barnehager[0].m} m).`);
  if (near.anlegg?.length) out.push(`Idrettsanlegg innen 500 m: ${near.anlegg.slice(0, 4).map((x) => `${x.navn} (${x.m} m)`).join('; ')}.`);
  else if (ctx?.venues_500m) out.push(`Idrettsanlegg innen 500 m: ${ctx.venues_500m}`);
  const roadBits = [];
  if (road.heavy_share != null) roadBits.push(`${road.heavy_share} % lange/tunge kjøretøy`);
  if (road.has_sidewalk != null) roadBits.push(road.has_sidewalk ? 'fortau innen 30 m' : 'ikke fortau innen 30 m');
  if (road.has_cycleway) roadBits.push('gang- og sykkelveg innen 30 m');
  if (road.crossings_100m != null) roadBits.push(road.crossings_100m ? `${road.crossings_100m} gangfelt innen 100 m (nærmeste ${road.nearest_crossing_m} m)` : (road.crossing_in_network_30m ? 'gangfelt i vegnettet like ved' : 'ingen registrerte gangfelt innen 100 m'));
  if (road.speed_bumps_150m) roadBits.push(`${road.speed_bumps_150m} fartsdempere innen 150 m`);
  if (road.lights_50m != null) roadBits.push(road.lights_50m ? `${road.lights_50m} lyspunkter innen 50 m` : 'ingen registrerte lyspunkter innen 50 m');
  if (roadBits.length) out.push(`Vegen (NVDB; på kommunale veger mangler ofte gangfelt og lys i registeret): ${roadBits.join(', ')}.`);
  return out;
}
