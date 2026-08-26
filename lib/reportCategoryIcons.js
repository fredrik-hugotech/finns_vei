export const REPORT_CATEGORY_ICON_IDS = [
  'speed',
  'crossing',
  'school-road',
  'sidewalk',
  'visibility',
  'bicycle',
  'near-miss',
  'other',
];

export const REPORT_CATEGORY_ICON_MAP = {
  'Høy fart': 'speed',
  'Farlig kryssing': 'crossing',
  'Farlig kryss': 'crossing',
  'Utrygt kryss': 'crossing',
  'Utrygg skolevei': 'school-road',
  'Farlig skolevei': 'school-road',
  'Farlig fritidsvei': 'school-road',
  Fritidsvei: 'school-road', // eldre lagrede saker fra før 2026-08-25-omdøpingen
  'Mangler fortau': 'sidewalk',
  'Dårlig sikt': 'visibility',
  'Utrygg sykkelvei': 'bicycle',
  'Farlig for sykkel': 'bicycle',
  'Farlig treningsvei': 'bicycle',
  Nestenulykke: 'near-miss',
  Annet: 'other',
};

export function reportCategoryIconId(category) {
  return REPORT_CATEGORY_ICON_MAP[category] || 'other';
}

export const REPORT_CATEGORY_ICON_IMAGE_EXPRESSION = [
  'match',
  ['get', 'category'],
  ...Object.entries(REPORT_CATEGORY_ICON_MAP).flatMap(([category, iconId]) => [category, iconId]),
  'other',
];
