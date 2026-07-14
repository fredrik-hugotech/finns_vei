import { useEffect, useState } from 'react';

// Gentle "add to home screen" helper. Non-intrusive: a slim, dismissible
// one-time ribbon, plus a steps sheet that can also be reopened any time from
// the top-bar "Installer app" link (via the 'ff-open-install' event). Hidden
// entirely once the app is already installed (standalone display mode).
const DISMISS_KEY = 'ff-install-dismissed';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}
function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function Mark() {
  return (
    <svg className="install-hint__mark" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="33.5" cy="14.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="14.5" cy="33.5" r="7" fill="currentColor" />
      <circle cx="33.5" cy="33.5" r="7" fill="currentColor" />
    </svg>
  );
}

export default function InstallHint() {
  const [steps, setSteps] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (isStandalone()) return undefined;
    setIos(isIOS());
    const onBIP = (e) => { e.preventDefault(); setDeferred(e); };
    const openSteps = () => setSteps(true);
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('ff-open-install', openSteps);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('ff-open-install', openSteps);
    };
  }, []);

  const primary = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (_e) { /* ignore */ }
      setDeferred(null);
      setSteps(false);
    } else {
      setSteps(true);
    }
  };

  return (
    <>

      {steps && (
        <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Legg til på hjemskjerm">
          <div className="sheet-backdrop" onClick={() => setSteps(false)} />
          <section className="sheet install-steps">
            <button type="button" className="case-sheet__close" aria-label="Lukk" onClick={() => setSteps(false)}>
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></svg>
            </button>
            <div className="install-steps__body">
              <span className="install-steps__logo" aria-hidden="true"><Mark /></span>
              <h2>Legg appen på hjemskjermen</h2>
              <p>Da åpner Finns Fairway seg i fullskjerm, som en vanlig app.</p>
              {ios ? (
                <>
                  <p className="install-steps__os">På iPhone (Safari)</p>
                  <ol className="install-steps__list">
                    <li>Trykk <b>Del</b>-knappen
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v13M8 7l4-4 4 4M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" /></svg>
                      nederst i Safari.</li>
                    <li>Bla ned og velg <b>Legg til på Hjem-skjerm</b></li>
                    <li>Trykk <b>Legg til</b> oppe til høyre.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="install-steps__os">På Android (Chrome)</p>
                  {deferred ? (
                    <>
                      <p className="install-steps__lead">Trykk knappen under, og bekreft med <b>Installer</b> i vinduet som spretter opp.</p>
                      <button type="button" className="big-button big-button--primary" onClick={primary}>Installer app</button>
                    </>
                  ) : (
                    <ol className="install-steps__list">
                      <li>Trykk <b>meny</b> (⋮) oppe til høyre i Chrome.</li>
                      <li>Velg <b>Installer app</b> (eller <b>Legg til på startskjerm</b>).</li>
                      <li>Bekreft med <b>Installer</b> / <b>Legg til</b>.</li>
                    </ol>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
