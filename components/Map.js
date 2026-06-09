import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function Map() {
  const mapContainer = useRef(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [8.0, 58.1],
      zoom: 12,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', async () => {
      try {
        const res = await fetch('/api/reports');
        const geojson = await res.json();

        map.addSource('reports', {
          type: 'geojson',
          data: geojson,
        });

        // Soft shadow to make points stand out
        map.addLayer({
          id: 'reports-shadow',
          type: 'circle',
          source: 'reports',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 22],
            'circle-color': 'rgba(0, 0, 0, 0.25)',
            'circle-blur': 0.8,
          },
        });

        map.addLayer({
          id: 'reports-circle',
          type: 'circle',
          source: 'reports',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 16],
            'circle-color': [
              'match',
              ['get', 'status'],
              'Ny melding', '#3B82F6',
              'Registrert', '#F59E0B',
              'Startet', '#F97316',
              'Fullført', '#10B981',
              '#6B7280',
            ],
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2,
          },
        });

        map.on('mouseenter', 'reports-circle', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'reports-circle', () => {
          map.getCanvas().style.cursor = '';
        });

        map.on('click', 'reports-circle', (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          const coords = feature.geometry.coordinates.slice();
          const props = feature.properties || {};

          const html = `
            <div style="min-width: 160px">
              <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${
                props.status ?? ''
              }</div>
              <div style="font-size: 13px; line-height: 1.3;">${props.text ?? ''}</div>
            </div>
          `;

          new mapboxgl.Popup({ closeOnClick: true })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load reports', err);
      }
    });

    return () => {
      map.remove();
    };
  }, []);

  return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />;
}
