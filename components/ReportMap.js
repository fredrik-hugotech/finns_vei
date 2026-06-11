import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { DEFAULT_CENTER, REPORT_STATUS } from '../lib/config';
import { MAP_COLORS, MAP_STYLE } from '../lib/mapStyleConfig';
import { normalizeImageEntries } from '../lib/reportImages';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

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

function formatPopupDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('no-NO', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

function publicStatusUpdateHtml(properties = {}) {
  if (!properties.public_status_note) return '';
  const updatedAt = formatPopupDate(properties.public_status_updated_at || properties.status_updated_at);
  return `
    <section class="public-status-update" aria-label="Finns.Fairway">
      <div class="public-status-update__header">Finns.Fairway</div>
      ${updatedAt ? `<div class="public-status-update__date">${escapeHtml(updatedAt)}</div>` : ''}
      <p class="public-status-update__note">${escapeHtml(compactText(properties.public_status_note, 220))}</p>
    </section>
  `;
}

function browserHasSupported(reportId) {
  if (typeof window === 'undefined' || !reportId) return false;
  return window.localStorage.getItem(`finns-vei-supported-${reportId}`) === '1';
}

function supportButtonLabel(reportId) {
  return browserHasSupported(reportId) ? 'Du har støttet denne saken' : 'Støtt denne saken';
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

function reportShareUrl(reportId) {
  if (!reportId || typeof window === 'undefined') return '';
  return `${window.location.origin}/map?report=${encodeURIComponent(reportId)}`;
}


function reportCoordinates(featureOrProperties = {}) {
  const properties = featureOrProperties.properties || featureOrProperties || {};
  const coordinates = featureOrProperties.geometry?.coordinates;
  const lng = Number(Array.isArray(coordinates) ? coordinates[0] : properties.lng ?? properties.longitude);
  const lat = Number(Array.isArray(coordinates) ? coordinates[1] : properties.lat ?? properties.latitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function googleStreetViewUrl(featureOrProperties = {}) {
  const coordinates = reportCoordinates(featureOrProperties);
  if (!coordinates) return '';
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coordinates.lat},${coordinates.lng}`;
}

function selectedReportGeoJson(feature = null) {
  const coordinates = reportCoordinates(feature);
  if (!coordinates) return { type: 'FeatureCollection', features: [] };

  const center = [coordinates.lng, coordinates.lat];
  const radiusMeters = 40;
  const earthRadiusMeters = 6371008.8;
  const latRadians = coordinates.lat * Math.PI / 180;
  const ring = Array.from({ length: 65 }, (_, index) => {
    const bearing = (index / 64) * Math.PI * 2;
    const dx = radiusMeters * Math.cos(bearing);
    const dy = radiusMeters * Math.sin(bearing);
    const lng = coordinates.lng + (dx / (earthRadiusMeters * Math.cos(latRadians))) * (180 / Math.PI);
    const lat = coordinates.lat + (dy / earthRadiusMeters) * (180 / Math.PI);
    return [lng, lat];
  });

  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { kind: 'radius' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: center }, properties: { kind: 'point' } },
    ],
  };
}

// TODO: Later, find nearby reports within 25–50m and show “Flere saker i nærheten”.

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

function popupHtml(featureOrProperties = {}, options = {}) {
  const properties = featureOrProperties.properties || featureOrProperties || {};
  const rawReportId = reportIdFromFeature(featureOrProperties);
  const reportId = escapeHtml(rawReportId);
  const supportCount = Number(properties.support_count || 0);
  const alreadySupported = browserHasSupported(rawReportId);
  const missingReportIdDebug = !reportId && shouldShowMissingReportIdDebug()
    ? '<small class="support-debug">Mangler reportId for støtteknapp.</small>'
    : '';
  const showImages = options.showImages !== false;
  const showPublicStatus = options.showPublicStatus !== false;
  const showNewReportButton = Boolean(options.showNewReportButton);
  const streetViewUrl = googleStreetViewUrl(featureOrProperties);
  return `
    <article class="report-popup popup-card">
      <strong>${escapeHtml(properties.category || 'Melding')}</strong>
      ${properties.description ? `<p>${escapeHtml(compactText(properties.description))}</p>` : ''}
      <p>Status: <strong>${escapeHtml(properties.status || REPORT_STATUS.NEW)}</strong></p>
      ${showPublicStatus ? publicStatusUpdateHtml(properties) : ''}
      <small class="support-count" data-support-count-for="${reportId}">${supportCount} støtter denne saken</small>
      ${reportId ? `<button class="support-button" data-report-id="${reportId}" type="button" ${alreadySupported ? 'disabled' : ''}>${supportButtonLabel(rawReportId)}</button>` : missingReportIdDebug}
      ${reportId ? `<button class="share-button" data-report-id="${reportId}" type="button">Del sak</button>` : ''}
      ${streetViewUrl ? `<a class="street-view-button" href="${escapeHtml(streetViewUrl)}" target="_blank" rel="noopener noreferrer">Se Street View</a>` : ''}
      ${showNewReportButton ? '<button class="continue-report-button" data-close-selected="true" type="button">Meld ny sak likevel</button>' : ''}
      ${showImages ? reportImagesHtml(properties) : ''}
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
      <strong>Ulykke</strong>
      ${rows.map(([label, value]) => `<p><span>${escapeHtml(label)}:</span> ${escapeHtml(value)}</p>`).join('')}
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
const SELECTED_REPORT_SOURCE_ID = 'selected-report';
const SELECTED_REPORT_LAYER_IDS = ['selected-report-radius-fill', 'selected-report-radius-line', 'selected-report-ring'];
const REPORT_LAYER_IDS = ['selected-report-radius-fill', 'selected-report-radius-line', 'reports-clusters', 'reports-cluster-count', 'reports-circle', 'reports-category-symbol', 'selected-report-ring', 'reports-support-badge'];

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

async function loadReportIcon(map) {
  const iconId = 'report-alert';
  if (map.hasImage(iconId)) return true;
  const image = await loadImageElement(`/map-icons/${iconId}.svg`);
  if (!map.hasImage(iconId)) map.addImage(iconId, image, { pixelRatio: 2 });
  return true;
}

async function ensureReportCategorySymbolLayer(map) {
  if (!map.getSource('reports') || map.getLayer('reports-category-symbol')) return;

  try {
    await loadReportIcon(map);
    if (map.getLayer('reports-category-symbol')) return;

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
    console.warn('Rapportikon kunne ikke lastes. Sirkelmarkører brukes som fallback.', error);
  }
}

export default function ReportMap({ selectable = false, point, onPointChange, className = 'map-canvas', showReports = true, enableNvdbLayers = false, reportPopupMode = 'full' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pointRef = useRef(point);
  const activeNvdbLayersRef = useRef([]);
  const focusedReportRef = useRef(false);
  const [message, setMessage] = useState('');
  const [activeNvdbLayers, setActiveNvdbLayers] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  useEffect(() => {
    pointRef.current = point;
  }, [point]);

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

  const popupOptions = useCallback(() => ({
    showImages: reportPopupMode !== 'reporting',
    showPublicStatus: reportPopupMode !== 'reporting',
    showNewReportButton: reportPopupMode === 'reporting',
  }), [reportPopupMode]);

  const clearSelectedReport = useCallback(() => {
    setSelectedReport(null);
  }, []);

  const selectReport = useCallback((feature, { fly = true } = {}) => {
    const map = mapRef.current;
    const coordinates = reportCoordinates(feature);
    if (!map || !feature || !coordinates) return;

    setSelectedReport(feature);
    if (fly) {
      const isMobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;
      map.flyTo({
        center: [coordinates.lng, coordinates.lat],
        zoom: Math.max(map.getZoom(), 15.5),
        offset: isMobile ? [0, -120] : [0, 0],
        duration: 700,
        essential: true,
      });
    }
  }, []);

  const focusSharedReport = useCallback((geojson) => {
    const map = mapRef.current;
    if (!map || selectable || focusedReportRef.current || typeof window === 'undefined') return;
    const reportId = new URLSearchParams(window.location.search).get('report');
    if (!reportId) return;
    const feature = (geojson.features || []).find((item) => String(reportIdFromFeature(item)) === String(reportId));
    if (!feature?.geometry?.coordinates) {
      focusedReportRef.current = true;
      setMessage('Fant ikke saken i kartet.');
      return;
    }

    focusedReportRef.current = true;
    selectReport(feature);
  }, [selectReport, selectable]);

  const loadReports = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !showReports) return;

    const response = await fetch('/api/reports');
    if (!response.ok) throw new Error('Kunne ikke hente meldinger');
    const geojson = await response.json();

    const source = map.getSource('reports');
    if (source) {
      source.setData(geojson);
      ensureReportCategorySymbolLayer(map);
      moveLayersToTop(map, REPORT_LAYER_IDS);
      focusSharedReport(geojson);
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
    const showReportPopup = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      event.originalEvent.cancelBubble = true;
      selectReport(feature);
    };
    ['reports-circle', 'reports-support-badge'].forEach((layerId) => {
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
      map.on('click', layerId, showReportPopup);
    });
    ensureReportCategorySymbolLayer(map);
    focusSharedReport(geojson);
  }, [focusSharedReport, selectReport, showReports]);


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

    const handlePopupCloseClick = (event) => {
      const button = event.target?.closest?.('[data-close-selected]');
      if (!button) return;
      clearSelectedReport();
    };

    const handleShareClick = async (event) => {
      const button = event.target?.closest?.('.share-button');
      if (!button) return;
      const reportId = button.getAttribute('data-report-id');
      const url = reportShareUrl(reportId);
      if (!url) return;

      const shareData = {
        title: 'Finns.Vei – støtt trafikksak',
        text: 'Se og støtt denne trafikksaken på Finns.Vei.',
        url,
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
          setMessage('Deling åpnet');
          return;
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const input = document.createElement('input');
          input.value = url;
          input.setAttribute('readonly', '');
          input.style.position = 'fixed';
          input.style.opacity = '0';
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          input.remove();
        }
        setMessage('Lenke kopiert');
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error(error);
        setMessage('Kunne ikke dele akkurat nå.');
      }
    };

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
      button.textContent = 'Støtter...';
      try {
        const response = await fetch('/api/report-support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId, supportToken: getSupportToken() }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.code || payload.error || 'Kunne ikke støtte saken');
        window.localStorage.setItem(storageKey, '1');
        button.textContent = 'Du har støttet denne saken';
        button.disabled = true;
        document.querySelectorAll(`[data-support-count-for=\"${reportId}\"]`).forEach((node) => {
          node.textContent = `${payload.support_count} støtter denne saken`;
        });
        setSelectedReport((current) => {
          if (!current || String(reportIdFromFeature(current)) !== String(reportId)) return current;
          return {
            ...current,
            properties: {
              ...(current.properties || {}),
              support_count: payload.support_count,
            },
          };
        });
        setMessage(payload.alreadySupported ? 'Du har allerede støttet denne saken.' : 'Takk for støtten!');
        await loadReports();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = 'Støtt denne saken';
        const debugSuffix = shouldShowMissingReportIdDebug() && error?.message ? ` (${error.message})` : '';
        setMessage(`Kunne ikke støtte saken akkurat nå.${debugSuffix}`);
      }
    };

    window.addEventListener('click', handlePopupCloseClick);
    window.addEventListener('click', handleShareClick);
    window.addEventListener('click', handleSupportClick);
    return () => {
      window.removeEventListener('click', handlePopupCloseClick);
      window.removeEventListener('click', handleShareClick);
      window.removeEventListener('click', handleSupportClick);
    };
  }, [clearSelectedReport, getSupportToken, loadReports, showReports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const data = selectedReportGeoJson(selectedReport);
    const source = map.getSource(SELECTED_REPORT_SOURCE_ID);
    if (source) {
      source.setData(data);
      return;
    }

    map.addSource(SELECTED_REPORT_SOURCE_ID, {
      type: 'geojson',
      data,
    });
    map.addLayer({
      id: 'selected-report-radius-fill',
      type: 'fill',
      source: SELECTED_REPORT_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'radius'],
      paint: MAP_STYLE.selectedReportRadiusFillPaint,
    }, map.getLayer('reports-circle') ? 'reports-circle' : undefined);
    map.addLayer({
      id: 'selected-report-radius-line',
      type: 'line',
      source: SELECTED_REPORT_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'radius'],
      paint: MAP_STYLE.selectedReportRadiusLinePaint,
    }, map.getLayer('reports-circle') ? 'reports-circle' : undefined);
    map.addLayer({
      id: 'selected-report-ring',
      type: 'circle',
      source: SELECTED_REPORT_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'point'],
      paint: MAP_STYLE.selectedReportRingPaint,
    }, map.getLayer('reports-support-badge') ? 'reports-support-badge' : undefined);
    restoreMapLayerOrder(map);
  }, [selectedReport]);

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
        const reportLayers = ['reports-circle', 'reports-category-symbol', 'reports-support-badge'].filter((layerId) => map.getLayer(layerId));
        if (reportLayers.length && map.queryRenderedFeatures(event.point, { layers: reportLayers }).length) return;
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
      {enableNvdbLayers && (
        <div className="layer-control nvdb-toggle-card" aria-label="NVDB-lag">
          <strong>Lag</strong>
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
      {selectedReport && (
        <section className="selected-report-sheet" aria-label="Valgt sak">
          <button className="selected-report-close" type="button" aria-label="Lukk sak" onClick={clearSelectedReport}>×</button>
          <div dangerouslySetInnerHTML={{ __html: popupHtml(selectedReport, popupOptions()) }} />
        </section>
      )}
      {message && <div className="accident-status map-message">{message}</div>}
    </div>
  );
}
