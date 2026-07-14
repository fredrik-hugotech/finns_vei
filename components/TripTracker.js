import { useEffect, useRef, useState } from 'react';
import { distanceMeters, pathDistanceMeters, clipAndSnapCells, clipPath, snapToGrid, CLIP_METERS } from '../lib/geoPrivacy';
import Icon from './Icon';
import WeatherFx from './WeatherFx';

function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

function formatKm(meters) {
  return (meters / 1000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Live GPS tracker. Records the raw path ON THE DEVICE only — to draw the live
// route and compute distance — then hands back distance, duration and the
// clipped+snapped cells/path. Also lets the rider drop "unsafe point" reports.
export default function TripTracker({ club, helmet, routeType = 'fritid', mode = 'sykkel', mapApiRef, onDone, onCancel }) {
  const [status, setStatus] = useState('starting'); // starting | tracking | error
  const [distanceM, setDistanceM] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [unsafeCount, setUnsafeCount] = useState(0);
  const [flash, setFlash] = useState('');
  const [weather, setWeather] = useState(null);
  const [pointCount, setPointCount] = useState(0);

  const pointsRef = useRef([]);
  const lastFixRef = useRef(null);
  const startedAtRef = useRef(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const weatherFetchedRef = useRef(false);

  // Fetch the weather once, at the first GPS fix — so we can celebrate sun and
  // give a little praise (and the bonus) for heading out in rain/snow.
  const fetchWeatherOnce = (lat, lng) => {
    if (weatherFetchedRef.current) return;
    weatherFetchedRef.current = true;
    fetch(`/api/weather?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => { if (w && w.ok) setWeather(w); })
      .catch(() => {});
  };

  useEffect(() => {
    document.body.classList.add('trip-tracking');
    if (!navigator.geolocation) {
      setStatus('error');
      setErrorMsg('Enheten støtter ikke posisjon.');
      return () => { document.body.classList.remove('trip-tracking'); };
    }
    const requestWakeLock = () => {
      if (!navigator.wakeLock?.request) return;
      navigator.wakeLock.request('screen').then((lock) => {
        wakeLockRef.current = lock;
        lock.addEventListener('release', () => { wakeLockRef.current = null; });
      }).catch(() => {});
    };
    requestWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    startedAtRef.current = Date.now();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (Number.isFinite(accuracy) && accuracy > 60) return;
        const point = { lat: latitude, lng: longitude };
        lastFixRef.current = point;
        fetchWeatherOnce(latitude, longitude);
        const points = pointsRef.current;
        const last = points[points.length - 1];
        if (last && distanceMeters(last, point) < 5) { setStatus('tracking'); return; }
        points.push(point);
        setStatus('tracking');
        setDistanceM(pathDistanceMeters(points));
        setPointCount(points.length);
        // Read via the ref (not a captured prop) so a map that's still loading
        // when tracking starts is picked up as soon as it becomes ready.
        const mapApi = mapApiRef?.current;
        if (mapApi) {
          mapApi.showLivePath?.({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) } }],
          });
          mapApi.flyToLngLat?.(point);
        }
      },
      (error) => {
        setStatus('error');
        setErrorMsg(error.code === 1 ? 'Vi trenger tilgang til posisjon for å logge turen.' : 'Fikk ikke posisjon. Prøv igjen ute.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );

    return () => {
      document.body.classList.remove('trip-tracking');
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (wakeLockRef.current) { wakeLockRef.current.release?.(); wakeLockRef.current = null; }
      mapApiRef?.current?.clearLivePath?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markUnsafe = async () => {
    const fix = lastFixRef.current;
    if (!fix) { setFlash('Venter på posisjon …'); return; }
    // Same privacy rule as the rest of the trip: protect the ~150m zone around
    // the start (likely home) by snapping it to the coarse grid instead of
    // sending the exact fix. Points further along the ride stay at full
    // precision since they're genuinely useful hazard locations.
    const start = pointsRef.current[0] || fix;
    const nearStart = distanceMeters(fix, start) <= CLIP_METERS;
    const point = nearStart ? snapToGrid(fix.lat, fix.lng) : fix;
    if (!point) { setFlash('Venter på posisjon …'); return; }
    haptic([20, 30, 20]);
    try {
      // There's no walking-specific category in REPORT_CATEGORIES (lib/config.js)
      // yet, so a point marked while walking falls back to 'Annet' rather than
      // being mistagged as a cycling hazard.
      const category = mode === 'gange' ? 'Annet' : 'Farlig for sykkel';
      const modeLabel = mode === 'gange' ? 'gåregistrering' : 'sykkelregistrering';
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_type: 'barn',
          category,
          description: `Utrygt punkt markert under ${modeLabel} (${routeType === 'skole' ? 'skolerute' : 'fritidsrute'}).`,
          lat: point.lat,
          lng: point.lng,
          bike_route_type: routeType,
        }),
      });
      if (!response.ok) throw new Error('Kunne ikke lagre punktet');

      setUnsafeCount((n) => n + 1);
      setFlash('Utrygt punkt lagret');
    } catch (_error) {
      setFlash('Kunne ikke lagre punktet');
    }
    setTimeout(() => setFlash(''), 2200);
  };

  const stopAndSave = async () => {
    haptic(14);
    setSaving(true);
    const points = pointsRef.current;
    const durationS = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0;
    const finalDistance = pathDistanceMeters(points);
    const cells = clipAndSnapCells(points);
    const path = clipPath(points);
    const weatherPayload = weather
      ? { symbol: weather.symbolCode || null, precipMm: weather.precipMm ?? null, tempC: weather.tempC ?? null, bonus: Boolean(weather.isPrecip), kind: weather.kind || null }
      : null;
    await onDone?.({ club, helmet, routeType, distanceM: finalDistance, durationS, cells, path, weather: weatherPayload });
  };

  const acquiring = status === 'starting';

  return (
    <>
    {weather && <WeatherFx kind={weather.kind} tempC={weather.tempC} />}
    <div className="trip-tracker" role="dialog" aria-modal="true" aria-label="Sykkeltur pågår">
      <div className="trip-tracker__head">
        <span className="trip-tracker__pill"><Icon name={routeType === 'skole' ? 'school' : 'activity'} size={15} />{routeType === 'skole' ? 'Skolerute' : 'Fritidsrute'}</span>
        {helmet && <span className="trip-tracker__pill trip-tracker__pill--ok"><Icon name="helmet" size={15} />Hjelm</span>}
      </div>

      <div className={acquiring ? 'bike-track bike-track--wait' : 'bike-track'} aria-hidden="true">
        <div className="bike-track__road" />
        <div className="bike-track__bike"><Icon name="bike" size={34} strokeWidth={1.7} /></div>
      </div>

      <div className="trip-tracker__stats trip-tracker__stats--two">
        <div><strong>{formatKm(distanceM)}</strong><span>km</span></div>
        <div><strong>{unsafeCount}</strong><span>utrygge</span></div>
      </div>

      {acquiring && <p className="trip-tracker__hint">Finner posisjon …</p>}
      {status === 'error' && <p className="trip-tracker__hint trip-tracker__hint--error">{errorMsg}</p>}
      {flash && <p className="trip-tracker__flash"><Icon name="check" size={15} />{flash}</p>}

      <button type="button" className="big-button trip-tracker__unsafe" onClick={markUnsafe} disabled={saving || status === 'error'}>
        <Icon name="flag" size={20} /> Marker utrygt punkt her
      </button>

      <div className="trip-tracker__actions">
        <button type="button" className="big-button big-button--secondary" onClick={onCancel} disabled={saving}>Avbryt</button>
        <button type="button" className="big-button trip-tracker__stop" onClick={stopAndSave} disabled={saving || pointCount === 0}>
          <Icon name="stop" size={18} /> {saving ? 'Lagrer …' : 'Stopp og lagre'}
        </button>
      </div>
    </div>
    </>
  );
}
