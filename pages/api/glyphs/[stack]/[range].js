// Map label glyphs for the backup basemap (lib/mapFallback.js), so text on
// our own layers (cluster counts, labels) still renders when Mapbox is down.
// Map styles ask for a comma-separated font stack; serve the first font from
// OpenMapTiles' open font server and let the CDN keep it.
const AVAILABLE = new Set(['Open Sans Bold', 'Open Sans Regular', 'Open Sans Semibold', 'Open Sans Italic']);

export default async function handler(req, res) {
  const stack = String(req.query.stack || '');
  const range = String(req.query.range || '').replace(/\.pbf$/, '');
  if (!/^\d+-\d+$/.test(range)) return res.status(400).end();
  const first = stack.split(',')[0].trim();
  const font = AVAILABLE.has(first) ? first : (/bold/i.test(first) ? 'Open Sans Bold' : 'Open Sans Regular');
  try {
    const upstream = await fetch(`https://fonts.openmaptiles.org/${encodeURIComponent(font)}/${range}.pbf`);
    if (!upstream.ok) return res.status(502).end();
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    return res.status(200).send(buf);
  } catch (_e) {
    return res.status(502).end();
  }
}
