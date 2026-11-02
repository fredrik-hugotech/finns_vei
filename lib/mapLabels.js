// Mapbox styles label places with their English name where one exists
// ("University of Agder", "Norway"). Swap every label to the local name so
// maps read in Norwegian. Best-effort: call after the style has loaded.
export function applyLocalLabelNames(map) {
  if (!map) return;
  let layers = [];
  try { layers = map.getStyle()?.layers || []; } catch (_e) { return; }
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;
    try {
      const field = map.getLayoutProperty(layer.id, 'text-field');
      if (!field) continue;
      const json = JSON.stringify(field);
      if (!json.includes('name_en')) continue;
      map.setLayoutProperty(layer.id, 'text-field', JSON.parse(json.replace(/"name_en"/g, '"name"')));
    } catch (_e) { /* skip this layer */ }
  }
}
