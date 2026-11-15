import { useEffect, useState } from 'react';

// Google Street View built into the page, so staff always see the place
// while they work on a case. Uses the Maps Embed API when
// NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY is set, otherwise Google's keyless embed.
export function streetViewEmbedUrl(lat, lng) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const la = Number(lat).toFixed(6); const ln = Number(lng).toFixed(6);
  if (key) return `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${la},${ln}&fov=90&source=outdoor`;
  return `https://www.google.com/maps/embed?origin=mfe&pb=!6m6!1m5!2m2!1d${la}!2d${ln}!4f-0!5f1`;
}
export function streetViewOpenUrl(lat, lng) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

const HIDE_KEY = 'ff-streetview-hidden';

export default function StreetViewPanel({ lat, lng, className = '' }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(window.localStorage.getItem(HIDE_KEY) === '1'); } catch (_e) { /* ignore */ } }, []);
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const toggle = () => {
    setHidden((h) => {
      try { window.localStorage.setItem(HIDE_KEY, h ? '0' : '1'); } catch (_e) { /* ignore */ }
      return !h;
    });
  };
  return (
    <div className={`sv-panel ${hidden ? 'sv-panel--hidden' : ''} ${className}`}>
      <div className="sv-panel__bar">
        <strong>Street View</strong>
        <a href={streetViewOpenUrl(lat, lng)} target="_blank" rel="noopener noreferrer">Åpne stort ↗</a>
        <button type="button" onClick={toggle} aria-expanded={!hidden}>{hidden ? 'Vis' : 'Skjul'}</button>
      </div>
      {!hidden && (
        <iframe
          key={`${lat},${lng}`}
          className="sv-panel__frame"
          title="Street View av stedet"
          src={streetViewEmbedUrl(lat, lng)}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
    </div>
  );
}
