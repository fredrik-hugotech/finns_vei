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

// Statens vegvesen's official general-inquiry address (their public "Kontakt
// oss" postbox) — a real, stable, publicly documented address, not a
// fabricated one. Safe to pre-fill as the mailto recipient for riksveg/
// europaveg cases since it's a genuine correspondence channel for exactly
// this kind of request. There is no equivalent single address for
// fylkeskommunen (each county runs its own), so that case is deliberately
// left without a pre-filled recipient rather than guessing one.
const STATE_AUTHORITY_EMAIL = 'firmapost@vegvesen.no';

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
 *   authorityEmail: string|null,
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
      authorityEmail: STATE_AUTHORITY_EMAIL,
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
      authorityEmail: null,
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
    authorityEmail: null,
    roadCategoryLabel: label,
    explanation: null,
  };
}

function truncate(text, maxLen) {
  const s = String(text || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trim()}…`;
}

// Singular/plural-safe count phrase, e.g. "1 innbygger" / "3 innbyggere".
function countPhrase(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Build a plain-text referral draft (used both for the mailto: link body and
 * the copy-to-clipboard fallback) for a non-municipal case. Pure formatting —
 * does not send anything. All extra fields below are optional: the draft
 * degrades gracefully to the same minimal letter as before when they're
 * unavailable (e.g. NVDB enrichment still pending, or an unauthenticated
 * staff session with no name on file).
 *
 * @param {{
 *   caseId: string,
 *   caseUrl?: string|null,
 *   category?: string|null,
 *   description?: string|null,
 *   lat?: number|null,
 *   lng?: number|null,
 *   roadReference?: string|null,
 *   place?: string|null,
 *   status?: string|null,
 *   speedLimit?: number|string|null,
 *   supportCount?: number|null,
 *   accidentCount?: number|null,
 *   senderName?: string|null,
 * }} report
 * @param {ReturnType<typeof classifyRoadAuthority>} classification
 */
export function buildReferralDraft(report = {}, classification) {
  const authorityName = classification?.authorityName || 'rette myndighet';
  const hasCoords = Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lng));
  const speedLimit = Number(report.speedLimit);
  const supportCount = Number(report.supportCount);
  const accidentCount = Number(report.accidentCount);

  const subjectParts = [
    'Trafikksikkerhetsmelding',
    report.roadReference || null,
    report.place ? `(${report.place})` : null,
    `– videresendes til ${authorityName}`,
  ].filter(Boolean);
  const subject = subjectParts.join(' ');

  // Concrete facts that make the case easier for the recipient to act on —
  // only included when we actually have them, never guessed.
  const evidence = [
    Number.isFinite(supportCount) && supportCount > 0
      ? `${countPhrase(supportCount, 'innbygger har', 'innbyggere har')} støttet denne meldingen på finnsvei.no.`
      : null,
    Number.isFinite(accidentCount) && accidentCount > 0
      ? `${countPhrase(accidentCount, 'registrert trafikkulykke er', 'registrerte trafikkulykker er')} kjent i nærheten (NVDB).`
      : null,
  ].filter(Boolean);

  const lines = [
    `Hei,`,
    ``,
    `Vi har mottatt en trafikksikkerhetsmelding fra en innbygger som gjelder en veg som ${classification?.authorityType === 'state' ? 'Statens vegvesen' : 'fylkeskommunen'} har ansvar for, ikke kommunen. Vi ber om at dere ser på saken.`,
    ``,
    `Kategori: ${report.category || 'Ukjent'}`,
    report.status ? `Status hos oss: ${report.status}` : null,
    `Sak-ID: ${report.caseId || ''}`,
    report.caseUrl ? `Lenke til saken: ${report.caseUrl}` : null,
    report.place ? `Sted: ${report.place}` : null,
    report.roadReference ? `Vegreferanse: ${report.roadReference}` : null,
    Number.isFinite(speedLimit) && speedLimit > 0 ? `Fartsgrense: ${speedLimit} km/t` : null,
    hasCoords ? `Posisjon: ${Number(report.lat).toFixed(6)}, ${Number(report.lng).toFixed(6)}` : null,
    ``,
    `Beskrivelse fra melder:`,
    truncate(report.description, 600) || '(ingen beskrivelse oppgitt)',
    ``,
    classification?.explanation || '',
    evidence.length ? '' : null,
    ...evidence,
    ``,
    `Med vennlig hilsen`,
    report.senderName ? report.senderName : 'Finns Fairway – trafikksikkerhetsmeldinger',
  ].filter((line) => line !== null);

  const body = lines.join('\n');
  const to = classification?.authorityEmail ? encodeURIComponent(classification.authorityEmail) : '';
  const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailto, to: classification?.authorityEmail || null };
}
