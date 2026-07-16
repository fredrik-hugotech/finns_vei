// Classifies the free-text NVDB "alvorlighetsgrad/skadegrad" accident
// severity string into a small fixed set of buckets, purely for display in
// the public "Din vei" corridor summary — shown only on the rare accident
// where NVDB actually supplies a severity value (most don't). Mirrors the
// equivalent classification lib/nvdb.js already does server-side for the
// internal admin accident summary (`normalizeSeverity` in lib/nvdb.js) —
// kept as a separate, dependency-free copy here so this page never has to
// import the large, server-only lib/nvdb.js module.

export function normalizeAccidentSeverity(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('drept') || text.includes('død') || text.includes('fatal')) return 'fatal';
  if (text.includes('meget alvor') || text.includes('alvor')) return 'serious';
  if (text.includes('lettere') || text.includes('lett') || text.includes('minor')) return 'minor';
  return 'unknown';
}
