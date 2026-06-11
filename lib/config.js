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
  'Utrygt kryss',
  'Dårlig sikt',
  'Mangler fortau',
  'Høy fart',
  'Farlig for sykkel',
  'Annet',
];

export const STATUS_COLORS = {
  [REPORT_STATUS.NEW]: '#F4C542',
  [REPORT_STATUS.REGISTERED]: '#F59E0B',
  [REPORT_STATUS.STARTED]: '#2F6F9F',
  [REPORT_STATUS.DONE]: '#2F7D4F',
};

export const DEFAULT_CENTER = [7.9956, 58.1467];
