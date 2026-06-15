import { useEffect, useRef, useState } from 'react';
import { distanceMeters, pathDistanceMeters, clipAndSnapCells, clipPath } from '../lib/geoPrivacy';

function haptic(ms = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function formatKm(meters) {
  return (meters / 1000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Live GPS tracker. Records the raw path ON THE DEVICE only — to draw the live
// route and compute distance — then hands back distance, duration and the
// clipped+snapped cells (the only thing that leaves the phone).
export default function TripTracker({ club, helmet, mapApi, onDone, onCancel }) {
  const [status, setStatus] = useState('starting'); // starting | tracking | error
  const [distanceM, setDistanceM] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const pointsRef = useRef([]);
  const startedAtRef = useRef(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setErrorMsg('Enheten støtter ikke posisjon.');
      return undefined;
    }

    // Keep the screen awake while tracking (best-effort).
    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request('screen').then((lock) => { wakeLockRef.current = lock; }).catch(() => {});
    }

    startedAtRef.current = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 1000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (Number.isFinite(accuracy) && accuracy > 60) return; // skip very fuzzy fixes
        const point = { lat: latitude, lng: longitude };
        const points = pointsRef.current;
        const last = points[points.length - 1];
        // Ignore jitter: only record meaningful movement.
        if (last && distanceMeters(last, point) < 5) return;
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

  const stopAndSave = async () => {
    haptic(14);
    setSaving(true);
    const points = pointsRef.current;
    const durationS = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0;
    const finalDistance = pathDistanceMeters(points);
    // Privacy: clip the ends and snap to the grid here, on the device, so raw
    // coordinates never leave the phone — we only send anonymous cells.
    const cells = clipAndSnapCells(points);
    const path = clipPath(points);
    await onDone?.({ club, helmet, distanceM: finalDistance, durationS, cells, path });
  };

  return (
    <div className="trip-tracker" role="dialog" aria-modal="true" aria-label="Sykkeltur pågår">
      <div className="trip-tracker__stats">
        <div>
          <strong>{formatKm(distanceM)}</strong>
          <span>km</span>
        </div>
        <div>
          <strong>{formatDuration(elapsed)}</strong>
          <span>tid</span>
        </div>
        <div className="trip-tracker__helmet">
          <strong>{helmet ? '⛑' : '–'}</strong>
          <span>{helmet ? 'hjelm' : 'uten'}</span>
        </div>
      </div>

      {status === 'starting' && <p className="trip-tracker__hint">Finner posisjon … hold telefonen ute under åpen himmel.</p>}
      {status === 'tracking' && <p className="trip-tracker__hint">Sykkelturen logges 🚲 – startstedet rundes av så ingen ser hvor du bor.</p>}
      {status === 'error' && <p className="trip-tracker__hint trip-tracker__hint--error">{errorMsg}</p>}

      <div className="trip-tracker__actions">
        <button type="button" className="big-button big-button--secondary" onClick={onCancel} disabled={saving}>Avbryt</button>
        <button type="button" className="big-button big-button--primary" onClick={stopAndSave} disabled={saving || status === 'error'}>
          {saving ? 'Lagrer …' : 'Stopp og lagre'}
        </button>
      </div>
    </div>
  );
}
