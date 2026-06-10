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

export default function ReportMap({ selectable = false, point, onPointChange, className = 'map-canvas', showReports = true }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pointRef = useRef(point);
  const [message, setMessage] = useState('');
  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  useEffect(() => {
    pointRef.current = point;
  }, [point]);

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
      } catch (error) {
        console.error(error);
        setMessage('Kartet åpnet, men meldinger kunne ikke hentes akkurat nå.');
      }
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
  }, [hasMapboxToken, loadReports, onPointChange, placeMarker, selectable]);

  useEffect(() => {
    if (point) placeMarker(point);
  }, [placeMarker, point]);

  if (!hasMapboxToken) {
    return <div className="map-missing">Mapbox-token mangler.</div>;
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className={className} />
      {message && <div className="map-message">{message}</div>}
    </div>
  );
}
