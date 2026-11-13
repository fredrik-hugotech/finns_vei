// Drawn routes are routed leg by leg between the points the user tapped. The
// router starts and ends each leg on the road nearest the tap, so the joined
// line often runs out to a tap point and straight back again — little hooks
// and spikes along the route. removeSpurs() walks the line and unwinds any
// stretch that doubles back on itself, leaving the road the person actually
// travelled. Works on [lng, lat] pairs.
const R = 6371000;
function metersBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat = toRad((a[1] + b[1]) / 2);
  return R * Math.sqrt(dLat * dLat + (dLng * Math.cos(lat)) ** 2);
}

export function removeSpurs(coords, toleranceM = 6) {
  if (!Array.isArray(coords) || coords.length < 3) return Array.isArray(coords) ? coords : [];
  const out = [];
  for (const raw of coords) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const p = [Number(raw[0]), Number(raw[1])];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const last = out[out.length - 1];
    if (last && metersBetween(last, p) < 0.5) continue; // duplicate point
    // Coming back to where we were two steps ago: the last point was the tip
    // of a spur. Drop it, and keep unwinding while the line retraces itself.
    let back = false;
    while (out.length >= 2 && metersBetween(out[out.length - 2], p) <= toleranceM) {
      out.pop();
      back = true;
    }
    if (back && out.length && metersBetween(out[out.length - 1], p) <= toleranceM) continue;
    out.push(p);
  }
  return out;
}
