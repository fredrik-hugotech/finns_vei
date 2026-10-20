import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Validated categorical pair (dataviz reference palette, slots 1–2).
export const KIND_COLOR = { anlegg: '#2a78d6', skole: '#eb6834' };
const NORWAY = [[4.5, 57.9], [31.2, 71.2]];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function asGeojson(places) {
  return {
    type: 'FeatureCollection',
    features: (places || []).map((p) => ({
      type: 'Feature',
      properties: { name: p.name, kind: p.kind, kommune: p.kommuneNavn || '', arrivals: p.arrivals, departures: p.departures, total: p.arrivals + p.departures },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
}

// Schools (orange) and sports venues (blue) sized by e-scooter traffic
// within 150 m. Admin-only, aggregated counts.
export default function ScooterStatsMap({ places, focusKey }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const placesRef = useRef(places);
  placesRef.current = places;

  const fit = (map, list) => {
    if (!list?.length) { map.fitBounds(NORWAY, { padding: 20, duration: 0 }); return; }
    const b = new mapboxgl.LngLatBounds();
    list.slice(0, 60).forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: 50, maxZoom: 14, duration: 600 });
  };

  useEffect(() => {
    if (!containerRef.current || !mapboxgl.accessToken) return undefined;
    const map = new mapboxgl.Map({ container: containerRef.current, style: 'mapbox://styles/mapbox/light-v11', bounds: NORWAY, attributionControl: false });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      map.addSource('places', { type: 'geojson', data: asGeojson(placesRef.current) });
      map.addLayer({
        id: 'places',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-color': ['match', ['get', 'kind'], 'skole', KIND_COLOR.skole, KIND_COLOR.anlegg],
          'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 1, 4, 5, 9, 10, 15, 20, 24],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' });
      map.on('mousemove', 'places', (e) => {
        const p = e.features[0].properties;
        map.getCanvas().style.cursor = 'pointer';
        popup.setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<strong>${esc(p.name)}</strong><br>${esc(p.kommune)}<br>${p.arrivals} ankomster · ${p.departures} leid herfra`)
          .addTo(map);
      });
      map.on('mouseleave', 'places', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      fit(map, placesRef.current);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => { map.getSource('places')?.setData(asGeojson(places)); fit(map, places); };
    if (map.isStyleLoaded() && map.getSource('places')) apply(); else map.once('idle', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, focusKey]);

  if (!mapboxgl.accessToken) return <div className="map-missing">Mapbox-token mangler.</div>;
  return <div ref={containerRef} className="sk-map" />;
}
