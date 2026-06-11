import Head from 'next/head';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { DEFAULT_CENTER, REPORT_CATEGORIES, REPORTER_TYPES } from '../../lib/config';
import { REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_COUNT } from '../../lib/reportImages';

const ReportMap = dynamic(() => import('../../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart...</div>,
});

const INITIAL_FORM = {
  category: REPORT_CATEGORIES[0],
  description: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
};

export default function MeldForm() {
  const router = useRouter();
  const reporterType = router.query.type === REPORTER_TYPES.ADULT ? REPORTER_TYPES.ADULT : REPORTER_TYPES.CHILD;
  const isAdult = reporterType === REPORTER_TYPES.ADULT;
  const [point, setPoint] = useState({ lng: DEFAULT_CENTER[0], lat: DEFAULT_CENTER[1] });
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState([]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const useMyPosition = () => {
    if (!navigator.geolocation) {
      setStatus({ type: 'error', message: 'Nettleseren støtter ikke posisjon.' });
      return;
    }

    setStatus({ type: 'idle', message: 'Henter posisjon...' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus({ type: 'idle', message: '' });
      },
      () => setStatus({ type: 'error', message: 'Fikk ikke tilgang til posisjon. Trykk i kartet i stedet.' }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
    setIsSubmitting(true);
    setStatus({ type: 'idle', message: 'Sender meldingen...' });

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
      if (images.length) setStatus({ type: 'idle', message: 'Laster opp bilde …' });
      const response = await fetch('/api/report', {
        method: 'POST',
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunne ikke sende meldingen');

      setForm(INITIAL_FORM);
      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setImages([]);
      setStatus({ type: payload.warning ? 'warning' : 'success', message: payload.warning || 'Takk for at du sier fra!' });
      router.push(payload.id ? `/?report=${encodeURIComponent(payload.id)}` : '/');
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Noe gikk galt.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Skjema – Finns vei</title>
      </Head>
      <main className="form-page">
        <header className="top-bar">
          <Link href="/">Tilbake</Link>
        </header>

        <section className="form-layout">
          <div className="form-map-card">
            <ReportMap selectable point={point} onPointChange={setPoint} className="form-map" showReports reportPopupMode="reporting" />
            <div className="selected-place-pill" aria-live="polite">✓ Sted valgt</div>
            <button className="geo-button" type="button" onClick={useMyPosition}>Bruk min posisjon</button>
          </div>

          <form className="report-form" onSubmit={submitReport}>
            <h1>Meld fra</h1>

            <fieldset>
              <legend>Hva føles utrygt?</legend>
              <div className="chip-grid">
                {REPORT_CATEGORIES.map((category) => (
                  <label className="chip" key={category}>
                    <input type="radio" name="category" value={category} checked={form.category === category} onChange={updateField} />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label>
              Fortell kort
              <textarea name="description" value={form.description} onChange={updateField} required minLength={3} maxLength={1200} placeholder="Hva gjør stedet utrygt?" />
            </label>

            <section className="image-upload-card" aria-labelledby="image-upload-title">
              <div>
                <h2 id="image-upload-title">Bilde</h2>
              </div>
              <div className="image-upload-actions">
                <label className="image-upload-button">
                  Kamera
                  <input type="file" accept="image/*" capture="environment" onChange={addImages} disabled={isSubmitting || images.length >= REPORT_IMAGE_MAX_COUNT} />
                </label>
                <label className="image-upload-button image-upload-button--secondary">
                  Bilder
                  <input type="file" accept="image/*,.heic,.heif" multiple onChange={addImages} disabled={isSubmitting || images.length >= REPORT_IMAGE_MAX_COUNT} />
                </label>
              </div>
              {images.length > 0 && (
                <div className="image-preview-grid">
                  {images.map((image, index) => (
                    <figure className="image-preview" key={image.id}>
                      <img src={image.previewUrl} alt={`Valgt bilde ${index + 1}`} />
                      <figcaption>{Math.round(image.file.size / 1024)} KB</figcaption>
                      <button type="button" onClick={() => removeImage(image.id)}>Fjern</button>
                    </figure>
                  ))}
                </div>
              )}
            </section>

            {isAdult && (
              <div className="optional-contact">
                <h2>Kontaktinfo (frivillig)</h2>
                <label>Navn<input name="contact_name" value={form.contact_name} onChange={updateField} autoComplete="name" /></label>
                <label>E-post<input name="contact_email" value={form.contact_email} onChange={updateField} type="email" autoComplete="email" /></label>
                <label>Telefon<input name="contact_phone" value={form.contact_phone} onChange={updateField} type="tel" autoComplete="tel" /></label>
              </div>
            )}


            <button className="big-button big-button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sender...' : 'Send melding'}</button>
            {status.message && <div className={`notice notice--${status.type}`} role="status">{status.message}</div>}
          </form>
        </section>
      </main>
    </>
  );
}
