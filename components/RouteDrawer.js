import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { DEFAULT_CENTER } from '../lib/config';
import { pathDistanceMeters } from '../lib/geoPrivacy';
import Icon from './Icon';
import PlaceSearch from './PlaceSearch';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const LINE_COLOR = '#0b5d4d';
const MIN_ROUTE_M = 200;
const SPEED_KMH = { sykkel: 15, gange: 4.5 };

function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

let nextId = 1;

// Strava-style route builder: tap the map to add points, and each leg follows
// the road network (Mapbox Directions, cycling or walking profile) between
// them. "Følg veien" off draws straight lines instead, for paths the router
// doesn't know. Everything stays on the device until the adult presses save;
// the caller then clips the start (home) zone before anything is sent.
export default function RouteDrawer({ mode = 'sykkel', onSave, onCancel, saving = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const wpRef = useRef([]); // [{ id, lng, lat }]
  const legsRef = useRef([]); // legs[i] joins wp[i] → wp[i+1]: { coords, pending }
  const [waypoints, setWaypoints] = useState([]);
  const [legs, setLegs] = useState([]);
  const [snap, setSnap] = useState(true);
  const [notice, setNotice] = useState('');
  const snapRef = useRef(snap);
  const modeRef = useRef(mode);

  const commit = () => { setWaypoints([...wpRef.current]); setLegs([...legsRef.current]); };

  // One leg between two waypoints. Resolves to the road-following geometry,
  // or a straight line when snapping is off or no road route is found.
  const routeLeg = async (a, b) => {
    if (!snapRef.current) return { coords: [[a.lng, a.lat], [b.lng, b.lat]], straight: true };
    const profile = modeRef.current === 'gange' ? 'walking' : 'cycling';
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${a.lng},${a.lat};${b.lng},${b.lat}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) throw new Error('no route');
      return { coords, straight: false };
    } catch (_e) {
      return { coords: [[a.lng, a.lat], [b.lng, b.lat]], straight: true, failed: true };
    }
  };

  const resolveLeg = async (index) => {
    const a = wpRef.current[index];
    const b = wpRef.current[index + 1];
    if (!a || !b) return;
    const result = await routeLeg(a, b);
    // Ignore a result for a leg that was undone or recomputed meanwhile.
    if (wpRef.current[index] !== a || wpRef.current[index + 1] !== b) return;
    legsRef.current[index] = { coords: result.coords, pending: false };
    if (result.failed) setNotice('Fant ingen vei her, så vi tegnet en rett strek.');
    commit();
  };

  const addPoint = useCallback((lngLat) => {
    haptic(6);
    setNotice('');
    const wp = { id: nextId++, lng: lngLat.lng, lat: lngLat.lat };
    const prev = wpRef.current[wpRef.current.length - 1];
    wpRef.current = [...wpRef.current, wp];
    if (prev) {
      legsRef.current = [...legsRef.current, { coords: [[prev.lng, prev.lat], [wp.lng, wp.lat]], pending: true }];
      resolveLeg(wpRef.current.length - 2);
    }
    commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = () => {
    if (!wpRef.current.length) return;
    haptic(6);
    setNotice('');
    wpRef.current = wpRef.current.slice(0, -1);
    legsRef.current = legsRef.current.slice(0, Math.max(0, wpRef.current.length - 1));
    commit();
  };

  const clearAll = () => {
    haptic(8);
    setNotice('');
    wpRef.current = [];
    legsRef.current = [];
    commit();
  };

  // Mode or "Følg veien" changed: recompute every leg with the new rules.
  const recomputeAll = () => {
    legsRef.current = legsRef.current.map((leg) => ({ ...leg, pending: true }));
    commit();
    for (let i = 0; i < legsRef.current.length; i += 1) resolveLeg(i);
  };
  useEffect(() => {
    if (modeRef.current === mode && snapRef.current === snap) return;
    modeRef.current = mode;
    snapRef.current = snap;
    recomputeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, snap]);

  // Map setup.
  useEffect(() => {
    if (!containerRef.current || !mapboxgl.accessToken) return undefined;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.doubleClickZoom.disable();
    map.on('load', () => {
      map.addSource('draw-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'draw-route-casing', type: 'line', source: 'draw-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
      map.addLayer({
        id: 'draw-route-line',
        type: 'line',
        source: 'draw-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LINE_COLOR, 'line-width': 5, 'line-opacity': ['case', ['get', 'pending'], 0.45, 1] },
      });
      map.__drawReady = true;
      map.fire('draw-ready');
    });
    map.on('click', (e) => addPoint(e.lngLat));
    return () => { map.remove(); mapRef.current = null; };
  }, [addPoint]);

  // Draw the line + markers whenever the route changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const draw = () => {
      const source = map.getSource('draw-route');
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: legs.map((leg) => ({ type: 'Feature', properties: { pending: Boolean(leg.pending) }, geometry: { type: 'LineString', coordinates: leg.coords } })),
      });
    };
    if (map.__drawReady) draw(); else map.once('draw-ready', draw);

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = waypoints.map((wp, index) => {
      const el = document.createElement('div');
      const last = index === waypoints.length - 1 && index > 0;
      el.className = index === 0 ? 'rd-pin rd-pin--start' : (last ? 'rd-pin rd-pin--end' : 'rd-pin');
      if (index === 0) el.textContent = 'Start';
      return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([wp.lng, wp.lat]).addTo(map);
    });
    return undefined;
  }, [legs, waypoints]);

  const points = [];
  legs.forEach((leg, i) => {
    leg.coords.forEach((c, j) => { if (i > 0 && j === 0) return; points.push({ lng: c[0], lat: c[1] }); });
  });
  const distanceM = pathDistanceMeters(points);
  const pending = legs.some((leg) => leg.pending);
  const km = (distanceM / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const minutes = Math.max(1, Math.round((distanceM / 1000 / SPEED_KMH[mode === 'gange' ? 'gange' : 'sykkel']) * 60));
  const canSave = !pending && !saving && distanceM >= MIN_ROUTE_M;

  let hint = '';
  if (waypoints.length === 0) hint = 'Trykk på kartet der turen starter.';
  else if (waypoints.length === 1) hint = 'Trykk videre langs veien, helt fram til målet.';

  return (
    <div className="rd">
      <div ref={containerRef} className="rd__map" />
      {!mapboxgl.accessToken && <div className="map-missing">Mapbox-token mangler.</div>}

      <div className="rd__top">
        <button type="button" className="rd__cancel" onClick={onCancel}><Icon name="chevronLeft" size={20} strokeWidth={2.2} />Avbryt</button>
        <PlaceSearch
          onPick={(pt) => mapRef.current?.flyTo({ center: [pt.lng, pt.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 700 })}
          getProximity={() => { const c = mapRef.current?.getCenter(); return c ? { lng: c.lng, lat: c.lat } : null; }}
        />
      </div>

      <div className="rd__panel">
        {hint ? <p className="rd__hint">{hint}</p> : (
          <div className="rd__stats">
            <strong>{km} km</strong>
            <span>ca. {minutes} min {mode === 'gange' ? 'å gå' : 'på sykkel'}</span>
          </div>
        )}
        {notice && <p className="rd__notice">{notice}</p>}
        <div className="rd__row">
          <button type="button" className="rd__tool" onClick={undo} disabled={!waypoints.length || saving}><Icon name="undo" size={18} />Angre</button>
          <button type="button" className="rd__tool" onClick={clearAll} disabled={!waypoints.length || saving}><Icon name="close" size={18} />Fjern alt</button>
          <button type="button" className={snap ? 'rd__tool rd__tool--on' : 'rd__tool'} aria-pressed={snap} onClick={() => setSnap((v) => !v)} disabled={saving}>
            <Icon name="route" size={18} />Følg veien
          </button>
        </div>
        <button type="button" className="big-button big-button--primary rd__save" disabled={!canSave} onClick={() => onSave?.({ points, distanceM })}>
          {saving ? 'Lagrer …' : 'Lagre ruten'}
        </button>
      </div>
    </div>
  );
}
