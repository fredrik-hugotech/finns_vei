import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { CATEGORY_LABELS, DEFAULT_CENTER, SEVERITY_LABELS } from '../lib/config';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const INITIAL_FORM = {
  category: 'crossing',
  severity: 'medium',
  description: '',
  address: '',
  contact: '',
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function popupHtml(properties = {}) {
  const trelloLink = properties.trelloUrl
    ? `<a href="${escapeHtml(properties.trelloUrl)}" target="_blank" rel="noopener noreferrer">Åpne Trello-kort</a>`
    : '';

  return `
    <article class="popup-card">
      <strong>${escapeHtml(properties.categoryLabel || 'Innmelding')}</strong>
      <span>${escapeHtml(properties.severityLabel || 'Middels')} risiko · ${escapeHtml(properties.status || 'Ny melding')}</span>
      <p>${escapeHtml(properties.description || '')}</p>
      ${properties.address ? `<small>${escapeHtml(properties.address)}</small>` : ''}
      ${trelloLink}
    </article>
  `;
}

export default function Map() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [selectedPoint, setSelectedPoint] = useState({ lng: DEFAULT_CENTER[0], lat: DEFAULT_CENTER[1] });
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState({ type: 'idle', message: 'Trykk i kartet for å plassere en innmelding.' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [reportMeta, setReportMeta] = useState(null);

  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  const selectedLabel = useMemo(() => {
    if (!selectedPoint) return 'Ingen posisjon valgt';
    return `${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}`;
  }, [selectedPoint]);

  const setMarker = useCallback((point) => {
    const map = mapRef.current;
    if (!map) return;

    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#f97316', draggable: true })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      markerRef.current.on('dragend', () => {
        const lngLat = markerRef.current.getLngLat();
        setSelectedPoint({ lng: lngLat.lng, lat: lngLat.lat });
      });
    } else {
      markerRef.current.setLngLat([point.lng, point.lat]);
    }
  }, []);

  const loadReports = useCallback(async () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const response = await fetch('/api/reports');
    if (!response.ok) throw new Error('Kunne ikke hente innmeldinger');
    const geojson = await response.json();
    setReportMeta(geojson.meta || null);

    const source = map.getSource('reports');
    if (source) {
      source.setData(geojson);
      return;
    }

    map.addSource('reports', { type: 'geojson', data: geojson });

    map.addLayer({
      id: 'reports-heat',
      type: 'heatmap',
      source: 'reports',
      maxzoom: 15,
      paint: {
        'heatmap-weight': ['match', ['get', 'severity'], 'high', 1, 'medium', 0.65, 0.35],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.8],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 18, 14, 36],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.75, 15, 0],
      },
    });

    map.addLayer({
      id: 'reports-circle',
      type: 'circle',
      source: 'reports',
      minzoom: 10,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 16],
        'circle-color': ['match', ['get', 'severity'], 'high', '#dc2626', 'medium', '#f59e0b', 'low', '#10b981', '#2563eb'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.92,
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
      new mapboxgl.Popup({ closeOnClick: true, maxWidth: '300px' })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(popupHtml(feature.properties))
        .addTo(map);
    });
  }, []);

  useEffect(() => {
    if (!mapContainer.current || !hasMapboxToken) return undefined;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: 12,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', async () => {
      setMarker({ lng: DEFAULT_CENTER[0], lat: DEFAULT_CENTER[1] });
      try {
        await loadReports();
      } catch (error) {
        console.error(error);
        setStatus({ type: 'error', message: 'Kartet lastet, men innmeldinger kunne ikke hentes.' });
      }
    });

    map.on('click', (event) => {
      const point = { lng: event.lngLat.lng, lat: event.lngLat.lat };
      setSelectedPoint(point);
      setMarker(point);
      setStatus({ type: 'idle', message: 'Posisjon valgt. Fyll ut skjemaet og send inn.' });
      if (window.innerWidth < 760) setIsPanelOpen(true);
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [hasMapboxToken, loadReports, setMarker]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedPoint) return;

    setIsSubmitting(true);
    setStatus({ type: 'idle', message: 'Sender innmelding...' });

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...selectedPoint }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Kunne ikke sende innmelding');
      }

      setForm(INITIAL_FORM);
      setStatus({
        type: payload.warning ? 'warning' : 'success',
        message: payload.warning || (payload.trelloCard ? 'Innmelding lagret og Trello-kort opprettet.' : 'Innmelding lagret.'),
      });
      await loadReports();
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || 'Noe gikk galt. Prøv igjen.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasMapboxToken) {
    return (
      <main className="missing-config">
        <h1>Finns vei</h1>
        <p>Sett <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> i Vercel for å vise Mapbox-kartet.</p>
        <p>Supabase- og Trello-nøkler legges også inn som miljøvariabler, ikke i kode.</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div ref={mapContainer} className="map-canvas" aria-label="Kart for trafikksikkerhetsinnmeldinger" />

      <section className={`report-panel ${isPanelOpen ? 'report-panel--open' : ''}`} aria-label="Meld inn trafikksikkerhet">
        <button className="panel-toggle" type="button" onClick={() => setIsPanelOpen((value) => !value)}>
          {isPanelOpen ? 'Skjul skjema' : 'Meld inn'}
        </button>

        <div className="panel-content">
          <p className="eyebrow">Mobil web-kart</p>
          <h1>Finns vei</h1>
          <p className="lede">Meld inn farlige punkter på skolevei, kryssing, sykkelruter og andre steder som trenger tiltak.</p>

          {reportMeta?.demo && (
            <div className="notice notice--warning">Demo-data vises. Koble til Supabase for ekte innmeldinger.</div>
          )}

          <form onSubmit={handleSubmit}>
            <label>
              Posisjon
              <output>{selectedLabel}</output>
            </label>

            <label>
              Kategori
              <select name="category" value={form.category} onChange={handleChange}>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label>
              Alvorlighet
              <select name="severity" value={form.severity} onChange={handleChange}>
                {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label>
              Beskrivelse
              <textarea name="description" value={form.description} onChange={handleChange} minLength={5} maxLength={1600} required placeholder="Hva skjer her, når er det utrygt, og hvem påvirkes?" />
            </label>

            <label>
              Sted/adresse (valgfritt)
              <input name="address" value={form.address} onChange={handleChange} maxLength={320} placeholder="F.eks. gangfelt ved skolen" />
            </label>

            <label>
              Kontakt (valgfritt)
              <input name="contact" value={form.contact} onChange={handleChange} maxLength={320} placeholder="E-post eller telefon hvis kommunen kan følge opp" />
            </label>

            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sender...' : 'Send innmelding'}
            </button>
          </form>

          <div className={`notice notice--${status.type}`} role="status">{status.message}</div>
        </div>
      </section>
    </main>
  );
}
