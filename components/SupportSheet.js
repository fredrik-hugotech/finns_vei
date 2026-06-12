import { useState } from 'react';
import { REPORT_CATEGORIES } from '../lib/config';
import { categoryGlyph } from '../lib/reportCategoryGlyphs';

function haptic(ms = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}

export default function SupportSheet({ reportId, supportToken, onClose, onDone }) {
  const [category, setCategory] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleCategory = (value) => {
    haptic(6);
    setCategory((current) => (current === value ? null : value));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    haptic(12);
    try {
      const response = await fetch('/api/report-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          supportToken,
          note: note.trim() || undefined,
          category: category || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.code || payload.error || 'Kunne ikke støtte saken');
      haptic([10, 40, 14]);
      onDone?.(payload);
    } catch (err) {
      setError(err.message || 'Noe gikk galt.');
      setSubmitting(false);
    }
  };

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Støtt saken">
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet">
        <button type="button" className="sheet__handle" aria-label="Lukk" onClick={onClose} />
        <form className="sheet-form" onSubmit={submit}>
          <div className="sheet-scroll">
            <div className="support-intro">
              <h2>Støtt denne saken</h2>
              <p>Si gjerne hva som bekymrer deg – det hjelper saksbehandler å se hele bildet. Alt er valgfritt.</p>
            </div>

            <fieldset className="sheet-field">
              <legend>Hva bekymrer deg? <em>(valgfritt)</em></legend>
              <div className="category-grid">
                {REPORT_CATEGORIES.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={category === value ? 'category-card category-card--active' : 'category-card'}
                    onClick={() => toggleCategory(value)}
                  >
                    <span className="category-card__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: categoryGlyph(value) }} />
                    <span className="category-card__label">{value}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="sheet-field">
              <span className="sheet-field__label">Din vinkel <em>(valgfritt)</em></span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} placeholder="F.eks. mangler nedsenket fortauskant for syklister …" />
            </label>

            {error && <div className="notice notice--error" role="status">{error}</div>}
          </div>

          <div className="sheet-footer">
            <button className="big-button big-button--primary" type="submit" disabled={submitting}>
              {submitting ? 'Sender …' : 'Send støtte'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
