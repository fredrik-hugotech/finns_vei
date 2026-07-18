// Pure helpers for the "Rett myndighet"-henvisning (correct-authority referral)
// feature: given a report's NVDB-enriched road fields, work out whether the
// municipality is even the right recipient of a case, and if not, prepare a
// draft referral to the authority that actually owns the road.
//
// road_category holds NVDB's raw `vegkategori` letter code (see
// `roadDataFromPosition` in lib/nvdb.js): E = Europaveg, R = Riksveg,
// F = Fylkesveg, K = Kommunal veg, P = Privat veg, S = Skogsbilveg.
// road_owner/road_authority hold either the NVDB `vegforvalter` name (a real
// manager, which may itself be "Statens vegvesen", a fylkeskommune, etc.) or,
// when no manager is listed, the same category inferred as free text via
// `inferRoadAuthority` in lib/nvdb.js ("Statens vegvesen" | "Fylkeskommune" |
// "Kommune" | "Privat" | "Skogsbilveg"). This module intentionally does not
// import lib/nvdb.js (server-only NVDB client code) and instead keeps its own
// small, client-safe copy of the category → authority mapping so it stays a
// pure, side-effect-free module that is safe to bundle into the backoffice
// page.
//
// Deliberately conservative: we only ever name two responsible parties —
// "Statens vegvesen" (riksveg/europaveg) and the generic "fylkeskommunen"
// (fylkesveg) — because those are the only families we can identify with
// confidence from NVDB data without fabricating a specific county name or a
// contact database. Private roads/skogsbilveger and anything we can't
// classify are treated as "not actionable" so the UI stays quiet rather than
// guessing at who is responsible.

const STATE_AUTHORITY_NAME = 'Statens vegvesen';
const COUNTY_AUTHORITY_NAME = 'fylkeskommunen';

function normalizeCategory(value) {
  const c = String(value || '').trim().toUpperCase();
  return c || null;
}

function categoryLabel(category) {
  switch (category) {
    case 'E': return 'Europaveg';
    case 'R': return 'Riksveg';
    case 'F': return 'Fylkesveg';
    case 'K': return 'Kommunal veg';
    case 'P': return 'Privat veg';
    case 'S': return 'Skogsbilveg';
    default: return null;
  }
}

// Free-text fallback for when road_category is missing/unrecognized but
// road_owner/road_authority carries a manager name we can still read (e.g.
// "Statens vegvesen" or "<Fylke> fylkeskommune"). Case-insensitive and
// deliberately loose since these are free-text NVDB fields, not an enum.
function classifyFromText(ownerText) {
  const t = String(ownerText || '').toLowerCase();
  if (!t) return null;
  if (t.includes('vegvesen')) return 'state';
  if (t.includes('fylkeskommune') || t.includes('fylkesveg') || t.includes('fylkesvei')) return 'county';
  // "kommune" alone (not "fylkeskommune", already matched above) means the
  // municipality itself is the manager — municipal, nothing to refer.
  if (t.includes('kommune')) return 'municipal';
  return null;
}

/**
 * Classify a report's road data to determine whether the municipality is
 * actually the right recipient, and if not, who is.
 *
 * @param {{road_owner?: string|null, road_authority?: string|null, road_category?: string|null}} report
 * @returns {{
 *   isNonMunicipal: boolean,
 *   showReferral: boolean,
 *   authorityType: 'state'|'county'|null,
 *   authorityName: string|null,
 *   roadCategoryLabel: string|null,
 *   explanation: string|null,
 * }}
 */
export function classifyRoadAuthority(report = {}) {
  const category = normalizeCategory(report?.road_category);
  const label = categoryLabel(category);
  const ownerText = report?.road_owner || report?.road_authority || '';

  let kind = null; // 'state' | 'county' | 'municipal' | 'private' | null (unknown)

  if (category === 'E' || category === 'R') kind = 'state';
  else if (category === 'F') kind = 'county';
  else if (category === 'K') kind = 'municipal';
  else if (category === 'P' || category === 'S') kind = 'private';
  else kind = classifyFromText(ownerText); // category missing/unrecognized

  if (kind === 'state') {
    // Only append the parenthetical NVDB label when it says more than the
    // road word alone (it's redundant for known categories, e.g. it would
    // otherwise read "Dette er en riksveg (riksveg).").
    const roadWord = category === 'E' ? 'europaveg' : (category === 'R' ? 'riksveg' : 'riks- eller europaveg');
    const labelSuffix = label && label.toLowerCase() !== roadWord ? ` (${label.toLowerCase()})` : '';
    return {
      isNonMunicipal: true,
      showReferral: true,
      authorityType: 'state',
      authorityName: STATE_AUTHORITY_NAME,
      roadCategoryLabel: label,
      explanation: `Dette er en ${roadWord}${labelSuffix}. Ansvaret for drift og vedlikehold ligger hos Statens vegvesen, ikke kommunen.`,
    };
  }

  if (kind === 'county') {
    return {
      isNonMunicipal: true,
      showReferral: true,
      authorityType: 'county',
      authorityName: COUNTY_AUTHORITY_NAME,
      roadCategoryLabel: label || 'Fylkesveg',
      explanation: 'Dette er en fylkesveg. Ansvaret for drift og vedlikehold ligger hos fylkeskommunen, ikke kommunen.',
    };
  }

  // Municipal, private/skogsbilveg, or genuinely unknown/not-yet-enriched:
  // nothing actionable to surface, keep the UI quiet.
  return {
    isNonMunicipal: kind === 'private',
    showReferral: false,
    authorityType: null,
    authorityName: null,
    roadCategoryLabel: label,
    explanation: null,
  };
}

function truncate(text, maxLen) {
  const s = String(text || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trim()}…`;
}

/**
 * Build a plain-text referral draft (used both for the mailto: link body and
 * the copy-to-clipboard fallback) for a non-municipal case. Pure formatting —
 * does not send anything.
 *
 * @param {{
 *   caseId: string,
 *   caseUrl?: string|null,
 *   category?: string|null,
 *   description?: string|null,
 *   lat?: number|null,
 *   lng?: number|null,
 *   roadReference?: string|null,
 * }} report
 * @param {ReturnType<typeof classifyRoadAuthority>} classification
 */
export function buildReferralDraft(report = {}, classification) {
  const authorityName = classification?.authorityName || 'rette myndighet';
  const hasCoords = Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lng));

  const subject = `Trafikksikkerhetsmelding videresendes – ${report.category || 'sak'} (${authorityName})`;

  const lines = [
    `Hei,`,
    ``,
    `Vi har mottatt en trafikksikkerhetsmelding fra en innbygger som gjelder en veg som ${classification?.authorityType === 'state' ? 'Statens vegvesen' : 'fylkeskommunen'} har ansvar for, ikke kommunen. Vi ber om at dere ser på saken.`,
    ``,
    `Kategori: ${report.category || 'Ukjent'}`,
    `Sak-ID: ${report.caseId || ''}`,
    report.caseUrl ? `Lenke til saken: ${report.caseUrl}` : null,
    report.roadReference ? `Vegreferanse: ${report.roadReference}` : null,
    hasCoords ? `Posisjon: ${Number(report.lat).toFixed(6)}, ${Number(report.lng).toFixed(6)}` : null,
    ``,
    `Beskrivelse fra melder:`,
    truncate(report.description, 600) || '(ingen beskrivelse oppgitt)',
    ``,
    classification?.explanation || '',
    ``,
    `Mvh`,
  ].filter((line) => line !== null);

  const body = lines.join('\n');
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailto };
}
