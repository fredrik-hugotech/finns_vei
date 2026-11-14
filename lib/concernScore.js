import { splitReportText } from './reportText';
import {
  CONCERN_HEATMAP_DEFAULT_WEIGHTS,
  CONCERN_HEATMAP_DEFAULT_OTHER_WEIGHT,
  CONCERN_HEATMAP_DEFAULT_SUPPORT_BOOST_FACTOR,
  CONCERN_HEATMAP_SUPPORT_BOOST_CAP,
} from './mapStyleConfig';

function parseFacets(value) {
  if (Array.isArray(value)) return value;
  try { const v = JSON.parse(value || '[]'); return Array.isArray(v) ? v : []; } catch (_e) { return []; }
}

// "Bekymringsgrad" for one report. Most reports pick several concerns
// ("Farlig skolevei" + "Høy fart" + "Utrygt kryss"), and most share the same
// main category, so weighting only the main category flattened the map.
// Score = the most serious concern among all of them (main, extra, and those
// added by supporters), plus a little for every further concern, multiplied
// by citizen support (capped so one viral case can't drown out a region).
export function concernScore(properties, {
  weights = CONCERN_HEATMAP_DEFAULT_WEIGHTS,
  otherWeight = CONCERN_HEATMAP_DEFAULT_OTHER_WEIGHT,
  supportBoost = CONCERN_HEATMAP_DEFAULT_SUPPORT_BOOST_FACTOR,
} = {}) {
  const p = properties || {};
  const cats = new Set();
  if (p.category) cats.add(p.category);
  splitReportText(p.description).categories.forEach((c) => cats.add(c));
  parseFacets(p.facets_json).forEach((f) => { if (f?.category) cats.add(f.category); });
  const weightOf = (c) => {
    const w = Number(weights?.[c]);
    return Number.isFinite(w) ? w : Number(otherWeight) || 1;
  };
  const list = Array.from(cats);
  const severity = list.length ? Math.max(...list.map(weightOf)) : Number(otherWeight) || 1;
  const breadth = 0.2 * Math.min(4, Math.max(0, list.length - 1));
  const support = Math.min(Number(p.support_count) || 0, CONCERN_HEATMAP_SUPPORT_BOOST_CAP);
  const boost = 1 + (Number(supportBoost) || 0) * support;
  return Number(((severity + breadth) * boost).toFixed(3));
}

// The report collection with a numeric `concern` on every feature, ready for
// the heatmap layer (which reads ['get', 'concern']).
export function withConcernScores(geojson, options) {
  const features = (geojson?.features || []).map((f) => ({
    ...f,
    properties: { ...(f.properties || {}), concern: concernScore(f.properties, options) },
  }));
  return { type: 'FeatureCollection', features };
}
