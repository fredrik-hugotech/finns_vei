import { useEffect, useRef, useState } from 'react';
import { REPORT_CATEGORIES, REPORTER_TYPES } from '../lib/config';
import { categoryGlyph } from '../lib/reportCategoryGlyphs';
import { descriptionSuggestions } from '../lib/reportDescriptionSuggestions';
import { REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_COUNT } from '../lib/reportImages';
import { addMyReport } from '../lib/myReports';
import BudTip from './BudTip';
import DictationButton from './DictationButton';
import { addPendingReport } from '../lib/offlineReportQueue';

// Coordinates → a human place ("Marviksveien · Lund") so the reporter can
// confirm they picked the right spot before sending.
async function reverseGeocode(lat, lng, token) {
  try {
    // NB: Mapbox geocoding has no "street" type — passing it makes the whole
    // request 422 and the place label hangs on "Henter sted …". Valid types
    // only: address, neighborhood, locality, place, …
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=no&limit=1&types=address,neighborhood,locality,place`);
    if (!r.ok) return null;
    const d = await r.json();
    const f = (d.features || [])[0];
    if (!f) return null;
    const street = String(f.place_name || f.text || '').split(',')[0].trim();
    const ctx = (f.context || []).find((x) => /^(neighborhood|locality|place)/.test(x.id || ''));
    const parts = [street, ctx?.text].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    return parts.join(' · ') || null;
  } catch (_e) { return null; }
}

const INITIAL_FORM = {
  // Several things can feel unsafe about the same spot (e.g. a crossing that
  // also has poor sight lines and high speed), so the reporter can tick more
  // than one. The first one picked is the "primary" category we store in the
  // report's category column — the rest are folded into the description so
  // nothing downstream (map colouring, backoffice, NVDB) has to change.
  categories: [],
  description: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  // Honeypot anti-bot field. Real people never see or fill this (it's
  // positioned off-screen in the markup below); scripts that auto-fill
  // every form field tend to fill it anyway, which flags them server-side.
  nettside: '',
};

function haptic(ms = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}

export default function ReportSheet({ point, onClose, onSubmitted, onChangeLocation, onViewCase }) {
  const [reporterType, setReporterType] = useState(REPORTER_TYPES.ADULT);
  const [form, setForm] = useState(INITIAL_FORM);
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [place, setPlace] = useState(null);

  const sheetRef = useRef(null);
  const drag = useRef({ y: 0, active: false, moved: false });

  const isAdult = reporterType === REPORTER_TYPES.ADULT;
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapThumb = (mapboxToken && point && Number.isFinite(Number(point.lat)))
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+0b5d4d(${point.lng},${point.lat})/${point.lng},${point.lat},15,0/240x150@2x?access_token=${mapboxToken}`
    : null;

  useEffect(() => {
    if (!mapboxToken || !point || !Number.isFinite(Number(point.lat))) return undefined;
    let cancelled = false;
    setPlace(null);
    // Fall back to the coordinates so the label never hangs on "Henter sted …"
    // if the geocode is empty or fails.
    const fallback = `${Number(point.lat).toFixed(4)}, ${Number(point.lng).toFixed(4)}`;
    reverseGeocode(Number(point.lat), Number(point.lng), mapboxToken).then((p) => { if (!cancelled) setPlace(p || fallback); });
    return () => { cancelled = true; };
  }, [mapboxToken, point]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const toggleCategory = (category) => {
    haptic(6);
    setForm((current) => {
      const has = current.categories.includes(category);
      const categories = has
        ? current.categories.filter((c) => c !== category)
        : [...current.categories, category];
      return { ...current, categories };
    });
  };

  // The first category picked drives the stored category column and the
  // description suggestion chips.
  const primaryCategory = form.categories[0] || null;

  // What we actually send as the description: when more than one category is
  // ticked, prepend a short, human-readable line listing all of them so a
  // caseworker sees every angle without any schema change.
  const composeDescription = () => {
    const base = form.description.trim();
    if (form.categories.length > 1) {
      return `Gjelder: ${form.categories.join(', ')}.\n${base}`;
    }
    return base;
  };

  // Tapping a suggestion chip appends the phrase to the free-text description
  // (or removes it again if it's already there verbatim), joining sentences
  // in a way that reads naturally in Norwegian.
  const toggleSuggestion = (phrase) => {
    haptic(6);
    setForm((current) => {
      const desc = current.description;
      const idx = desc.indexOf(phrase);
      if (idx !== -1) {
        const before = desc.slice(0, idx);
        const after = desc.slice(idx + phrase.length);
        const merged = before.trim()
          ? before.replace(/[.,]?\s*$/, '') + after
          : after.replace(/^[.,]?\s*/, '');
        return { ...current, description: merged.trim() };
      }
      if (!desc.trim()) return { ...current, description: phrase };
      const trimmed = desc.replace(/\s+$/, '');
      const joiner = /[.!?,]$/.test(trimmed) ? ' ' : '. ';
      return { ...current, description: `${trimmed}${joiner}${phrase}` };
    });
  };

  const selectReporter = (type) => {
    haptic(6);
    setReporterType(type);
  };

  const resetAndClose = () => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    onClose?.();
  };

  // Swipe-down-to-dismiss on the grab handle (pointer events = touch + mouse).
  const onDragStart = (event) => {
    drag.current = { y: event.clientY, active: true, moved: false };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onDragMove = (event) => {
    if (!drag.current.active || !sheetRef.current) return;
    const dy = Math.max(0, event.clientY - drag.current.y);
    if (dy > 6) drag.current.moved = true;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onDragEnd = (event) => {
    if (!drag.current.active || !sheetRef.current) return;
    const dy = Math.max(0, event.clientY - drag.current.y);
    drag.current.active = false;
    sheetRef.current.style.transition = '';
    if (dy > 110) {
      haptic(10);
      resetAndClose();
    } else {
      sheetRef.current.style.transform = '';
    }
  };
  const onHandleClick = () => {
    if (drag.current.moved) return;
    resetAndClose();
  };

  const addImages = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    const nextImages = [...images];
    for (const file of selected) {
      if (nextImages.length >= REPORT_IMAGE_MAX_COUNT) {
        setStatus({ type: 'error', message: `Du kan legge ved maks ${REPORT_IMAGE_MAX_COUNT} bilder.` });
        break;
      }
      if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
        setStatus({ type: 'error', message: 'Du kan bare legge ved bildefiler.' });
        continue;
      }
      if (file.size > REPORT_IMAGE_MAX_BYTES) {
        setStatus({ type: 'error', message: 'Et bilde er for stort. Maks 8 MB per bilde.' });
        continue;
      }
      nextImages.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setImages(nextImages);
  };

  const removeImage = (id) => {
    setImages((current) => {
      const match = current.find((image) => image.id === id);
      if (match?.previewUrl) URL.revokeObjectURL(match.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  };

  // JSON-serializable fields only — this is both what we POST as JSON when
  // online, and (for image-free reports) exactly what gets parked in the
  // offline queue if the request can't reach the server.
  const buildQueuePayload = () => ({
    reporter_type: reporterType,
    category: primaryCategory,
    description: composeDescription(),
    lat: point.lat,
    lng: point.lng,
    contact_name: isAdult ? form.contact_name : '',
    contact_email: isAdult ? form.contact_email : '',
    contact_phone: isAdult ? form.contact_phone : '',
    nettside: form.nettside,
  });

  // A genuine connectivity failure (fetch() itself threw, or we already know
  // we're offline). Images can't be queued safely (see lib/offlineReportQueue.js),
  // so those reports are left in the open form for a manual retry instead of
  // being silently queued or lost.
  const handleOfflineSubmit = (queuePayload) => {
    if (images.length) {
      setStatus({ type: 'error', message: 'Ingen nettforbindelse akkurat nå. Meldinger med bilde kan ikke lagres for senere sending — bildene dine ligger fortsatt klare her, prøv igjen når du har dekning.' });
      return;
    }
    addPendingReport(queuePayload);
    setSubmitted(true);
    haptic([10, 40, 14]);
    setStatus({ type: 'queued', message: 'Lagret på enheten – sendes automatisk når du får dekning igjen.' });
  };

  const submitReport = async (event) => {
    event.preventDefault();
    haptic(12);

    if (!form.categories.length) {
      setStatus({ type: 'error', message: 'Velg minst én ting som føles utrygt.' });
      return;
    }

    const queuePayload = buildQueuePayload();

    // Already known to be offline (e.g. flight mode, or the browser already
    // detected the connection is down) — no point racing a doomed fetch.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      handleOfflineSubmit(queuePayload);
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: 'idle', message: images.length ? 'Laster opp bilde …' : 'Sender meldingen …' });

    const body = new FormData();
    body.set('reporter_type', queuePayload.reporter_type);
    body.set('category', queuePayload.category);
    body.set('description', queuePayload.description);
    body.set('lat', String(queuePayload.lat));
    body.set('lng', String(queuePayload.lng));
    body.set('contact_name', queuePayload.contact_name);
    body.set('contact_email', queuePayload.contact_email);
    body.set('contact_phone', queuePayload.contact_phone);
    body.set('nettside', queuePayload.nettside);
    images.forEach((image) => body.append('images', image.file));

    let response;
    try {
      response = await fetch('/api/report', { method: 'POST', body });
    } catch (networkError) {
      // fetch() never got a response at all — a real connectivity failure,
      // not a server-side rejection. Safe to queue (retrying the exact same
      // payload later is the right move) rather than surface as an error.
      setIsSubmitting(false);
      handleOfflineSubmit(queuePayload);
      return;
    }

    try {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunne ikke sende meldingen');

      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setImages([]);
      setSubmitted(true);
      haptic([10, 40, 14]);
      setStatus({ type: payload.warning ? 'warning' : 'success', message: payload.warning || '' });
      setSubmittedId(payload.id || null);
      try { addMyReport({ id: payload.id, category: primaryCategory }); } catch (_e) { /* best effort */ }
      onSubmitted?.();
    } catch (error) {
      // The server actually answered (or answered with a broken body) — a
      // real outcome, not a dropped connection. Retrying the identical
      // payload would just fail the same way, so this surfaces like before
      // instead of being queued.
      setStatus({ type: 'error', message: error.message || 'Noe gikk galt.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Meld fra">
      <div className="sheet-backdrop" onClick={resetAndClose} />
      <section className="sheet" ref={sheetRef}>
        <button
          type="button"
          className="sheet__handle"
          aria-label="Lukk"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onClick={onHandleClick}
        />

        {submitted ? (
          <div className="sheet-success">
            {status.type === 'queued' ? (
              <div className="sheet-success__badge sheet-success__badge--queued" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M12 7v6l4 2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            ) : (
              <div className="sheet-success__badge" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4 10-11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            )}
            <h2>{status.type === 'queued' ? 'Lagret på enheten' : 'Takk for at du sier fra!'}</h2>
            <p>{status.type === 'queued' ? 'Ingen nett akkurat nå — meldingen sendes automatisk så snart enheten får dekning igjen.' : 'Meldingen er mottatt. Vi ser på saken så godt vi klarer.'}</p>
            {status.type !== 'queued' && status.message && <div className={`notice notice--${status.type}`} role="status">{status.message}</div>}
            {status.type !== 'queued' && <BudTip audience={isAdult ? 'voksen' : 'barn'} />}
            <div className="sheet-success__actions">
              {status.type !== 'queued' && submittedId ? (
                <button type="button" className="big-button big-button--primary" onClick={() => onViewCase?.(submittedId)}>Se saken på kartet</button>
              ) : (
                <button type="button" className="big-button big-button--primary" onClick={resetAndClose}>Se på kartet</button>
              )}
              <button
                type="button"
                className="big-button big-button--secondary"
                onClick={() => { setSubmitted(false); setSubmittedId(null); setForm(INITIAL_FORM); setStatus({ type: 'idle', message: '' }); onChangeLocation?.(); }}
              >
                Meld en til
              </button>
            </div>
          </div>
        ) : (
          <form className="sheet-form" onSubmit={submitReport}>
            <div className="sheet-scroll">
              <div className="report-loc">
                {mapThumb && <span className="report-loc__map"><img src={mapThumb} alt="Kart over valgt sted" /></span>}
                <span className="report-loc__text">
                  <span className="report-loc__label">Stedet du melder fra</span>
                  <span className="report-loc__place">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" /></svg>
                    {place || 'Henter sted …'}
                  </span>
                </span>
                <button type="button" className="report-loc__change" onClick={() => { haptic(6); onChangeLocation?.(); }}>Endre</button>
              </div>

              <div className="segmented" role="tablist" aria-label="Hvem melder">
                <button type="button" role="tab" aria-selected={!isAdult} className={!isAdult ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => selectReporter(REPORTER_TYPES.CHILD)}>Barn</button>
                <button type="button" role="tab" aria-selected={isAdult} className={isAdult ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => selectReporter(REPORTER_TYPES.ADULT)}>Voksen</button>
              </div>

              <fieldset className="sheet-field">
                <legend>Hva føles utrygt? <span className="sheet-field__hint">Velg gjerne flere</span></legend>
                <div className="category-grid">
                  {REPORT_CATEGORIES.map((category) => {
                    const checked = form.categories.includes(category);
                    return (
                      <label className={checked ? 'category-card category-card--active' : 'category-card'} key={category}>
                        <input type="checkbox" name="categories" value={category} checked={checked} onChange={() => toggleCategory(category)} />
                        <span className="category-card__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: categoryGlyph(category) }} />
                        <span className="category-card__label">{category}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Honeypot anti-bot field: kept off-screen (not display:none)
                  so it stays reachable like a normal field to autofill/bots,
                  but the label tells any real keyboard/screen-reader user to
                  leave it blank. */}
              <div className="hp-field">
                <label htmlFor="report-nettside">La dette feltet stå tomt</label>
                <input
                  id="report-nettside"
                  type="text"
                  name="nettside"
                  value={form.nettside}
                  onChange={updateField}
                  autoComplete="off"
                  tabIndex={-1}
                />
              </div>

              <div className="sheet-field">
                <div className="sheet-field__label-row">
                  <label htmlFor="report-description" className="sheet-field__label">Fortell kort</label>
                  <DictationButton
                    value={form.description}
                    onTranscript={(text) => setForm((current) => ({ ...current, description: text }))}
                  />
                </div>
                {primaryCategory && (
                  <div className="suggestion-chips" role="group" aria-label="Forslag til beskrivelse">
                    {descriptionSuggestions(primaryCategory).map((phrase) => {
                      const active = form.description.includes(phrase);
                      return (
                        <button
                          key={phrase}
                          type="button"
                          className={active ? 'suggestion-chip suggestion-chip--active' : 'suggestion-chip'}
                          aria-pressed={active}
                          onClick={() => toggleSuggestion(phrase)}
                        >
                          {phrase}
                        </button>
                      );
                    })}
                  </div>
                )}
                <textarea id="report-description" name="description" value={form.description} onChange={updateField} required minLength={3} maxLength={1200} placeholder="Hva gjør stedet utrygt?" />
              </div>

              <div className="sheet-field">
                <div className="image-row">
                  <span className="sheet-field__label">Legg til bilde <em>(valgfritt)</em></span>
                  <div className="image-row__actions">
                    <label className="ui-button ui-button-secondary image-pick">
                      Kamera
                      <input type="file" accept="image/*" capture="environment" onChange={addImages} disabled={isSubmitting || images.length >= REPORT_IMAGE_MAX_COUNT} />
                    </label>
                    <label className="ui-button ui-button-secondary image-pick">
                      Galleri
                      <input type="file" accept="image/*,.heic,.heif" multiple onChange={addImages} disabled={isSubmitting || images.length >= REPORT_IMAGE_MAX_COUNT} />
                    </label>
                  </div>
                </div>
                {images.length > 0 && (
                  <div className="image-preview-grid">
                    {images.map((image, index) => (
                      <figure className="image-preview" key={image.id}>
                        <img src={image.previewUrl} alt={`Valgt bilde ${index + 1}`} />
                        <button type="button" onClick={() => removeImage(image.id)} aria-label="Fjern bilde">×</button>
                      </figure>
                    ))}
                  </div>
                )}
              </div>

              {isAdult ? (
                <div className="sheet-field optional-contact">
                  <span className="sheet-field__label">Kontaktinfo <em>(frivillig)</em></span>
                  <input name="contact_name" value={form.contact_name} onChange={updateField} autoComplete="name" placeholder="Navn" />
                  <input name="contact_email" value={form.contact_email} onChange={updateField} type="email" autoComplete="email" placeholder="E-post" />
                  <input name="contact_phone" value={form.contact_phone} onChange={updateField} type="tel" autoComplete="tel" placeholder="Telefon" />
                </div>
              ) : (
                <p className="privacy-note">Du melder som barn. Vi spør ikke om navn, e-post eller telefon.</p>
              )}

              {status.type === 'error' && <div className="notice notice--error" role="status">{status.message}</div>}
            </div>

            <div className="sheet-footer">
              <button className="big-button big-button--primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? (status.message || 'Sender …') : 'Send melding'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
