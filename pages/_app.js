import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/globals.css';
import Head from 'next/head';
import { useEffect } from 'react';
import { Inter, Poppins } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    // Best-effort orientation lock (Android/standalone). iOS ignores this — the
    // CSS rotate overlay below is the reliable cross-platform guarantee.
    try { window.screen?.orientation?.lock?.('portrait').catch(() => {}); } catch (_e) { /* ignore */ }
  }, []);

  return (
    <div className={`${inter.variable} ${poppins.variable}`}>
      <Head>
        {/* Permissive by default: pinch-zoom stays enabled everywhere except the
            Mapbox map pages, which set their own restrictive viewport meta
            (see pages/index.js, pages/sykle.js, pages/backoffice/tetthet.js)
            to keep pinch gestures from fighting the map's own pan/zoom. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
      </Head>
      <Component {...pageProps} />
      <div className="rotate-lock" role="alertdialog" aria-label="Snu telefonen til stående">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
          <path d="M12 18.4h.01" />
          <path d="M3.5 9a9 9 0 0 1 3-3M20.5 15a9 9 0 0 1-3 3" />
        </svg>
        <strong>Snu telefonen</strong>
        <span>Finns Fairway brukes stående.</span>
      </div>
    </div>
  );
}
