import { REPORT_STATUS } from './config';

export const MAP_COLORS = {
  reportNew: '#F7C948',
  reportRegistered: '#F59E0B',
  reportStarted: '#F97316',
  reportDone: '#6B7F3A',
  reportFallback: '#6F6A5F',
  reportClusterLow: '#F7C948',
  reportClusterMedium: '#F59E0B',
  reportClusterHigh: '#C2410C',
  reportClusterText: '#151515',
  supportBadge: '#201818',
  accidentLayer: '#6D233F',
  accidentPoint: '#5B1F3B',
  accidentPointText: '#FFFFFF',
  nvdbStroke: '#202018',
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
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 12, 0.25, 13.5, 0.72, 14.8, 1.1],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 12, 12, 14, 22, 15, 28],
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.32, 14, 0.52, 14.8, 0.26, 15, 0],
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0, 'rgba(91,31,59,0)',
      0.22, 'rgba(91,31,59,0.14)',
      0.48, '#7C2D55',
      0.72, '#C2410C',
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
    'circle-radius': ['step', ['get', 'point_count'], 15, 2, 20, 5, 28],
    'circle-opacity': 0.92,
    'circle-blur': 0.06,
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
    'circle-radius': [
      '+',
      ['interpolate', ['linear'], ['zoom'], 8, 5.5, 15, 9.5],
      ['step', SUPPORT_WEIGHT, 0, 1, 1.2, 3, 2.2, 8, 3.4],
    ],
    'circle-color': REPORT_STATUS_COLOR_MATCH,
    'circle-opacity': 0.96,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': ['step', SUPPORT_WEIGHT, 2, 1, 2.4, 3, 2.8, 8, 3.2],
  },
  reportSupportBadgeLayout: {
    'text-field': ['concat', '+', ['to-string', ['get', 'support_count']]],
    'text-size': ['step', SUPPORT_WEIGHT, 0, 1, 9, 3, 10],
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
