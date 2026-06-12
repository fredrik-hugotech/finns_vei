import { reportCategoryIconId } from './reportCategoryIcons';

// Clean line icons (currentColor) used in the report sheet category picker.
const GLYPHS = {
  speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 16.5a7.5 7.5 0 1 1 14.4 0"/><path d="M12 16l3.6-4.2"/><circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none"/></svg>',
  crossing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v17M3.5 12h17"/><circle cx="12" cy="12" r="2.3"/></svg>',
  'school-road': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4.6" r="1.9"/><path d="M13 7v5l3 4M13 12l-3 1-2 4.2M13 9l3 1"/></svg>',
  sidewalk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21 9.5 3M17 21 14.5 3"/><path d="M12 6v2m0 3.5v2m0 3.5v2"/></svg>',
  visibility: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  bicycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.8" cy="17" r="3.3"/><circle cx="18.2" cy="17" r="3.3"/><path d="M5.8 17l4.2-7.5h4.6M9 9.5h3l3.2 7.5M14.6 9.5l1.2-2h2"/></svg>',
  'near-miss': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.7 4.2 4.3-1.6-1.6 4.3L21 12l-4.6 2.1 1.6 4.3-4.3-1.6L12 21l-2.1-4.2-4.3 1.6 1.6-4.3L3 12l4.2-2.1L5.6 5.6l4.3 1.6z"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
};

export function categoryGlyph(category) {
  return GLYPHS[reportCategoryIconId(category)] || GLYPHS.other;
}
