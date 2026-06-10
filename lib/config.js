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
  'Farlig kryss',
  'Høy fart',
  'Mangler fortau',
  'Dårlig sikt',
  'Dårlig belysning',
  'Farlig skolevei',
  'Farlig treningsvei',
  'Annet',
];

export const STATUS_COLORS = {
  [REPORT_STATUS.NEW]: '#ef4444',
  [REPORT_STATUS.REGISTERED]: '#f59e0b',
  [REPORT_STATUS.STARTED]: '#2563eb',
  [REPORT_STATUS.DONE]: '#16a34a',
};

export const DEFAULT_CENTER = [7.9956, 58.1467];
