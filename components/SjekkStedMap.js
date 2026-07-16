import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { DEFAULT_CENTER } from '../lib/config';

// Slim, standalone map for "Sjekk et sted": tap once to drop a marker at a
// single point, nothing else (no route drawing, no clustering, no NVDB
// layers on the map itself — those are fetched and shown in the result card
// instead). Same Mapbox init/style/token pattern as components/ReportMap.js,
// pared down to just what a single-point picker needs.
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function SjekkStedMap({ point, onPick, className = 'map-canvas' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);

  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

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

    const handleClick = (event) => {
      onPickRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };
    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
    };
  }, [hasMapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (!point) {
      markerRef.current?.remove();
      markerRef.current = null;
      return undefined;
    }
    const lngLat = [point.lng, point.lat];
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#0b5d4d' }).setLngLat(lngLat).addTo(map);
    } else {
      markerRef.current.setLngLat(lngLat);
    }
    map.easeTo({ center: lngLat, duration: 500 });
    return undefined;
  }, [point]);

  if (!hasMapboxToken) {
    return <div className="map-missing">Kart utilgjengelig (mangler Mapbox-token).</div>;
  }

  return <div ref={containerRef} className={className} />;
}
