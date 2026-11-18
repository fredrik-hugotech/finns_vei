// The fixed main categories. Finn picks one per report; «Utrygt punkt» when
// it's unclear. `phrase` is used in the receipt: «Takk for at du meldte fra om
// {phrase} …». The citizen's own category and tags stay as extra tags.
export const MAIN_CATEGORIES = [
  { label: 'Farlig kryss', phrase: 'et farlig kryss' },
  { label: 'Utrygt gangfelt', phrase: 'et utrygt gangfelt' },
  { label: 'Høy fart', phrase: 'høy fart' },
  { label: 'Dårlig sikt', phrase: 'dårlig sikt' },
  { label: 'Manglende belysning', phrase: 'manglende belysning' },
  { label: 'Manglende fortau', phrase: 'manglende fortau' },
  { label: 'Utrygg skolevei', phrase: 'en utrygg skolevei' },
  { label: 'Utrygt punkt', phrase: 'et utrygt punkt' },
];
export const MAIN_CATEGORY_LABELS = MAIN_CATEGORIES.map((c) => c.label);
export const FALLBACK_CATEGORY = 'Utrygt punkt';

export function categoryPhrase(label) {
  return MAIN_CATEGORIES.find((c) => c.label === label)?.phrase || 'et utrygt punkt';
}

// What staff see as the case's title: the main category when set.
export function caseCategory(report) {
  return report?.main_category || report?.category || 'Melding';
}
