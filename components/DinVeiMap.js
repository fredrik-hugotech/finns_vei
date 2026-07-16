import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { DEFAULT_CENTER } from '../lib/config';
import { MAP_COLORS, MAP_STYLE } from '../lib/mapStyleConfig';

// Loaded via next/dynamic with ssr:false from pages/din-vei.js (same
// convention as ReportMap.js) because mapboxgl.accessToken below runs at
// module-import time and touches browser-only globals.
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

const SOURCE = {
  corridor: 'dinvei-corridor',
  line: 'dinvei-line',
  accidents: 'dinvei-accidents',
  reports: 'dinvei-reports',
  points: 'dinvei-points',
};

// `path` is the full array of tapped points (start first, end last once the
// route is finished). Interior points get role 'waypoint' (plain dot, no
// letter) so only the true endpoints are labelled A/B.
function pointsFeatureCollection(path) {
  if (!Array.isArray(path) || path.length === 0) return EMPTY_FC;
  const features = path.map((point, index) => {
    let role = 'waypoint';
    if (index === 0) role = 'start';
    else if (index === path.length - 1 && path.length > 1) role = 'end';
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
      properties: { role },
    };
  });
  return { type: 'FeatureCollection', features };
}

function lineFeatureCollection(path) {
  if (!Array.isArray(path) || path.length < 2) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: path.map((p) => [p.lng, p.lat]) },
      properties: {},
    }],
  };
}

// `rings` is an array of capsule rings, one per route segment (see
// buildRouteCorridorPolygons in lib/corridorGeometry.js) — rendered as
// separate, possibly-overlapping polygon features rather than one unioned
// shape.
function corridorFeatureCollection(rings) {
  if (!Array.isArray(rings) || rings.length === 0) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: rings
      .filter((ring) => ring && ring.length >= 4)
      .map((ring) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} })),
  };
}

export default function DinVeiMap({
  className,
  path,
  corridorRings,
  matchedReportsGeoJson,
  matchedAccidentsGeoJson,
  onMapClick,
  onMapReady,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  // Latest props, read from the 'load' handler and the sync effect alike so
  // neither path works off a stale closure.
  const dataRef = useRef({});
  dataRef.current = { path, corridorRings, matchedReportsGeoJson, matchedAccidentsGeoJson };

  useEffect(() => {
    if (!containerRef.current || !hasMapboxToken) return undefined;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: false,
    }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    function syncData() {
      const { path: currentPath, corridorRings: rings, matchedReportsGeoJson: reports, matchedAccidentsGeoJson: accidents } = dataRef.current;
      map.getSource(SOURCE.corridor)?.setData(corridorFeatureCollection(rings));
      map.getSource(SOURCE.line)?.setData(lineFeatureCollection(currentPath));
      map.getSource(SOURCE.points)?.setData(pointsFeatureCollection(currentPath));
      map.getSource(SOURCE.reports)?.setData(reports || EMPTY_FC);
      map.getSource(SOURCE.accidents)?.setData(accidents || EMPTY_FC);
    }

    map.on('load', () => {
      map.addSource(SOURCE.corridor, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'dinvei-corridor-fill',
        type: 'fill',
        source: SOURCE.corridor,
        paint: { 'fill-color': MAP_COLORS.accidentLayer, 'fill-opacity': 0.14 },
      });
      map.addLayer({
        id: 'dinvei-corridor-outline',
        type: 'line',
        source: SOURCE.corridor,
        paint: { 'line-color': MAP_COLORS.accidentLayer, 'line-width': 1.5, 'line-opacity': 0.55 },
      });

      map.addSource(SOURCE.line, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'dinvei-line',
        type: 'line',
        source: SOURCE.line,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b5d4d', 'line-width': 3, 'line-dasharray': [0.2, 1.6] },
      });

      map.addSource(SOURCE.accidents, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'dinvei-accidents',
        type: 'circle',
        source: SOURCE.accidents,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: MAP_STYLE.accidentPointPaint,
      });

      map.addSource(SOURCE.reports, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'dinvei-reports',
        type: 'circle',
        source: SOURCE.reports,
        paint: {
          'circle-radius': 7.5,
          'circle-color': MAP_COLORS.reportNew,
          'circle-opacity': 0.95,
          'circle-stroke-color': MAP_COLORS.white,
          'circle-stroke-width': 2,
        },
      });

      map.addSource(SOURCE.points, { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'dinvei-points-circle',
        type: 'circle',
        source: SOURCE.points,
        paint: {
          'circle-radius': ['match', ['get', 'role'], 'start', 11, 'end', 11, 5],
          'circle-color': ['match', ['get', 'role'], 'start', '#0b5d4d', 'end', '#B45309', '#0b5d4d'],
          'circle-opacity': ['match', ['get', 'role'], 'waypoint', 0.85, 0.97],
          'circle-stroke-color': MAP_COLORS.white,
          'circle-stroke-width': ['match', ['get', 'role'], 'waypoint', 2, 3],
        },
      });
      map.addLayer({
        id: 'dinvei-points-label',
        type: 'symbol',
        source: SOURCE.points,
        layout: {
          'text-field': ['match', ['get', 'role'], 'start', 'A', 'end', 'B', ''],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': MAP_COLORS.white },
      });

      syncData();

      onMapReady?.({
        fitToPoints: (points) => {
          if (!points || points.length === 0) return;
          if (points.length === 1) {
            map.flyTo({ center: [points[0].lng, points[0].lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
            return;
          }
          const lngs = points.map((p) => p.lng);
          const lats = points.map((p) => p.lat);
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 72, duration: 650, maxZoom: 16 },
          );
        },
        flyTo: ({ lng, lat }) => map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 }),
      });
    });

    map.on('click', (event) => {
      onMapClickRef.current?.({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMapboxToken]);

  // Re-sync whenever the relevant props change, once the style is ready.
  // The 'load' handler above already calls syncData() once for the initial
  // (likely-empty) state; this covers every update after that.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.getSource(SOURCE.corridor)?.setData(corridorFeatureCollection(corridorRings));
    map.getSource(SOURCE.line)?.setData(lineFeatureCollection(path));
    map.getSource(SOURCE.points)?.setData(pointsFeatureCollection(path));
    map.getSource(SOURCE.reports)?.setData(matchedReportsGeoJson || EMPTY_FC);
    map.getSource(SOURCE.accidents)?.setData(matchedAccidentsGeoJson || EMPTY_FC);
  }, [path, corridorRings, matchedReportsGeoJson, matchedAccidentsGeoJson]);

  if (!hasMapboxToken) {
    return <div className={className}><div className="map-missing">Kart mangler Mapbox-nøkkel.</div></div>;
  }

  return <div ref={containerRef} className={className} />;
}
