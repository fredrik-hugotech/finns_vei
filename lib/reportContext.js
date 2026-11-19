import { accidentsNear } from './nvdbAccidents';
import { childrenNear } from './localChildren';
import { sameRoadTraffic, siteNear } from './nvdbSite';
import { crossingAnalysis } from './crossingAnalysis';
import { getPlacesNear, getReportById, getReportContext, getReportExposure, markReportTriageStale, saveReportContext, updateReport } from './supabaseRest';

// Accidents and children around a report, stored in report_accidents. Built
// once per report (and again on request); used on the case page, in the
// queues and in Finn's assessment.
export async function buildReportContext({ id, lat, lng }) {
  const nearFirst = await getPlacesNear(Number(lat), Number(lng)).catch(() => null);
  const [acc, exp, kids, road, near, crossings] = await Promise.all([
    accidentsNear({ lat: Number(lat), lng: Number(lng), radiusM: 100 }),
    getReportExposure([id]).then((r) => r[0] || {}).catch(() => ({})),
    childrenNear({ lat: Number(lat), lng: Number(lng), radiusM: 1000 }).catch(() => ({})),
    siteNear({ lat: Number(lat), lng: Number(lng) }).catch(() => ({})),
    Promise.resolve(nearFirst),
    crossingAnalysis({ lat: Number(lat), lng: Number(lng), near: nearFirst || {} }).catch(() => null),
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
    site: { road, near: near || {}, crossings: crossings || { error: true } },
    crossing_gap_m: crossings?.crossing_gap_m ?? null,
    bus_stops_300m: crossings?.bus_stops_300m ?? null,
    destinations_far_from_crossing: crossings?.far_from_crossing ?? null,
    kindergartens_500m: near?.barnehager_antall ?? null,
    kindergarten_children_500m: near?.barnehagebarn ?? null,
    crossings_100m: road.crossings_100m ?? null,
    nearest_crossing_m: road.nearest_crossing_m ?? null,
    has_sidewalk: road.has_sidewalk ?? null,
    heavy_share: road.heavy_share ?? null,
    fetched_at: new Date().toISOString(),
  };
  await saveReportContext(row);
  if (road?.traffic_by_road) {
    const rep = await getReportById(id, { select: 'id,road_reference,aadt,aadt_before_same_road' }).catch(() => null);
    if (rep) await applySameRoadTraffic(rep, road).catch(() => {});
  }
  return row;
}

// The case's ÅDT must be from the road it is on. The first lookup could take
// a neighbouring road's count up to 350 m away; this corrects it (null when
// the road has no count within 150 m) and keeps the old number. Returns true
// when the number changed.
export async function applySameRoadTraffic(report, road) {
  if (!road || !Array.isArray(road.traffic_by_road)) return false;
  const t = sameRoadTraffic(report.road_reference, road);
  const next = t && Number.isFinite(Number(t.aadt)) ? Math.round(Number(t.aadt)) : null;
  const prev = report.aadt == null ? null : Number(report.aadt);
  const patch = { aadt_checked_at: new Date().toISOString() };
  if (next !== prev) {
    patch.aadt = next;
    if (report.aadt_before_same_road == null && prev != null) patch.aadt_before_same_road = prev;
  }
  await updateReport(report.id, patch);
  return next !== prev;
}

// Fetches only the road data again (NVDB) for a case that already has its
// context; the rest (accidents, children, places, crossings) is kept. When
// the traffic or sidewalk facts change, Finn's assessment is redone.
export async function refreshSiteRoad({ id, lat, lng, road_reference: roadRef, aadt, aadt_before_same_road: before }) {
  const have = await getReportContext(id);
  if (!have) return null;
  const road = await siteNear({ lat: Number(lat), lng: Number(lng) });
  if (!road || road.has_sidewalk == null) throw new Error('NVDB svarte ikke');
  const report = roadRef !== undefined ? { id, road_reference: roadRef, aadt, aadt_before_same_road: before }
    : await getReportById(id, { select: 'id,road_reference,aadt,aadt_before_same_road' });
  const trafficChanged = report ? await applySameRoadTraffic(report, road) : false;
  const sidewalkChanged = have.has_sidewalk != null && have.has_sidewalk !== road.has_sidewalk;
  if (trafficChanged || sidewalkChanged) await markReportTriageStale(id).catch(() => {});
  await saveReportContext({
    report_id: id,
    site: { ...(have.site || {}), road },
    crossings_100m: road.crossings_100m ?? null,
    nearest_crossing_m: road.nearest_crossing_m ?? null,
    has_sidewalk: road.has_sidewalk,
    heavy_share: road.heavy_share ?? null,
  });
  return road;
}

export async function ensureReportContext(report) {
  const have = await getReportContext(report.id).catch(() => null);
  if (have && have.barn_6_15_1km != null && have.site?.crossings) return have;
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
  if (road.has_sidewalk != null) roadBits.push(road.has_sidewalk ? 'fortau innen 30 m' : 'fortau ikke registrert innen 30 m (NVDB er ikke komplett)');
  if (road.has_cycleway) roadBits.push('gang- og sykkelveg innen 30 m');
  if (road.crossings_100m != null) roadBits.push(road.crossings_100m ? `${road.crossings_100m} gangfelt innen 100 m (nærmeste ${road.nearest_crossing_m} m)` : (road.crossing_in_network_30m ? 'gangfelt i vegnettet like ved' : 'ingen registrerte gangfelt innen 100 m'));
  if (road.speed_bumps_150m) roadBits.push(`${road.speed_bumps_150m} fartsdempere innen 150 m`);
  if (road.lights_50m != null) roadBits.push(road.lights_50m ? `${road.lights_50m} lyspunkter innen 50 m` : 'ingen registrerte lyspunkter innen 50 m');
  const cx = ctx?.site?.crossings;
  if (cx && !cx.error && cx.road_ref !== undefined) {
    const parts = [];
    if (cx.road_ref) parts.push(`vegen er ${cx.road_ref}`);
    parts.push(cx.crossings_on_road ? `${cx.crossings_on_road} gangfelt på vegen innen 500 m` : 'ingen gangfelt på vegen innen 500 m');
    if (cx.crossing_gap_m != null) parts.push(`${cx.crossing_gap_m} m mellom gangfeltene rundt stedet (${cx.crossing_behind_m} m den ene veien, ${cx.crossing_ahead_m} m den andre)`);
    if (cx.bus_stops_300m) parts.push(`${cx.bus_stops_300m} bussholdeplasser innen 300 m`);
    out.push(`Kryssing: ${parts.join(', ')}.`);
    if (cx.flags?.length) out.push(`Kryssingsfunn: ${cx.flags.join(' ')}`);
  }
  if (roadBits.length) out.push(`Vegen (NVDB; på kommunale veger mangler ofte gangfelt og lys i registeret): ${roadBits.join(', ')}.`);
  return out;
}
