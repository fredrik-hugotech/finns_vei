import { useEffect, useState } from 'react';

// "Bygg embed-kode" panel on /statistikk: previews the live "Trygghetsbadge"
// (see pages/api/badge/status.js, an SVG stat badge rendered server-side) and
// offers copyable snippets so a school / neighbourhood-association / local
// news site can paste it into their own page, where it keeps updating itself.
//
// The badge image itself needs no client JS at all — this panel is just the
// thin wrapper that (a) builds the *absolute* embed URL (a snippet meant for
// someone else's site can't use a relative path) and (b) offers a
// copy-to-clipboard affordance, same feature-detected pattern as the "Del
// saken" share button on pages/sak/[id].js.
export default function BadgeEmbedPanel() {
  const [origin, setOrigin] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const badgeUrl = `${origin}/api/badge/status`;
  const pageUrl = `${origin}/statistikk`;
  const altText = 'Finns Fairway – antall meldinger og andel løst i Norge';
  const imgSnippet = `<a href="${pageUrl}" rel="noopener"><img src="${badgeUrl}" alt="${altText}" /></a>`;
  const iframeSnippet = `<iframe src="${badgeUrl}" title="Finns Fairway trygghetsbadge" style="border:0;width:260px;height:20px;" loading="lazy"></iframe>`;

  const handleCopy = async (text, message) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setToast(message);
      }
    } catch (error) {
      // Clipboard write blocked (e.g. insecure context/permissions) — the
      // snippet is still visible in the textarea for manual copy.
    }
  };

  return (
    <section className="stats-badge">
      <h2 className="stats-page__h2">Bygg embed-kode</h2>
      <p className="stats-page__note">
        Driver du en skole-, nabolags- eller lokalavisside? Lim inn denne badgen for å vise ferske tall om
        trafikksikkerhet – den oppdaterer seg selv, ingen vedlikehold nødvendig.
      </p>

      <div className="stats-badge__preview">
        {origin ? (
          // eslint-disable-next-line @next/next/no-img-element -- external-style embed preview, not a Next/Image asset
          <img src={badgeUrl} alt={altText} />
        ) : (
          <span className="comp-muted">Laster forhåndsvisning …</span>
        )}
      </div>

      <div className="stats-badge__snippet">
        <label htmlFor="stats-badge-img-code">Kode (bilde-lenke)</label>
        <textarea
          id="stats-badge-img-code"
          className="stats-badge__code"
          readOnly
          rows={2}
          value={imgSnippet}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className="ui-button ui-button-secondary"
          onClick={() => handleCopy(imgSnippet, 'Kode kopiert!')}
          disabled={!origin}
        >
          Kopier kode
        </button>
      </div>

      <details className="stats-badge__iframe">
        <summary>Alternativ: iframe-variant</summary>
        <textarea
          className="stats-badge__code"
          readOnly
          rows={2}
          value={iframeSnippet}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className="ui-button ui-button-secondary"
          onClick={() => handleCopy(iframeSnippet, 'iframe-kode kopiert!')}
          disabled={!origin}
        >
          Kopier iframe-kode
        </button>
      </details>

      {toast && (
        <div className="app-toast" role="status" onClick={() => setToast('')}>
          {toast}
        </div>
      )}
    </section>
  );
}
