import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { DEFAULT_CENTER, REPORT_STATUS } from '../lib/config';
import { MAP_COLORS, MAP_STYLE } from '../lib/mapStyleConfig';
import { REPORT_CATEGORY_ICON_IDS, reportCategoryIconId } from '../lib/reportCategoryIcons';
import { REPORT_STATUS_META, REPORT_STATUS_ORDER, reportStatusMeta } from '../lib/reportStatusMeta';
import { normalizeImageEntries } from '../lib/reportImages';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const ICON = {
  info: '<svg class="popup-glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.16"/><path d="M12 11v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.2" fill="currentColor"/></svg>',
  support: '<svg class="popup-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.45-1.32C5.4 14.36 2 11.28 2 7.5 2 5.42 3.64 3.8 5.75 3.8c1.18 0 2.31.55 3.05 1.42L12 8.4l3.2-3.18A4.13 4.13 0 0 1 18.25 3.8C20.36 3.8 22 5.42 22 7.5c0 3.78-3.4 6.86-8.55 11.49z" fill="currentColor"/></svg>',
  check: '<svg class="popup-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4 4 10-11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  accident: '<svg class="popup-glyph popup-glyph--accident" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l9.2 16.5H2.8z" fill="currentColor" opacity="0.16"/><path d="M12 3.5l9.2 16.5H2.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.15" fill="currentColor"/></svg>',
};

function supportCountLabel(count = 0) {
  const value = Number(count) || 0;
  if (value <= 0) return 'Bli den første som støtter';
  if (value === 1) return '1 person støtter saken';
  return `${value} støtter saken`;
}

function statusPillHtml(status) {
  const meta = reportStatusMeta(status);
  return `<span class="status-pill status-pill--${meta.key}">${meta.icon}<span>${escapeHtml(meta.label)}</span></span>`;
}

function supportButtonInner(alreadySupported) {
  return alreadySupported
    ? `${ICON.check}<span>Du har støttet</span>`
    : `${ICON.support}<span>Støtt denne saken</span>`;
}

const NEARBY_RADIUS_M = 20;

function distanceMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bboxAround([lng, lat], meters) {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((value) => value.toFixed(6)).join(',');
}

function countNearbyReports(data, center, radiusM) {
  const features = data?.features || [];
  let count = 0;
  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    if (Array.isArray(coords) && distanceMeters(center, coords) <= radiusM) count += 1;
  }
  return count;
}

async function fetchAccidentsNear(center, radiusM) {
  const bbox = bboxAround(center, Math.max(radiusM * 3, 90));
  const response = await fetch(`/api/nvdb/layer?type=accidents&bbox=${encodeURIComponent(bbox)}&zoom=17`);
  if (!response.ok) throw new Error('Kunne ikke hente ulykker');
  const geojson = await response.json();
  if (geojson?.meta?.degraded) throw new Error('Ulykkesdata utilgjengelig');
  return (geojson.features || [])
    .filter((feature) => feature.geometry?.type === 'Point' && Array.isArray(feature.geometry.coordinates))
    .map((feature) => ({
      dist: distanceMeters(center, feature.geometry.coordinates),
      year: feature.properties?.year || (feature.properties?.date ? String(feature.properties.date).slice(0, 4) : ''),
      type: feature.properties?.accident_type || '',
      severity: feature.properties?.severity || '',
    }))
    .filter((accident) => accident.dist <= radiusM)
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
}

function accidentSummaryHtml(accidents) {
  if (!accidents.length) return '<span class="insight-muted">Ingen registrerte</span>';
  const items = accidents.slice(0, 6).map((accident) => {
    const label = [accident.year, accident.type || 'Ulykke'].filter(Boolean).join(' · ');
    const severity = accident.severity ? ` <span class="insight-sub">${escapeHtml(accident.severity)}</span>` : '';
    return `<li>${escapeHtml(label)}${severity}</li>`;
  }).join('');
  const more = accidents.length > 6 ? `<li class="insight-muted">+${accidents.length - 6} flere</li>` : '';
  return `<strong>${accidents.length}</strong><ul class="accident-list">${items}${more}</ul>`;
}

