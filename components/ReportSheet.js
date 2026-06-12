import { useMemo, useState } from 'react';
import { REPORT_CATEGORIES, REPORTER_TYPES } from '../lib/config';
import { categoryGlyph } from '../lib/reportCategoryGlyphs';
import { REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_COUNT } from '../lib/reportImages';

const INITIAL_FORM = {
  category: REPORT_CATEGORIES[0],
  description: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
};

export default function ReportSheet({ point, onClose, onSubmitted, onChangeLocation }) {
  const [reporterType, setReporterType] = useState(REPORTER_TYPES.ADULT);
  const [form, setForm] = useState(INITIAL_FORM);
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isAdult = reporterType === REPORTER_TYPES.ADULT;
  const positionText = useMemo(() => `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, [point]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
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

  const resetAndClose = () => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    onClose?.();
  };

  const submitReport = async (event) => {
    event.preventDefault();
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
    images.forEach((image) => body.append('images', image.file));

    try {
      const response = await fetch('/api/report', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunne ikke sende meldingen');

      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setImages([]);
      setSubmitted(true);
      setStatus({ type: payload.warning ? 'warning' : 'success', message: payload.warning || '' });
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
      <section className="sheet">
        <button type="button" className="sheet__handle" aria-label="Lukk" onClick={resetAndClose} />

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
            <header className="sheet__header">
              <h2>Meld fra</h2>
              <button type="button" className="sheet__location" onClick={onChangeLocation}>
                <span>{positionText}</span>
                <span className="sheet__location-edit">Endre sted</span>
              </button>
            </header>

            <div className="segmented" role="tablist" aria-label="Hvem melder">
              <button type="button" role="tab" aria-selected={!isAdult} className={!isAdult ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => setReporterType(REPORTER_TYPES.CHILD)}>Barn</button>
              <button type="button" role="tab" aria-selected={isAdult} className={isAdult ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => setReporterType(REPORTER_TYPES.ADULT)}>Voksen</button>
            </div>

            <fieldset className="sheet-field">
              <legend>Hva føles utrygt?</legend>
              <div className="category-grid">
                {REPORT_CATEGORIES.map((category) => (
                  <label className={form.category === category ? 'category-card category-card--active' : 'category-card'} key={category}>
                    <input type="radio" name="category" value={category} checked={form.category === category} onChange={updateField} />
                    <span className="category-card__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: categoryGlyph(category) }} />
                    <span className="category-card__label">{category}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="sheet-field">
              <span className="sheet-field__label">Fortell kort</span>
              <textarea name="description" value={form.description} onChange={updateField} required minLength={3} maxLength={1200} placeholder="Hva gjør stedet utrygt?" />
            </label>

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
