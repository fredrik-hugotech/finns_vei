// Classifies the free-text NVDB "alvorlighetsgrad/skadegrad" accident
// severity string into a small fixed set of buckets, purely for display
// (colour + sort order) in the public Skolevei-sjekk corridor summary.
// Mirrors the equivalent classification lib/nvdb.js already does
// server-side for the internal admin accident summary (`normalizeSeverity`
// in lib/nvdb.js) — kept as a separate, dependency-free copy here so this
// page never has to import the large, server-only lib/nvdb.js module.

export const ACCIDENT_SEVERITY_ORDER = ['fatal', 'serious', 'minor', 'unknown'];

export const ACCIDENT_SEVERITY_META = {
  fatal: { label: 'Dødsulykke', shortLabel: 'Dødsulykke' },
  serious: { label: 'Alvorlig skade', shortLabel: 'Alvorlig' },
  minor: { label: 'Lettere skade', shortLabel: 'Lettere skadd' },
  unknown: { label: 'Ukjent alvorlighetsgrad', shortLabel: 'Ukjent alvorlighet' },
};

export function normalizeAccidentSeverity(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('drept') || text.includes('død') || text.includes('fatal')) return 'fatal';
  if (text.includes('meget alvor') || text.includes('alvor')) return 'serious';
  if (text.includes('lettere') || text.includes('lett') || text.includes('minor')) return 'minor';
  return 'unknown';
}
