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


export const MAP_STYLE = {
  selectableMarker: {
    color: MAP_COLORS.nvdbStroke,
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
  threeDBuildingsPaint: {
    'fill-extrusion-color': '#cbd5e1',
    'fill-extrusion-height': ['coalesce', ['get', 'height'], 0],
    'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
    'fill-extrusion-opacity': 0.42,
  },
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
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 8.5, 14, 10, 16, 12.5],
    'circle-color': REPORT_STATUS_COLOR_MATCH,
    'circle-opacity': 0.98,
    'circle-stroke-color': MAP_COLORS.white,
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 2.4, 16, 3.2],
  },
  selectedReportRadiusFillPaint: {
    'fill-color': '#475569',
    'fill-opacity': 0.07,
  },
  selectedReportRadiusLinePaint: {
    'line-color': '#334155',
    'line-opacity': 0.32,
    'line-width': 1.5,
  },
  selectedReportRingPaint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 14, 16, 19],
    'circle-color': 'rgba(255,255,255,0)',
    'circle-stroke-color': '#111827',
    'circle-stroke-opacity': 0.85,
    'circle-stroke-width': 3,
  },
  reportCategorySymbolLayout: {
    'icon-image': 'report-alert',
    'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.72, 16, 0.9],
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
  reportCategorySymbolPaint: {
    'icon-opacity': 0.95,
  },
  reportSupportBadgeLayout: {
    'text-field': ['concat', '+', ['to-string', ['get', 'support_count']]],
    'text-size': 10.5,
    'text-offset': [1.25, -1.25],
    'text-anchor': 'center',
    'text-allow-overlap': true,
  },
  reportSupportBadgePaint: {
    'text-color': MAP_COLORS.supportBadge,
    'text-halo-color': MAP_COLORS.white,
    'text-halo-width': 2,
  },
};
