import { REPORT_STATUS } from './config';

export const MAP_COLORS = {
  reportNew: '#F4C542',
  reportRegistered: '#F59E0B',
  reportStarted: '#2F6F9F',
  reportDone: '#2F7D4F',
  reportFallback: '#6b7280',
  reportClusterLow: '#F4C542',
  reportClusterMedium: '#F59E0B',
  reportClusterHigh: '#C84A3A',
  reportClusterText: '#111111',
  supportBadge: '#7f1d1d',
  accidentLayer: '#dc2626',
  accidentPoint: '#581c87',
  accidentPointText: '#ffffff',
  nvdbStroke: '#111827',
  white: '#ffffff',
};

export const REPORT_STATUS_COLOR_MATCH = [
  'match',
  ['get', 'status'],
  REPORT_STATUS.NEW, MAP_COLORS.reportNew,
  REPORT_STATUS.REGISTERED, MAP_COLORS.reportRegistered,
  REPORT_STATUS.STARTED, MAP_COLORS.reportStarted,
  REPORT_STATUS.DONE, MAP_COLORS.reportDone,
  MAP_COLORS.reportFallback,
];

export const MAP_STYLE = {
  selectableMarker: {
    color: MAP_COLORS.nvdbStroke,
  },
  accidentHeatmapPaint: {
    'heatmap-weight': [
      'match',
      ['downcase', ['to-string', ['coalesce', ['get', 'severity'], 'unknown']]],
      ['fatal', 'død', 'drept', 'dødsulykke'], 2,
      ['serious', 'alvorlig', 'meget alvorlig'], 1.5,
      1,
    ],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 12, 0.35, 13.5, 0.95, 14.8, 1.65],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 12, 14, 14, 24, 15, 30],
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.45, 14, 0.68, 14.8, 0.38, 15, 0],
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0, 'rgba(88,28,135,0)',
      0.18, 'rgba(221,214,254,0.18)',
      0.4, '#8b5cf6',
      0.65, '#f97316',
      0.82, '#991b1b',
      1, '#1f0508',
    ],
  },
  accidentPointPaint: {
    'circle-radius': 6,
    'circle-color': MAP_COLORS.accidentPoint,
    'circle-opacity': 0.95,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': 1.5,
  },
  accidentSymbolLayout: {
    'text-field': '!',
    'text-size': 10,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  accidentSymbolPaint: {
    'text-color': MAP_COLORS.accidentPointText,
  },
  nvdbFillPaint: (color) => ({
    'fill-color': color,
    'fill-opacity': 0.22,
  }),
  nvdbLinePaint: (color) => ({
    'line-color': color,
    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 15, 8],
    'line-opacity': 0.9,
  }),
  nvdbPointPaint: (color) => ({
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 7, 15, 12],
    'circle-color': color,
    'circle-opacity': 0.95,
    'circle-stroke-color': MAP_COLORS.nvdbStroke,
    'circle-stroke-width': 2,
  }),
  reportClusterSource: {
    clusterMaxZoom: 14,
    clusterRadius: 48,
  },
  reportClusterPaint: {
    'circle-color': ['step', ['get', 'point_count'], MAP_COLORS.reportClusterLow, 2, MAP_COLORS.reportClusterMedium, 5, MAP_COLORS.reportClusterHigh],
    'circle-radius': ['step', ['get', 'point_count'], 14, 2, 19, 5, 26],
    'circle-opacity': 0.9,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': 2,
  },
  reportClusterCountLayout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-size': 12,
  },
  reportClusterCountPaint: {
    'text-color': MAP_COLORS.reportClusterText,
    'text-halo-color': MAP_COLORS.white,
    'text-halo-width': 1,
  },
  reportPointPaint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5.5, 15, 10],
    'circle-color': REPORT_STATUS_COLOR_MATCH,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': 2,
    'circle-opacity': 0.95,
  },
  reportSupportBadgeLayout: {
    'text-field': ['concat', '❤️ ', ['to-string', ['get', 'support_count']]],
    'text-size': 10,
    'text-offset': [1.05, -1.05],
    'text-anchor': 'center',
    'text-allow-overlap': true,
  },
  reportSupportBadgePaint: {
    'text-color': MAP_COLORS.supportBadge,
    'text-halo-color': MAP_COLORS.white,
    'text-halo-width': 2,
  },
};
