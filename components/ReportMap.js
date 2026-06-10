import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { DEFAULT_CENTER, REPORT_STATUS, STATUS_COLORS } from '../lib/config';
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

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('no-NO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function compactText(value = '', maxLength = 170) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
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


function reportImagesHtml(properties = {}) {
  const images = normalizeImageEntries(properties.image_urls || properties.image_urls_json);
  if (!images.length) return '';
  return `
    <div class="popup-images">
      ${images.slice(0, 3).map((image, index) => `
        <a href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer">
          <img src="${escapeHtml(image.url)}" alt="Bilde ${index + 1} fra innmelding" loading="lazy" />
        </a>
      `).join('')}
    </div>
  `;
}

function popupHtml(featureOrProperties = {}) {
  const properties = featureOrProperties.properties || featureOrProperties || {};
  const rawReportId = reportIdFromFeature(featureOrProperties);
  const reportId = escapeHtml(rawReportId);
  const supportCount = Number(properties.support_count || 0);
  const alreadySupported = browserHasSupported(rawReportId);
  const missingReportIdDebug = !reportId && shouldShowMissingReportIdDebug()
    ? '<small class="support-debug">Mangler reportId for støtteknapp.</small>'
    : '';
  return `
    <article class="popup-card">
      <strong>${escapeHtml(properties.category || 'Melding')}</strong>
      ${properties.description ? `<p>${escapeHtml(compactText(properties.description))}</p>` : ''}
      <p>Status: <strong>${escapeHtml(properties.status || REPORT_STATUS.NEW)}</strong></p>
      ${properties.created_at ? `<small>${escapeHtml(formatDate(properties.created_at))}</small>` : ''}
      ${reportImagesHtml(properties)}
      ${reportId ? `<button class="support-button" data-report-id="${reportId}" type="button" ${alreadySupported ? 'disabled' : ''}>${supportButtonLabel(rawReportId)}</button>` : missingReportIdDebug}
      <small class="support-count" data-support-count-for="${reportId}">${supportCount} støtter denne saken</small>
    </article>
  `;
}

function accidentPopupHtml(properties = {}) {
  const rows = [
    properties.date ? ['Dato', properties.date] : null,
    properties.year ? ['År', properties.year] : null,
    properties.severity ? ['Alvorlighet', properties.severity] : null,
    properties.accident_type ? ['Type', properties.accident_type] : null,
    properties.description ? ['Beskrivelse', properties.description] : null,
    properties.road_reference ? ['Vegreferanse', properties.road_reference] : null,
  ].filter(Boolean);

  return `
    <article class="popup-card popup-card--accident">
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
  { type: 'accidents', label: 'Ulykker', color: '#dc2626' },
];
const ACCIDENT_LAYER_IDS = ['accident-heatmap', 'accident-points', 'accident-point-symbol'];
const REPORT_LAYER_IDS = ['reports-clusters', 'reports-cluster-count', 'reports-circle', 'reports-support-badge'];

function moveLayersToTop(map, layerIds) {
  layerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) map.moveLayer(layerId);
  });
}

function restoreMapLayerOrder(map) {
  moveLayersToTop(map, ACCIDENT_LAYER_IDS);
  moveLayersToTop(map, REPORT_LAYER_IDS);
}

export default function ReportMap({ selectable = false, point, onPointChange, className = 'map-canvas', showReports = true, enableNvdbLayers = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pointRef = useRef(point);
  const activeNvdbLayersRef = useRef([]);
  const [message, setMessage] = useState('');
  const [activeNvdbLayers, setActiveNvdbLayers] = useState([]);
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
      markerRef.current = new mapboxgl.Marker({ color: '#111827', draggable: selectable })
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
      setMessage('Zoom inn for ulykker');
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
        setMessage('Zoom inn for ulykker');
      } else if (layerType === 'accidents' && rawObjectCount > 0 && pointFeatureCount === 0) {
        const geometryDebug = shouldShowMissingReportIdDebug() && invalidGeometryCount > 0 ? ' (geometri kunne ikke tolkes)' : '';
        setMessage(`Ulykker: 0 vist${geometryDebug}`);
      } else if (layerType === 'accidents') {
        const geometryDebug = shouldShowMissingReportIdDebug() && invalidGeometryCount > 0 ? ` (${invalidGeometryCount} geometri kunne ikke tolkes)` : '';
        if (pointFeatureCount > 0 && map.getZoom() < ACCIDENT_POINT_MIN_ZOOM) {
          setMessage(`Ulykker: varmekart (${pointFeatureCount})${geometryDebug}`);
        } else {
          setMessage(pointFeatureCount > 0 ? `Ulykker: ${pointFeatureCount}${geometryDebug}` : 'Ingen ulykker her');
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
          paint: {
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
        });
        map.addLayer({
          id: 'accident-points',
          type: 'circle',
          source: sourceId,
          minzoom: ACCIDENT_POINT_MIN_ZOOM,
          filter: ['match', ['geometry-type'], ['Point'], true, false],
          paint: {
            'circle-radius': 6,
            'circle-color': '#581c87',
            'circle-opacity': 0.95,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        });
        map.addLayer({
          id: 'accident-point-symbol',
          type: 'symbol',
          source: sourceId,
          minzoom: ACCIDENT_POINT_MIN_ZOOM,
          filter: ['match', ['geometry-type'], ['Point'], true, false],
          layout: {
            'text-field': '!',
            'text-size': 10,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
          },
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
        paint: {
          'fill-color': layerConfig.color,
          'fill-opacity': 0.22,
        },
      });
      map.addLayer({
        id: `${sourceId}-line`,
        type: 'line',
        source: sourceId,
        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        paint: {
          'line-color': layerConfig.color,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 15, 8],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: `${sourceId}-point`,
        type: 'circle',
        source: sourceId,
        filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 7, 15, 12],
          'circle-color': layerConfig.color,
          'circle-opacity': 0.95,
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 2,
        },
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

    const source = map.getSource('reports');
    if (source) {
      source.setData(geojson);
      moveLayersToTop(map, REPORT_LAYER_IDS);
      return;
    }

    map.addSource('reports', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 48,
    });
    map.addLayer({
      id: 'reports-clusters',
      type: 'circle',
      source: 'reports',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#F4C542', 2, '#F59E0B', 5, '#C84A3A'],
        'circle-radius': ['step', ['get', 'point_count'], 14, 2, 19, 5, 26],
        'circle-opacity': 0.9,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'reports-cluster-count',
      type: 'symbol',
      source: 'reports',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 12,
      },
      paint: { 'text-color': '#111111', 'text-halo-color': '#ffffff', 'text-halo-width': 1 },
    });
    map.addLayer({
      id: 'reports-circle',
      type: 'circle',
      source: 'reports',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5.5, 15, 10],
        'circle-color': [
          'match',
          ['get', 'status'],
          REPORT_STATUS.NEW, STATUS_COLORS[REPORT_STATUS.NEW],
          REPORT_STATUS.REGISTERED, STATUS_COLORS[REPORT_STATUS.REGISTERED],
          REPORT_STATUS.STARTED, STATUS_COLORS[REPORT_STATUS.STARTED],
          REPORT_STATUS.DONE, STATUS_COLORS[REPORT_STATUS.DONE],
          '#6b7280',
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      },
    });

    map.addLayer({
      id: 'reports-support-badge',
      type: 'symbol',
      source: 'reports',
      filter: ['all', ['!', ['has', 'point_count']], ['>', ['coalesce', ['to-number', ['get', 'support_count']], 0], 0]],
      layout: {
        'text-field': ['concat', '❤️ ', ['to-string', ['get', 'support_count']]],
        'text-size': 10,
        'text-offset': [1.05, -1.05],
        'text-anchor': 'center',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#7f1d1d',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
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
      new mapboxgl.Popup({ maxWidth: '280px' })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(popupHtml(feature))
        .addTo(map);
    });
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
      {enableNvdbLayers && (
        <div className="nvdb-toggle-card" aria-label="NVDB-lag">
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
      {message && <div className="map-message">{message}</div>}
    </div>
  );
}
