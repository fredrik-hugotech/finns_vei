import { useEffect, useRef, useState } from 'react';

// Place/city search for people who'd rather type than pan the map or use GPS.
// A single search icon in the topbar expands into a field; results come from
// Mapbox forward geocoding (same API family as the reverse geocode already used
// in the report flow — no new key, and api.mapbox.com is already allowlisted in
// the CSP). Picking a result flies the map there; the user still confirms the
// exact spot on the map.
export default function PlaceSearch({ onPick, getProximity }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const reqIdRef = useRef(0);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (open) {
      // Focus the field as soon as it expands.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Debounced forward geocoding, biased to Norway and to what's currently on
  // screen so "Skoleveien" finds the nearby one first.
  useEffect(() => {
    const q = query.trim();
    if (!open || !token || q.length < 2) { setResults([]); setLoading(false); return undefined; }
    setLoading(true);
    const reqId = (reqIdRef.current += 1);
    const timer = setTimeout(async () => {
      try {
        const prox = getProximity?.();
        const proximity = prox && Number.isFinite(prox.lng) ? `&proximity=${prox.lng},${prox.lat}` : '';
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
          + `?access_token=${token}&country=no&language=no&limit=6&autocomplete=true`
          + `&types=place,locality,neighborhood,address,poi,postcode${proximity}`;
        const r = await fetch(url);
        const d = r.ok ? await r.json() : null;
        if (reqId !== reqIdRef.current) return; // a newer keystroke won
        const feats = (d?.features || []).map((f) => ({
          id: f.id,
          primary: f.text || (f.place_name || '').split(',')[0],
          secondary: (f.place_name || '').split(',').slice(1).join(',').trim(),
          center: f.center,
        })).filter((f) => Array.isArray(f.center) && Number.isFinite(f.center[0]));
        setResults(feats);
      } catch (_e) {
        if (reqId === reqIdRef.current) setResults([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, token, getProximity]);

  const close = () => { setOpen(false); setQuery(''); setResults([]); };

  const choose = (feat) => {
    if (!feat?.center) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(6);
    onPick?.({ lng: Number(feat.center[0]), lat: Number(feat.center[1]) });
    close();
  };

  if (!token) return null;

  return (
    <div className="place-search">
      <button
        type="button"
        className="app-menu__btn place-search__btn"
        aria-label="Søk etter sted"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
      </button>

      {open && (
        <>
          <button type="button" className="place-search__backdrop" aria-hidden="true" tabIndex={-1} onClick={close} />
          <div className="place-search__panel" role="dialog" aria-label="Søk etter by eller sted">
            <div className="place-search__field">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input
                ref={inputRef}
                type="text"
                inputMode="search"
                autoComplete="off"
                placeholder="Søk by, sted eller adresse"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                  if (e.key === 'Enter' && results[0]) choose(results[0]);
                }}
              />
              <button type="button" className="place-search__close" aria-label="Lukk søk" onClick={close}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            {(results.length > 0 || (query.trim().length >= 2 && !loading)) && (
              <ul className="place-search__results">
                {results.map((feat) => (
                  <li key={feat.id}>
                    <button type="button" className="place-search__result" onClick={() => choose(feat)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></svg>
                      <span className="place-search__result-text">
                        <strong>{feat.primary}</strong>
                        {feat.secondary && <span>{feat.secondary}</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {results.length === 0 && query.trim().length >= 2 && !loading && (
                  <li className="place-search__empty">Fant ikke stedet. Prøv et annet navn.</li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
