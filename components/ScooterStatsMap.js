import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { DEFAULT_CENTER } from '../lib/config';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const SEQ = '#0b5d4d'; // one hue, magnitude by size and opacity

const asCells = (cells) => ({
  type: 'FeatureCollection',
  features: (cells || []).map(([lng, lat, n]) => ({ type: 'Feature', properties: { n }, geometry: { type: 'Point', coordinates: [lng, lat] } })),
});
const asPlaces = (places) => ({
  type: 'FeatureCollection',
  features: (places || []).map((p) => ({ type: 'Feature', properties: { name: p.name, type: p.type, arrivals: p.arrivals || 0 }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
});

// Where e-scooter rides start or end (~150 m cells), with sports venues
// (filled) and schools (ring) on top. Admin-only, aggregated data.
export default function ScooterStatsMap({ cells, places }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef({ cells, places });
  dataRef.current = { cells, places };

  useEffect(() => {
    if (!containerRef.current || !mapboxgl.accessToken) return undefined;
    const map = new mapboxgl.Map({ container: containerRef.current, style: 'mapbox://styles/mapbox/light-v11', center: DEFAULT_CENTER, zoom: 11.6, attributionControl: false });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      map.addSource('cells', { type: 'geojson', data: asCells(dataRef.current.cells) });
      map.addLayer({
        id: 'cells',
        type: 'circle',
        source: 'cells',
        paint: {
          'circle-color': SEQ,
          'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 4, 3, 9, 6, 16, 10, 24],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'n'], 1, 0.28, 10, 0.55, 40, 0.8],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });
      map.addSource('places', { type: 'geojson', data: asPlaces(dataRef.current.places) });
      map.addLayer({
        id: 'places',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-radius': 5,
          'circle-color': ['case', ['==', ['get', 'type'], 'skole'], '#ffffff', '#16201c'],
          'circle-stroke-color': '#16201c',
          'circle-stroke-width': 2,
        },
      });
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '240px' });
      const show = (e, html) => { map.getCanvas().style.cursor = 'pointer'; popup.setLngLat(e.features[0].geometry.coordinates).setHTML(html).addTo(map); };
      const hide = () => { map.getCanvas().style.cursor = ''; popup.remove(); };
      map.on('mousemove', 'cells', (e) => { const n = e.features[0].properties.n; show(e, `<strong>${n}</strong> ${n === 1 ? 'tur' : 'turer'} her`); });
      map.on('mouseleave', 'cells', hide);
      map.on('mousemove', 'places', (e) => {
        const p = e.features[0].properties;
        const name = String(p.name).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        show(e, `<strong>${name}</strong><br>${p.arrivals} ankomster innen 150 m`);
      });
      map.on('mouseleave', 'places', hide);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.getSource('cells')?.setData(asCells(cells));
      map.getSource('places')?.setData(asPlaces(places));
    };
    if (map.isStyleLoaded() && map.getSource('cells')) apply(); else map.once('idle', apply);
  }, [cells, places]);

  if (!mapboxgl.accessToken) return <div className="map-missing">Mapbox-token mangler.</div>;
  return <div ref={containerRef} className="sk-map" />;
}
