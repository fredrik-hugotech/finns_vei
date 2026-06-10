import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { DEFAULT_CENTER, REPORT_STATUS, STATUS_COLORS } from '../lib/config';

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

function popupHtml(properties = {}) {
  return `
    <article class="popup-card">
      <strong>${escapeHtml(properties.status || REPORT_STATUS.NEW)} · ${escapeHtml(properties.category || 'Melding')}</strong>
      <p>${escapeHtml(properties.description || '')}</p>
      ${properties.created_at ? `<small>${escapeHtml(formatDate(properties.created_at))}</small>` : ''}
    </article>
  `;
}

const NVDB_LAYERS = [
  { type: 'speed_limit', label: 'Fartsgrense', color: '#7c3aed' },
  { type: 'gangfelt', label: 'Gangfelt', color: '#0ea5e9' },
  { type: 'aadt', label: 'ÅDT', color: '#f97316' },
];

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
        ['line', 'point', 'fill'].forEach((shape) => {
          const layerId = `nvdb-${layer.type}-${shape}`;
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

    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
      .map((value) => value.toFixed(6))
      .join(',');

    await Promise.all(activeLayers.map(async (layerType) => {
      const layerConfig = NVDB_LAYERS.find((layer) => layer.type === layerType);
      if (!layerConfig) return;

      const response = await fetch(`/api/nvdb/layer?type=${encodeURIComponent(layerType)}&bbox=${encodeURIComponent(bbox)}`);
      if (!response.ok) throw new Error(`Kunne ikke hente ${layerConfig.label}`);
      const geojson = await response.json();
      const featureCount = geojson.meta?.featureCount ?? geojson.features?.length ?? 0;
      if (geojson.meta?.degraded) {
        setMessage('NVDB-lag utilgjengelig');
      } else {
        setMessage(`NVDB-lag lastet: ${featureCount} objekter`);
      }
      const sourceId = `nvdb-${layerType}`;

      const source = map.getSource(sourceId);
      if (source) {
        source.setData(geojson);
        ['line', 'point', 'fill'].forEach((shape) => {
          const layerId = `${sourceId}-${shape}`;
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'visible');
        });
        return;
      }

      map.addSource(sourceId, { type: 'geojson', data: geojson });
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
      return;
    }

    map.addSource('reports', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'reports-circle',
      type: 'circle',
      source: 'reports',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 15, 18],
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
        'circle-stroke-width': 3,
        'circle-opacity': 0.95,
      },
    });

    map.on('mouseenter', 'reports-circle', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'reports-circle', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', 'reports-circle', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      event.originalEvent.cancelBubble = true;
      new mapboxgl.Popup({ maxWidth: '320px' })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(popupHtml(feature.properties))
        .addTo(map);
    });
  }, [showReports]);

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
        setMessage('Kartet åpnet, men meldinger kunne ikke hentes akkurat nå.');
      }
    });

    map.on('moveend', () => {
      refreshNvdbLayers().catch((error) => {
        console.error(error);
        setMessage('NVDB-lag kunne ikke hentes akkurat nå.');
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
      setMessage('NVDB-lag kunne ikke hentes akkurat nå.');
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
          <strong>NVDB-lag</strong>
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
