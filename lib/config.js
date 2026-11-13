export const REPORT_STATUS = {
  NEW: 'Ny',
  REGISTERED: 'Registrert',
  STARTED: 'Startet',
  DONE: 'Fullført',
};

export const REPORTER_TYPES = {
  CHILD: 'barn',
  ADULT: 'voksen',
};

export const REPORT_CATEGORIES = [
  'Farlig skolevei',
  'Fritidsvei',
  'Utrygt kryss',
  'Dårlig sikt',
  'Mangler fortau',
  'Høy fart',
  'Farlig for sykkel',
  'Annet',
];

export const STATUS_COLORS = {
  [REPORT_STATUS.NEW]: '#E4572E',
  [REPORT_STATUS.REGISTERED]: '#2E8B76',
  [REPORT_STATUS.STARTED]: '#0B5D4D',
  [REPORT_STATUS.DONE]: '#8E9A96',
};

export const DEFAULT_CENTER = [7.9956, 58.1467];

// Shared "nearby" radius used both for the case-popup "Saker innen X m" stat
// (ReportMap.js) and for the pick-mode "N meldinger allerede nær dette
// punktet" awareness notice (pages/index.js) — one constant so the two
// surfaces never drift apart.
export const NEARBY_REPORT_RADIUS_M = 20;

// The foundation's "Bli lagkamerat" page: become a monthly donor or give a
// one-off gift.
export const SUPPORT_URL = 'https://finnsfairway.no/wp/bidra/lagkamerat';
