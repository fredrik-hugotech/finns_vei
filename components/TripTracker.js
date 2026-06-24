import { useEffect, useRef, useState } from 'react';
import { distanceMeters, pathDistanceMeters, clipAndSnapCells, clipPath } from '../lib/geoPrivacy';

function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function formatKm(meters) {
  return (meters / 1000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Live GPS tracker. Records the raw path ON THE DEVICE only — to draw the live
// route and compute distance — then hands back distance, duration and the
// clipped+snapped cells/path. Also lets the rider drop "unsafe point" reports.
export default function TripTracker({ club, helmet, routeType = 'fritid', mapApi, onDone, onCancel }) {
  const [status, setStatus] = useState('starting'); // starting | tracking | error
  const [distanceM, setDistanceM] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [unsafeCount, setUnsafeCount] = useState(0);
  const [flash, setFlash] = useState('');

  const pointsRef = useRef([]);
  const lastFixRef = useRef(null);
  const startedAtRef = useRef(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setErrorMsg('Enheten støtter ikke posisjon.');
      return undefined;
    }
    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request('screen').then((lock) => { wakeLockRef.current = lock; }).catch(() => {});
    }
    startedAtRef.current = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 1000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (Number.isFinite(accuracy) && accuracy > 60) return;
        const point = { lat: latitude, lng: longitude };
        lastFixRef.current = point;
        const points = pointsRef.current;
        const last = points[points.length - 1];
        if (last && distanceMeters(last, point) < 5) { setStatus('tracking'); return; }
        points.push(point);
        setStatus('tracking');
        setDistanceM(pathDistanceMeters(points));
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
      clearInterval(timer);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (wakeLockRef.current) { wakeLockRef.current.release?.(); wakeLockRef.current = null; }
      mapApi?.clearLivePath?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markUnsafe = async () => {
    const fix = lastFixRef.current;
    if (!fix) { setFlash('Venter på posisjon …'); return; }
    haptic([20, 30, 20]);
    setUnsafeCount((n) => n + 1);
    setFlash('Utrygt punkt lagret 🚩');
    setTimeout(() => setFlash(''), 2200);
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_type: 'barn',
          category: 'Farlig for sykkel',
          description: `Utrygt punkt markert under sykkelregistrering (${routeType === 'skole' ? 'skolerute' : 'fritidsrute'}).`,
          lat: fix.lat,
          lng: fix.lng,
          bike_route_type: routeType,
        }),
      });
    } catch (_error) {
      // best-effort: the point is already acknowledged to the rider
    }
  };

  const stopAndSave = async () => {
    haptic(14);
    setSaving(true);
    const points = pointsRef.current;
    const durationS = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0;
    const finalDistance = pathDistanceMeters(points);
    const cells = clipAndSnapCells(points);
    const path = clipPath(points);
    await onDone?.({ club, helmet, routeType, distanceM: finalDistance, durationS, cells, path });
  };

  const acquiring = status === 'starting';

  return (
    <div className="trip-tracker" role="dialog" aria-modal="true" aria-label="Sykkeltur pågår">
      <div className="trip-tracker__head">
        <span className="trip-tracker__pill">{routeType === 'skole' ? '🏫 Skolerute' : '⚽ Fritidsrute'}</span>
        {helmet && <span className="trip-tracker__pill trip-tracker__pill--ok">⛑ Hjelm</span>}
      </div>

      <div className={acquiring ? 'bike-track bike-track--wait' : 'bike-track'} aria-hidden="true">
        <div className="bike-track__road" />
        <div className="bike-track__bike">🚴</div>
      </div>

      <div className="trip-tracker__stats">
        <div><strong>{formatKm(distanceM)}</strong><span>km</span></div>
        <div><strong>{formatDuration(elapsed)}</strong><span>tid</span></div>
        <div><strong>{unsafeCount}</strong><span>utrygge</span></div>
      </div>

      {acquiring && <p className="trip-tracker__hint">Finner posisjon … hold telefonen ute under åpen himmel 📡</p>}
      {status === 'tracking' && <p className="trip-tracker__hint">Sykle som vanlig 🚲 — trykk knappen under hvis noe føles utrygt.</p>}
      {status === 'error' && <p className="trip-tracker__hint trip-tracker__hint--error">{errorMsg}</p>}
      {flash && <p className="trip-tracker__flash">{flash}</p>}

      <button type="button" className="big-button trip-tracker__unsafe" onClick={markUnsafe} disabled={saving || status === 'error'}>
        🚩 Marker utrygt punkt her
      </button>

      <div className="trip-tracker__actions">
        <button type="button" className="big-button big-button--secondary" onClick={onCancel} disabled={saving}>Avbryt</button>
        <button type="button" className="big-button trip-tracker__stop" onClick={stopAndSave} disabled={saving || status === 'error'}>
          {saving ? 'Lagrer …' : '🏁 Stopp og lagre'}
        </button>
      </div>
    </div>
  );
}
