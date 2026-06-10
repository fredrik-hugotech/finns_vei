import Head from 'next/head';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { DEFAULT_CENTER, REPORT_CATEGORIES, REPORTER_TYPES } from '../../lib/config';

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
  const [status, setStatus] = useState({ type: 'idle', message: 'Trykk i kartet eller bruk posisjonen din.' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const positionText = useMemo(() => `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, [point]);

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
        setStatus({ type: 'success', message: 'Posisjon valgt.' });
      },
      () => setStatus({ type: 'error', message: 'Fikk ikke tilgang til posisjon. Trykk i kartet i stedet.' }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submitReport = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: 'idle', message: 'Sender meldingen...' });

    const body = {
      reporter_type: reporterType,
      category: form.category,
      description: form.description,
      lat: point.lat,
      lng: point.lng,
      contact_name: isAdult ? form.contact_name : '',
      contact_email: isAdult ? form.contact_email : '',
      contact_phone: isAdult ? form.contact_phone : '',
    };

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunne ikke sende meldingen');

      setForm(INITIAL_FORM);
      setStatus({ type: payload.warning ? 'warning' : 'success', message: payload.warning || 'Takk! Meldingen er sendt med status Ny.' });
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
          <Link href="/meld">Tilbake</Link>
          <span>{isAdult ? 'Voksen' : 'Barn'} · ingen innlogging</span>
        </header>

        <section className="form-layout">
          <div className="form-map-card">
            <ReportMap selectable point={point} onPointChange={setPoint} className="form-map" showReports={false} />
            <button className="geo-button" type="button" onClick={useMyPosition}>Bruk min posisjon</button>
          </div>

          <form className="report-form" onSubmit={submitReport}>
            <p className="eyebrow">Steg 2 av 2</p>
            <h1>Meld fra</h1>
            <label>
              Valgt sted
              <output>{positionText}</output>
            </label>

            <fieldset>
              <legend>Hva gjelder det?</legend>
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
              Kort beskrivelse
              <textarea name="description" value={form.description} onChange={updateField} required minLength={3} maxLength={1200} placeholder="Hva er farlig her?" />
            </label>

            {isAdult && (
              <div className="optional-contact">
                <h2>Kontaktinfo (frivillig)</h2>
                <label>Navn<input name="contact_name" value={form.contact_name} onChange={updateField} autoComplete="name" /></label>
                <label>E-post<input name="contact_email" value={form.contact_email} onChange={updateField} type="email" autoComplete="email" /></label>
                <label>Telefon<input name="contact_phone" value={form.contact_phone} onChange={updateField} type="tel" autoComplete="tel" /></label>
              </div>
            )}

            {!isAdult && <p className="privacy-note">Du melder som barn. Vi spør ikke om navn, e-post eller telefon.</p>}

            <button className="big-button big-button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sender...' : 'Send melding'}</button>
            <div className={`notice notice--${status.type}`} role="status">{status.message}</div>
          </form>
        </section>
      </main>
    </>
  );
}
