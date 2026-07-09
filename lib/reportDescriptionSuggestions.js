// Short, natural-language suggestion phrases per report category. Shown as
// tappable chips above the description textarea so reporters (including
// children reporting anonymously) can build a description without having to
// type freely. Keep phrases short, concrete, and in a citizen's own voice —
// not corporate-sounding.
export const REPORT_DESCRIPTION_SUGGESTIONS = {
  'Farlig skolevei': [
    'Ingen fortau',
    'Biler kjører fort her',
    'Vanskelig å se når jeg krysser',
    'Mørkt om vinteren',
    'Mange biler i rushtiden',
  ],
  'Utrygt kryss': [
    'Vanskelig å se biler',
    'Ingen fotgjengerfelt',
    'Kort tid på grønt lys',
    'Biler svinger uten å se seg for',
    'Dårlig sikt i krysset',
  ],
  'Dårlig sikt': [
    'Sving med dårlig sikt',
    'Busker og trær skjuler veien',
    'Dårlig belysning',
    'Vanskelig å se gående i mørket',
  ],
  'Mangler fortau': [
    'Må gå i veibanen',
    'Smal veiskulder',
    'Farlig når det møter biler',
    'Ingen gangfelt langs veien',
  ],
  'Høy fart': [
    'Biler kjører fort her',
    'Ingen fartsdumper',
    'Rett strekning som frister til høy fart',
    'Føles utrygt å krysse',
  ],
  'Farlig for sykkel': [
    'Ingen sykkelfelt',
    'Trangt mellom biler og syklister',
    'Glatt/dårlig veidekke',
    'Biler kjører for nærme',
  ],
  Annet: [
    'Føles utrygt her',
    'Dårlig belysning',
    'Mye trafikk',
    'Glatt underlag',
  ],
};

// Fallback phrases for categories that aren't in the lookup above (e.g. if
// REPORT_CATEGORIES gains a new value the suggestions haven't caught up to
// yet). Mirrors the 'Annet' list.
const FALLBACK_SUGGESTIONS = REPORT_DESCRIPTION_SUGGESTIONS.Annet;

export function descriptionSuggestions(category) {
  return REPORT_DESCRIPTION_SUGGESTIONS[category] || FALLBACK_SUGGESTIONS;
}