function fillAccidentSummary(popup, center, radiusM) {
  const target = () => popup.getElement()?.querySelector('[data-accidents]');
  fetchAccidentsNear(center, radiusM)
    .then((accidents) => {
      const node = target();
      if (node) node.innerHTML = accidentSummaryHtml(accidents);
    })
    .catch(() => {
      const node = target();
      if (node) node.innerHTML = '<span class="insight-muted">Utilgjengelig nå</span>';
    });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function compactText(value = '', maxLength = 140) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function browserHasSupported(reportId) {
  if (typeof window === 'undefined' || !reportId) return false;
  return window.localStorage.getItem(`finns-vei-supported-${reportId}`) === '1';
}

function reportIdFromFeature(featureOrProperties = {}) {
  const properties = featureOrProperties.properties || featureOrProperties || {};
  return properties.id
    || properties.report_id
    || properties.reportId
    || properties.uuid
    || featureOrProperties.id
    || '';
}

function shouldShowMissingReportIdDebug() {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';
}


function reportImagesHtml(properties = {}) {
  const images = normalizeImageEntries(properties.image_urls || properties.image_urls_json);
  if (!images.length) return '';
  return `
    <div class="report-popup-images popup-images">
      ${images.slice(0, 3).map((image, index) => `
        <a href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer">
          <img src="${escapeHtml(image.url)}" alt="Bilde ${index + 1} fra innmelding" loading="lazy" />
        </a>
      `).join('')}
    </div>
  `;
}

function reportInsightHtml(properties, { nearbyCount, radiusM }) {
  const roadOwner = properties.road_owner || properties.road_authority || '';
  const roadAuthority = properties.road_authority || '';
  const rows = [];
  if (roadOwner) {
    const sub = roadAuthority && roadAuthority !== roadOwner ? ` <span class="insight-sub">(${escapeHtml(roadAuthority)})</span>` : '';
    rows.push(`<div class="insight-row"><dt>Veieier</dt><dd>${escapeHtml(roadOwner)}${sub}</dd></div>`);
  }
  rows.push(`<div class="insight-row"><dt>Saker innen ${radiusM} m</dt><dd>${nearbyCount}</dd></div>`);
  rows.push(`<div class="insight-row insight-row--accidents"><dt>Ulykker innen ${radiusM} m</dt><dd data-accidents><span class="insight-muted">Henter …</span></dd></div>`);
  return `<section class="popup-insight"><dl>${rows.join('')}</dl></section>`;
}

function popupHtml(featureOrProperties = {}, context = { nearbyCount: 1, radiusM: NEARBY_RADIUS_M }) {
  const properties = featureOrProperties.properties || featureOrProperties || {};
  const rawReportId = reportIdFromFeature(featureOrProperties);
  const reportId = escapeHtml(rawReportId);
  const supportCount = Number(properties.support_count || 0);
  const alreadySupported = browserHasSupported(rawReportId);
  const category = properties.category || 'Melding';
  const categoryIcon = reportCategoryIconId(category);
  const note = properties.public_status_note;
  const updatedAt = properties.public_status_updated_at;
  const missingReportIdDebug = !reportId && shouldShowMissingReportIdDebug()
    ? '<small class="support-debug">Mangler reportId for støtteknapp.</small>'
    : '';
  return `
    <article class="report-popup popup-card">
      <header class="popup-head">
        <img class="popup-head__icon" src="/map-icons/${categoryIcon}.svg" alt="" aria-hidden="true" />
        <strong>${escapeHtml(category)}</strong>
      </header>
      ${statusPillHtml(properties.status || REPORT_STATUS.NEW)}
      ${reportInsightHtml(properties, context)}
      ${properties.description ? `<p class="popup-desc">${escapeHtml(compactText(properties.description))}</p>` : ''}
      ${note ? `
        <div class="popup-update">
          <p class="popup-update__label">${ICON.info}<span>Oppdatering fra Finns.Fairway</span></p>
          <p class="popup-update__text">${escapeHtml(compactText(note, 220))}</p>
          ${updatedAt ? `<small>Oppdatert ${escapeHtml(new Date(updatedAt).toLocaleDateString('no-NO'))}</small>` : ''}
        </div>` : ''}
      ${reportImagesHtml(properties)}
      <div class="popup-actions">
        ${reportId
          ? `<button class="support-button${alreadySupported ? ' support-button--done' : ''}" data-report-id="${reportId}" type="button" ${alreadySupported ? 'disabled' : ''}>${supportButtonInner(alreadySupported)}</button>`
          : missingReportIdDebug}
        <small class="support-count" data-support-count-for="${reportId}">${supportCountLabel(supportCount)}</small>
      </div>
    </article>
  `;
}

function accidentPopupHtml(properties = {}) {
  const rows = [
    properties.date ? ['Dato', properties.date] : null,
    properties.year ? ['År', properties.year] : null,
    properties.severity ? ['Alvorlighet', properties.severity] : null,
    properties.accident_type ? ['Type', properties.accident_type] : null,
  ].filter(Boolean);

  return `
    <article class="accident-popup popup-card popup-card--accident">
      <header class="popup-head">
        ${ICON.accident}
        <strong>Trafikkulykke</strong>
      </header>
      ${rows.length ? `<dl class="popup-rows">
        ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>` : ''}
      <small>Kilde: ${escapeHtml(properties.source || 'NVDB')}</small>
    </article>
  `;
}

const MIN_ACCIDENT_FETCH_ZOOM = 12;
const ACCIDENT_HEATMAP_MAX_ZOOM = 15;
const ACCIDENT_POINT_MIN_ZOOM = 15;
const NVDB_LAYERS = [
  { type: 'accidents', label: 'Ulykker', color: MAP_COLORS.accidentLayer },
];

const ACCIDENT_LAYER_IDS = ['accident-heatmap', 'accident-points', 'accident-point-symbol'];
const REPORT_LAYER_IDS = ['reports-clusters', 'reports-cluster-count', 'reports-circle', 'reports-category-symbol', 'reports-support-badge'];

function moveLayersToTop(map, layerIds) {
  layerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) map.moveLayer(layerId);
  });
}

