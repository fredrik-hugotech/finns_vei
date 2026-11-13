// Backup basemap so the map never goes blank if Mapbox is down, blocks the
// token, or rate-limits us under heavy traffic. Kartverket's open grey topo
// map (CC BY 4.0, free, built for public use) drawn as raster tiles. Our own
// layers (reports, routes) render on top as usual; only Mapbox-hosted
// basemap features (satellite, POI labels) are unavailable while in backup.
export function fallbackStyle() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://finnsvei.no';
  return {
  version: 8,
  glyphs: `${origin}/api/glyphs/{fontstack}/{range}`,
  sources: {
    kartverket: {
      type: 'raster',
      tiles: ['https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png'],
      tileSize: 256,
      maxzoom: 18,
      attribution: '© Kartverket',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f2f2ef' } },
    { id: 'kartverket', type: 'raster', source: 'kartverket' },
  ],
  };
}

const FATAL_STATUSES = new Set([401, 402, 403, 429, 500, 502, 503, 504]);

// Watches a Mapbox map and swaps to the backup style when the Mapbox style
// cannot be loaded: an auth/quota/server error on the style or its tiles, or
// no style at all within `timeoutMs`. Calls onFallback() once after switching.
// initialOnly: only rescue a map that never got its first style (for maps
// whose own layers are added once on load and are not rebuilt on a switch).
export function attachMapFallback(map, { timeoutMs = 9000, onFallback, initialOnly = false } = {}) {
  if (!map) return () => {};
  let switched = false;
  let mapboxErrors = 0;
  const toFallback = (reason) => {
    if (switched) return;
    switched = true;
    try { console.warn('Kart: bytter til reservekart', reason); } catch (_e) { /* */ }
    try { map.setStyle(fallbackStyle()); } catch (_e) { /* */ }
    try { onFallback?.(reason); } catch (_e) { /* */ }
  };
  const timer = setTimeout(() => {
    if (!map.isStyleLoaded || !map.isStyleLoaded()) toFallback('timeout');
  }, timeoutMs);
  const onStyleLoad = () => { clearTimeout(timer); if (initialOnly && !switched) map.off('error', onError); };
  const onError = (event) => {
    if (switched) return;
    const err = event?.error || {};
    const status = Number(err.status);
    const url = String(err.url || '');
    const fromMapbox = !url || /mapbox\.(com|cn)/.test(url);
    if (!fromMapbox) return;
    // The style itself failing is fatal at once; tile errors only after a few.
    const isStyle = /\/styles\//.test(url) && !/\/tiles?\//.test(url);
    if (FATAL_STATUSES.has(status)) {
      mapboxErrors += 1;
      if (isStyle || !map.isStyleLoaded() || mapboxErrors >= 6) toFallback(`status ${status}`);
    }
  };
  map.once('style.load', onStyleLoad);
  map.on('error', onError);
  return () => { clearTimeout(timer); map.off('error', onError); };
}

export function isFallbackStyle(map) {
  try { return Boolean(map?.getSource('kartverket')); } catch (_e) { return false; }
}
