import { REPORT_STATUS } from './config';

export const MAP_COLORS = {
  reportNew: '#F4C542',
  reportRegistered: '#F59E0B',
  reportStarted: '#2563EB',
  reportDone: '#16A34A',
  reportFallback: '#6B7280',
  reportClusterLow: '#F4C542',
  reportClusterMedium: '#F59E0B',
  reportClusterHigh: '#DC2626',
  reportClusterText: '#111827',
  supportBadge: '#7F1D1D',
  accidentLayer: '#6D233F',
  accidentPoint: '#581C87',
  accidentPointText: '#FFFFFF',
  nvdbStroke: '#111827',
  white: '#FFFFFF',
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

const SUPPORT_WEIGHT = ['coalesce', ['to-number', ['get', 'support_count']], 0];

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
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 12, 0.25, 13.5, 0.7, 14.8, 1.1],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 12, 12, 14, 22, 15, 28],
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 14, 0.5, 14.8, 0.25, 15, 0],
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0, 'rgba(88,28,135,0)',
      0.25, 'rgba(88,28,135,0.16)',
      0.55, '#7C2D55',
      0.8, '#991B1B',
      1, '#3B0B1D',
    ],
  },
  accidentPointPaint: {
    'circle-radius': 5.5,
    'circle-color': MAP_COLORS.accidentPoint,
    'circle-opacity': 0.88,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': 1.5,
  },
  accidentSymbolLayout: {
    'text-field': '!',
    'text-size': 9,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  accidentSymbolPaint: {
    'text-color': MAP_COLORS.accidentPointText,
  },
  nvdbFillPaint: (color) => ({
    'fill-color': color,
    'fill-opacity': 0.16,
  }),
  nvdbLinePaint: (color) => ({
    'line-color': color,
    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 15, 7],
    'line-opacity': 0.78,
  }),
  nvdbPointPaint: (color) => ({
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 15, 10],
    'circle-color': color,
    'circle-opacity': 0.88,
    'circle-stroke-color': MAP_COLORS.nvdbStroke,
    'circle-stroke-width': 1.5,
  }),
  reportClusterSource: {
    clusterMaxZoom: 14,
    clusterRadius: 46,
  },
  reportClusterPaint: {
    'circle-color': ['step', ['get', 'point_count'], MAP_COLORS.reportClusterLow, 2, MAP_COLORS.reportClusterMedium, 5, MAP_COLORS.reportClusterHigh],
    'circle-radius': ['step', ['get', 'point_count'], 16, 2, 21, 5, 28],
    'circle-opacity': 0.94,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': 2.5,
  },
  reportClusterCountLayout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-size': 12,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
  },
  reportClusterCountPaint: {
    'text-color': MAP_COLORS.reportClusterText,
    'text-halo-color': MAP_COLORS.white,
    'text-halo-width': 1,
  },
  reportPointPaint: {
    'circle-radius': ['step', SUPPORT_WEIGHT, 7, 1, 8.5, 3, 10, 8, 11.5],
    'circle-color': REPORT_STATUS_COLOR_MATCH,
    'circle-opacity': 0.98,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': ['step', SUPPORT_WEIGHT, 2.25, 1, 2.75, 3, 3.25, 8, 3.75],
  },
  reportSupportBadgeLayout: {
    'text-field': ['concat', '+', ['to-string', ['get', 'support_count']]],
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