function restoreMapLayerOrder(map) {
  moveLayersToTop(map, ACCIDENT_LAYER_IDS);
  moveLayersToTop(map, REPORT_LAYER_IDS);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image(32, 32);
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Kunne ikke laste kartikon: ${src}`));
    image.src = src;
  });
}

async function loadReportCategoryIcons(map) {
  const results = await Promise.allSettled(REPORT_CATEGORY_ICON_IDS.map(async (iconId) => {
    if (map.hasImage(iconId)) return iconId;
    const image = await loadImageElement(`/map-icons/${iconId}.svg`);
    if (!map.hasImage(iconId)) map.addImage(iconId, image, { pixelRatio: 2 });
    return iconId;
  }));

  const loaded = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.warn(result.reason));

  return loaded;
}

async function ensureReportCategorySymbolLayer(map) {
  if (!map.getSource('reports') || map.getLayer('reports-category-symbol')) return;

  try {
    const loadedIcons = await loadReportCategoryIcons(map);
    if (!loadedIcons.length || map.getLayer('reports-category-symbol')) return;

    map.addLayer({
      id: 'reports-category-symbol',
      type: 'symbol',
      source: 'reports',
      filter: ['!', ['has', 'point_count']],
      layout: MAP_STYLE.reportCategorySymbolLayout,
      paint: MAP_STYLE.reportCategorySymbolPaint,
    }, map.getLayer('reports-support-badge') ? 'reports-support-badge' : undefined);

    restoreMapLayerOrder(map);
  } catch (error) {
    console.warn('Kategoriikoner kunne ikke lastes. Sirkelmarkører brukes som fallback.', error);
  }
}

export default function ReportMap({ selectable = false, point, onPointChange, className = 'map-canvas', showReports = true, enableNvdbLayers = false, pickMode = false, pinnedPoint = null, onMapReady }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pinnedMarkerRef = useRef(null);
  const onMapReadyRef = useRef(onMapReady);
  const pointRef = useRef(point);
  const activeNvdbLayersRef = useRef([]);
  const reportsDataRef = useRef({ type: 'FeatureCollection', features: [] });
  const [message, setMessage] = useState('');
  const [activeNvdbLayers, setActiveNvdbLayers] = useState([]);
  const [legendOpen, setLegendOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 720 : false));
  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  useEffect(() => {
    pointRef.current = point;
  }, [point]);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (!pinnedPoint) {
      pinnedMarkerRef.current?.remove();
      pinnedMarkerRef.current = null;
      return undefined;
    }
    const lngLat = [pinnedPoint.lng, pinnedPoint.lat];
    if (!pinnedMarkerRef.current) {
      pinnedMarkerRef.current = new mapboxgl.Marker({ color: '#0b5d4d' }).setLngLat(lngLat).addTo(map);
    } else {
      pinnedMarkerRef.current.setLngLat(lngLat);
    }
    return undefined;
  }, [pinnedPoint]);

  useEffect(() => {
    activeNvdbLayersRef.current = activeNvdbLayers;
    const map = mapRef.current;
    if (map) {
      NVDB_LAYERS.forEach((layer) => {
        const layerIds = layer.type === 'accidents'
          ? ACCIDENT_LAYER_IDS
          : [`nvdb-${layer.type}-line`, `nvdb-${layer.type}-point`, `nvdb-${layer.type}-fill`];
        layerIds.forEach((layerId) => {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', activeNvdbLayers.includes(layer.type) ? 'visible' : 'none');
          }
        });
      });
    }
  }, [activeNvdbLayers]);

  const placeMarker = useCallback((nextPoint) => {
    const map = mapRef.current;
    if (!map || !nextPoint) return;

    const lngLat = [nextPoint.lng, nextPoint.lat];
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: MAP_STYLE.selectableMarker.color, draggable: selectable })
        .setLngLat(lngLat)
        .addTo(map);

      if (selectable) {
        markerRef.current.on('dragend', () => {
          const next = markerRef.current.getLngLat();
          onPointChange?.({ lng: next.lng, lat: next.lat });
        });
      }
    } else {
      markerRef.current.setLngLat(lngLat);
    }
  }, [onPointChange, selectable]);


  const refreshNvdbLayers = useCallback(async () => {
    const map = mapRef.current;
    const activeLayers = activeNvdbLayersRef.current;
    if (!map || !enableNvdbLayers || activeLayers.length === 0) return;

    if (activeLayers.includes('accidents') && map.getZoom() < MIN_ACCIDENT_FETCH_ZOOM) {
      setMessage('Zoom inn');
      const source = map.getSource('accident-source');
      if (source) source.setData({ type: 'FeatureCollection', features: [], meta: { reason: 'zoom_too_low' } });
      return;
    }

    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
      .map((value) => value.toFixed(6))
      .join(',');

    await Promise.all(activeLayers.map(async (layerType) => {
      const layerConfig = NVDB_LAYERS.find((layer) => layer.type === layerType);
      if (!layerConfig) return;

      const response = await fetch(`/api/nvdb/layer?type=${encodeURIComponent(layerType)}&bbox=${encodeURIComponent(bbox)}&zoom=${map.getZoom().toFixed(2)}`);
      if (!response.ok) throw new Error(`Kunne ikke hente ${layerConfig.label}`);
      const geojson = await response.json();
      const featureCount = geojson.meta?.featureCount ?? geojson.features?.length ?? 0;
      const rawObjectCount = Number(geojson.meta?.rawObjectCount ?? 0);
      const pointFeatureCount = Number(geojson.meta?.pointFeatureCount ?? featureCount);
      const invalidGeometryCount = Number(geojson.meta?.invalidGeometryCount ?? 0);
      if (geojson.meta?.degraded) {
        setMessage('Ulykker utilgjengelig');
      } else if (geojson.meta?.reason === 'zoom_too_low' || geojson.meta?.reason === 'bbox_too_broad') {
        setMessage('Zoom inn');
      } else if (layerType === 'accidents' && rawObjectCount > 0 && pointFeatureCount === 0) {
        const geometryDebug = shouldShowMissingReportIdDebug() && invalidGeometryCount > 0 ? ' (geometri kunne ikke tolkes)' : '';
        setMessage(`Ulykker: 0${geometryDebug}`);
      } else if (layerType === 'accidents') {
        const geometryDebug = shouldShowMissingReportIdDebug() && invalidGeometryCount > 0 ? ` (${invalidGeometryCount} geometri kunne ikke tolkes)` : '';
        if (pointFeatureCount > 0 && map.getZoom() < ACCIDENT_POINT_MIN_ZOOM) {
          setMessage(`Varmekart${geometryDebug}`);
        } else {
          setMessage(pointFeatureCount > 0 ? `Ulykker: ${pointFeatureCount}${geometryDebug}` : 'Ingen ulykker');
        }
      } else {
        setMessage(`NVDB-lag lastet: ${featureCount} objekter`);
      }
      const sourceId = layerType === 'accidents' ? 'accident-source' : `nvdb-${layerType}`;

      const source = map.getSource(sourceId);
      if (source) {
        source.setData(geojson);
        const layerIds = layerType === 'accidents'
          ? ACCIDENT_LAYER_IDS
          : ['line', 'point', 'fill'].map((shape) => `${sourceId}-${shape}`);
        layerIds.forEach((layerId) => {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'visible');
        });
        if (layerType === 'accidents') restoreMapLayerOrder(map);
        return;
      }

      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson,
        cluster: false,
      });

      if (layerType === 'accidents') {
        map.addLayer({
          id: 'accident-heatmap',
          type: 'heatmap',
          source: sourceId,
          minzoom: MIN_ACCIDENT_FETCH_ZOOM,
          maxzoom: ACCIDENT_HEATMAP_MAX_ZOOM,
          paint: MAP_STYLE.accidentHeatmapPaint,
        });
        map.addLayer({
          id: 'accident-points',
          type: 'circle',
          source: sourceId,
          minzoom: ACCIDENT_POINT_MIN_ZOOM,
          filter: ['match', ['geometry-type'], ['Point'], true, false],
          paint: MAP_STYLE.accidentPointPaint,
        });
        map.addLayer({
          id: 'accident-point-symbol',
          type: 'symbol',
          source: sourceId,
          minzoom: ACCIDENT_POINT_MIN_ZOOM,
          filter: ['match', ['geometry-type'], ['Point'], true, false],
          layout: MAP_STYLE.accidentSymbolLayout,
          paint: MAP_STYLE.accidentSymbolPaint,
        });

        restoreMapLayerOrder(map);

        const showAccidentPopup = (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          new mapboxgl.Popup({ maxWidth: '260px' })
            .setLngLat(event.lngLat)
            .setHTML(accidentPopupHtml(feature.properties))
            .addTo(map);
        };
        ['accident-points', 'accident-point-symbol'].forEach((layerId) => {
          map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
          map.on('click', layerId, showAccidentPopup);
        });
        return;
      }

      map.addLayer({
        id: `${sourceId}-fill`,
        type: 'fill',
        source: sourceId,
        filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
        paint: MAP_STYLE.nvdbFillPaint(layerConfig.color),
      });
      map.addLayer({
        id: `${sourceId}-line`,
        type: 'line',
        source: sourceId,
        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        paint: MAP_STYLE.nvdbLinePaint(layerConfig.color),
      });
      map.addLayer({
        id: `${sourceId}-point`,
        type: 'circle',
        source: sourceId,
        filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
        paint: MAP_STYLE.nvdbPointPaint(layerConfig.color),
      });

      map.on('click', `${sourceId}-point`, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        new mapboxgl.Popup({ maxWidth: '280px' })
          .setLngLat(event.lngLat)
          .setHTML(`<strong>${escapeHtml(feature.properties?.label || layerConfig.label)}</strong>`)
          .addTo(map);
      });
    }));
  }, [enableNvdbLayers]);

  const toggleNvdbLayer = (layerType) => {
    setActiveNvdbLayers((current) => (
      current.includes(layerType)
        ? current.filter((type) => type !== layerType)
        : [...current, layerType]
    ));
  };

  const loadReports = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !showReports) return;

    const response = await fetch('/api/reports');
    if (!response.ok) throw new Error('Kunne ikke hente meldinger');
    const geojson = await response.json();

    reportsDataRef.current = geojson;

    const source = map.getSource('reports');
    if (source) {
      source.setData(geojson);
      ensureReportCategorySymbolLayer(map);
      moveLayersToTop(map, REPORT_LAYER_IDS);
      return;
    }

    map.addSource('reports', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: MAP_STYLE.reportClusterSource.clusterMaxZoom,
      clusterRadius: MAP_STYLE.reportClusterSource.clusterRadius,
    });
    map.addLayer({
      id: 'reports-clusters',
      type: 'circle',
      source: 'reports',
      filter: ['has', 'point_count'],
      paint: MAP_STYLE.reportClusterPaint,
    });
    map.addLayer({
      id: 'reports-cluster-count',
      type: 'symbol',
      source: 'reports',
      filter: ['has', 'point_count'],
      layout: MAP_STYLE.reportClusterCountLayout,
      paint: MAP_STYLE.reportClusterCountPaint,
    });
    map.addLayer({
      id: 'reports-circle',
      type: 'circle',
      source: 'reports',
      filter: ['!', ['has', 'point_count']],
      paint: MAP_STYLE.reportPointPaint,
    });

    map.addLayer({
      id: 'reports-support-badge',
      type: 'symbol',
      source: 'reports',
      filter: ['all', ['!', ['has', 'point_count']], ['>', ['coalesce', ['to-number', ['get', 'support_count']], 0], 0]],
      layout: MAP_STYLE.reportSupportBadgeLayout,
      paint: MAP_STYLE.reportSupportBadgePaint,
    });

    moveLayersToTop(map, REPORT_LAYER_IDS);

    map.on('mouseenter', 'reports-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'reports-circle', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'reports-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'reports-clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'reports-clusters', (event) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = map.getSource('reports');
      if (!source || clusterId === undefined) return;
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error) return;
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      });
    });
    map.on('click', 'reports-circle', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      event.originalEvent.cancelBubble = true;
      const center = feature.geometry.coordinates;
      map.easeTo({ center, zoom: Math.max(map.getZoom(), 17), duration: 600 });
      const nearbyCount = countNearbyReports(reportsDataRef.current, center, NEARBY_RADIUS_M);
      const popup = new mapboxgl.Popup({ maxWidth: '300px' })
        .setLngLat(center)
        .setHTML(popupHtml(feature, { nearbyCount, radiusM: NEARBY_RADIUS_M }))
        .addTo(map);
      fillAccidentSummary(popup, center, NEARBY_RADIUS_M);
    });
    ensureReportCategorySymbolLayer(map);
  }, [showReports]);


  const getSupportToken = useCallback(() => {
    const storageKey = 'finns-vei-support-token';
    let token = window.localStorage.getItem(storageKey);
    if (!token) {
      token = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      window.localStorage.setItem(storageKey, token);
    }
    return token;
  }, []);

  useEffect(() => {
    if (!showReports) return undefined;

    const handleSupportClick = async (event) => {
      const button = event.target?.closest?.('.support-button');
      if (!button) return;
      const reportId = button.getAttribute('data-report-id');
      if (!reportId) return;

      const storageKey = `finns-vei-supported-${reportId}`;
      if (window.localStorage.getItem(storageKey)) {
        setMessage('Du har allerede støttet denne saken fra denne nettleseren.');
        return;
      }

      button.disabled = true;
      button.innerHTML = '<span>Sender …</span>';
      try {
        const response = await fetch('/api/report-support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId, supportToken: getSupportToken() }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.code || payload.error || 'Kunne ikke støtte saken');
        window.localStorage.setItem(storageKey, '1');
        button.classList.add('support-button--done');
        button.innerHTML = supportButtonInner(true);
        button.disabled = true;
        document.querySelectorAll(`[data-support-count-for=\"${reportId}\"]`).forEach((node) => {
          node.textContent = supportCountLabel(payload.support_count);
        });
        setMessage(payload.alreadySupported ? 'Du har allerede støttet denne saken.' : 'Takk for støtten!');
        await loadReports();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.classList.remove('support-button--done');
        button.innerHTML = supportButtonInner(false);
        const debugSuffix = shouldShowMissingReportIdDebug() && error?.message ? ` (${error.message})` : '';
        setMessage(`Kunne ikke støtte saken akkurat nå.${debugSuffix}`);
      }
    };

    window.addEventListener('click', handleSupportClick);
    return () => window.removeEventListener('click', handleSupportClick);
  }, [getSupportToken, loadReports, showReports]);

  useEffect(() => {
    if (!containerRef.current || !hasMapboxToken) return undefined;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: pointRef.current ? [pointRef.current.lng, pointRef.current.lat] : DEFAULT_CENTER,
      zoom: selectable ? 13 : 11,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', async () => {
      if (pointRef.current) placeMarker(pointRef.current);
      onMapReadyRef.current?.({
        getCenter: () => {
          const center = map.getCenter();
          return { lng: center.lng, lat: center.lat };
        },
        flyTo: ({ lng, lat }) => map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 700 }),
        refreshReports: () => loadReports().catch((error) => console.error(error)),
      });
      try {
        await loadReports();
        await refreshNvdbLayers();
      } catch (error) {
        console.error(error);
        setMessage('Kartdata kunne ikke hentes.');
      }
    });

    map.on('moveend', () => {
      refreshNvdbLayers().catch((error) => {
        console.error(error);
        setMessage('Lag kunne ikke hentes.');
      });
    });

    if (selectable) {
      map.on('click', (event) => {
        const next = { lng: event.lngLat.lng, lat: event.lngLat.lat };
        onPointChange?.(next);
        placeMarker(next);
      });
    }

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [hasMapboxToken, loadReports, onPointChange, placeMarker, refreshNvdbLayers, selectable]);

  useEffect(() => {
    if (point) placeMarker(point);
  }, [placeMarker, point]);

  useEffect(() => {
    refreshNvdbLayers().catch((error) => {
      console.error(error);
      setMessage('Lag kunne ikke hentes.');
    });
  }, [refreshNvdbLayers]);

  if (!hasMapboxToken) {
    return <div className="map-missing">Mapbox-token mangler.</div>;
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className={className} />
      {pickMode && (
        <div className="map-crosshair" aria-hidden="true">
          <svg className="map-crosshair__pin" viewBox="0 0 40 52">
            <path d="M20 2C11.2 2 4 9 4 17.6 4 28 20 50 20 50s16-22 16-32.4C36 9 28.8 2 20 2z" fill="#0b5d4d" stroke="#ffffff" strokeWidth="2.5" />
            <circle cx="20" cy="17.6" r="5.4" fill="#ffffff" />
          </svg>
          <span className="map-crosshair__dot" />
        </div>
      )}
      {enableNvdbLayers && (
        <div className="layer-control nvdb-toggle-card" aria-label="Kartlag">
          <strong>Kartlag</strong>
          {NVDB_LAYERS.map((layer) => (
            <button
              key={layer.type}
              type="button"
              className={activeNvdbLayers.includes(layer.type) ? 'nvdb-toggle nvdb-toggle--active' : 'nvdb-toggle'}
              onClick={() => toggleNvdbLayer(layer.type)}
            >
              {layer.label}
            </button>
          ))}
        </div>
      )}
      {showReports && (
        <div className={`map-legend${legendOpen ? ' map-legend--open' : ''}`}>
          <button
            type="button"
            className="map-legend__toggle"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((open) => !open)}
          >
            <span className="map-legend__keys" aria-hidden="true">
              {REPORT_STATUS_ORDER.map((status) => (
                <span key={status} className="map-legend__dot" style={{ background: REPORT_STATUS_META[status].marker }} />
              ))}
            </span>
            Tegnforklaring
          </button>
          {legendOpen && (
            <div className="map-legend__panel">
              <p className="map-legend__heading">Status på melding</p>
              <ul className="map-legend__list">
                {REPORT_STATUS_ORDER.map((status) => {
                  const meta = REPORT_STATUS_META[status];
                  return (
                    <li key={status}>
                      <span
                        className="legend-icon"
                        style={{ color: meta.marker }}
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: meta.icon }}
                      />
                      {meta.label}
                    </li>
                  );
                })}
              </ul>
              <p className="map-legend__note">Større markør = flere har støttet saken.</p>
              {enableNvdbLayers && (
                <ul className="map-legend__list">
                  <li>
                    <span
                      className="legend-icon legend-icon--accident"
                      style={{ color: MAP_COLORS.accidentPoint }}
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: ICON.accident }}
                    />
                    Ulykke (NVDB)
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {message && <div className="accident-status map-message">{message}</div>}
    </div>
  );
}
