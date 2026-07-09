import { useEffect, useRef, useState } from 'react';
import { REPORT_CATEGORIES, REPORTER_TYPES } from '../lib/config';
import { categoryGlyph } from '../lib/reportCategoryGlyphs';
import { descriptionSuggestions } from '../lib/reportDescriptionSuggestions';
import { REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_COUNT } from '../lib/reportImages';
import { addMyReport } from '../lib/myReports';

// Coordinates → a human place ("Marviksveien · Lund") so the reporter can
// confirm they picked the right spot before sending.
async function reverseGeocode(lat, lng, token) {
  try {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=no&limit=1&types=address,street,neighborhood,locality,place`);
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
  category: REPORT_CATEGORIES[0],
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

export default function ReportSheet({ point, onClose, onSubmitted, onChangeLocation }) {
  const [reporterType, setReporterType] = useState(REPORTER_TYPES.ADULT);
  const [form, setForm] = useState(INITIAL_FORM);
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
    reverseGeocode(Number(point.lat), Number(point.lng), mapboxToken).then((p) => { if (!cancelled) setPlace(p); });
    return () => { cancelled = true; };
  }, [mapboxToken, point]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const selectCategory = (event) => {
    haptic(6);
    updateField(event);
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

  const submitReport = async (event) => {
    event.preventDefault();
    haptic(12);
    setIsSubmitting(true);
    setStatus({ type: 'idle', message: images.length ? 'Laster opp bilde …' : 'Sender meldingen …' });

    const body = new FormData();
    body.set('reporter_type', reporterType);
    body.set('category', form.category);
    body.set('description', form.description);
    body.set('lat', String(point.lat));
    body.set('lng', String(point.lng));
    body.set('contact_name', isAdult ? form.contact_name : '');
    body.set('contact_email', isAdult ? form.contact_email : '');
    body.set('contact_phone', isAdult ? form.contact_phone : '');
    body.set('nettside', form.nettside);
    images.forEach((image) => body.append('images', image.file));

    try {
      const response = await fetch('/api/report', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunne ikke sende meldingen');

      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setImages([]);
      setSubmitted(true);
      haptic([10, 40, 14]);
      setStatus({ type: payload.warning ? 'warning' : 'success', message: payload.warning || '' });
      try { addMyReport({ id: payload.id, category: form.category }); } catch (_e) { /* best effort */ }
      onSubmitted?.();
    } catch (error) {
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
            <div className="sheet-success__badge" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4 10-11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2>Takk for at du sier fra!</h2>
            <p>Meldingen er sendt til Finns Fairway.</p>
            {status.message && <div className={`notice notice--${status.type}`} role="status">{status.message}</div>}
            <div className="sheet-success__actions">
              <button type="button" className="big-button big-button--primary" onClick={resetAndClose}>Se på kartet</button>
              <button
                type="button"
                className="big-button big-button--secondary"
                onClick={() => { setSubmitted(false); setForm(INITIAL_FORM); setStatus({ type: 'idle', message: '' }); onChangeLocation?.(); }}
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
                <legend>Hva føles utrygt?</legend>
                <div className="category-grid">
                  {REPORT_CATEGORIES.map((category) => (
                    <label className={form.category === category ? 'category-card category-card--active' : 'category-card'} key={category}>
                      <input type="radio" name="category" value={category} checked={form.category === category} onChange={selectCategory} />
                      <span className="category-card__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: categoryGlyph(category) }} />
                      <span className="category-card__label">{category}</span>
                    </label>
                  ))}
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
                <label htmlFor="report-description" className="sheet-field__label">Fortell kort</label>
                {form.category && (
                  <div className="suggestion-chips" role="group" aria-label="Forslag til beskrivelse">
                    {descriptionSuggestions(form.category).map((phrase) => {
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
