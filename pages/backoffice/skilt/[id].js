import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import Logo from '../../../components/Logo';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { encodeQrSvg } from '../../../lib/qrEncode';
import { categoryGlyph } from '../../../lib/reportCategoryGlyphs';
import { reportStatusMeta } from '../../../lib/reportStatusMeta';
import { siteBaseUrl } from '../../../lib/reportWorkflow';
import { getReportById, hasSupabaseConfig } from '../../../lib/supabaseRest';

const GREEN = '#0b5d4d';
const GREEN_DARK = '#08463a';
const CREAM = '#f4f6f2';

function shortId(id) {
  return String(id || '').split('-')[0] || String(id || '').slice(0, 8);
}

// "Trygghetsskilt" — a print-ready A4/A5 poster with a QR code that opens
// the case's public page (/sak/[id]). Staff generate this from the case
// workspace (CaseAdminPanel's "Skriv ut skilt" button), print it, and post
// it near the real-world hazard so passersby can scan it to see live status
// or add their own supporting voice.
export default function SkiltPage({ authorized, notFound, report, publicUrl, qrSvg }) {
  const [size, setSize] = useState('a4');

  if (!authorized) {
    return (
      <main className="skilt-guard">
        <Logo size="sm" />
        <p>Du må være logget inn som ansatt for å åpne dette skiltet.</p>
        <Link className="big-button big-button--primary" href="/backoffice">Gå til innlogging</Link>
        <style jsx>{`
          .skilt-guard { align-items: center; display: grid; gap: 1rem; justify-items: center; margin: 20vh auto; max-width: 320px; padding: 1rem; text-align: center; }
        `}</style>
      </main>
    );
  }

  if (notFound || !report) {
    return (
      <main className="skilt-guard">
        <p>Fant ikke saken.</p>
        <Link className="big-button big-button--secondary" href="/backoffice">‹ Tilbake til dashbord</Link>
        <style jsx>{`
          .skilt-guard { align-items: center; display: grid; gap: 1rem; justify-items: center; margin: 20vh auto; max-width: 320px; padding: 1rem; text-align: center; }
        `}</style>
      </main>
    );
  }

  const meta = reportStatusMeta(report.status);
  const glyph = categoryGlyph(report.category);

  return (
    <>
      <Head>
        <title>Trygghetsskilt – {report.category}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className={`skilt-shell skilt-shell--${size}`}>
        <div className="skilt-toolbar no-print">
          <Link className="skilt-toolbar__back" href={`/backoffice/sak/${encodeURIComponent(report.id)}`}>‹ Tilbake til saken</Link>
          <div className="skilt-toolbar__sizes" role="group" aria-label="Skiltstørrelse">
            <button type="button" className={size === 'a4' ? 'skilt-toolbar__size skilt-toolbar__size--on' : 'skilt-toolbar__size'} onClick={() => setSize('a4')}>A4</button>
            <button type="button" className={size === 'a5' ? 'skilt-toolbar__size skilt-toolbar__size--on' : 'skilt-toolbar__size'} onClick={() => setSize('a5')}>A5</button>
          </div>
          <button type="button" className="skilt-toolbar__print" onClick={() => window.print()}>Skriv ut</button>
        </div>

        <section className="skilt-poster" aria-label="Trygghetsskilt">
          <header className="skilt-poster__brand">
            <Logo size="sm" />
          </header>

          <div className="skilt-poster__category">
            <span className="skilt-poster__icon" dangerouslySetInnerHTML={{ __html: glyph }} />
            <h1>{report.category}</h1>
          </div>

          <p className="skilt-poster__lede">
            Er dette et utrygt sted i trafikken? Skann koden for å se status på saken —
            eller legg til din egen stemme.
          </p>

          <div className="skilt-poster__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />

          <p className="skilt-poster__url">{publicUrl}</p>

          <footer className="skilt-poster__footer">
            <span className={`skilt-poster__status skilt-poster__status--${meta.key}`}>{meta.label}</span>
            <span className="skilt-poster__caseid">Sak #{shortId(report.id)}</span>
            <span className="skilt-poster__site">finns-fairway.no</span>
          </footer>
        </section>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 0; size: ${size === 'a5' ? 'A5' : 'A4'} portrait; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .rotate-lock { display: none !important; }
        }
      `}</style>

      <style jsx>{`
        .skilt-shell {
          background: #e7e9e4;
          box-sizing: border-box;
          display: grid;
          justify-items: center;
          min-height: 100vh;
          padding: 1.25rem 1rem 2.5rem;
        }
        .skilt-toolbar {
          align-items: center;
          background: #fff;
          border-radius: 999px;
          box-shadow: 0 6px 18px rgba(11, 93, 77, 0.14);
          display: flex;
          gap: 0.6rem;
          margin-bottom: 1.25rem;
          max-width: 640px;
          padding: 0.5rem 0.6rem 0.5rem 1rem;
          width: 100%;
        }
        .skilt-toolbar__back { color: ${GREEN}; font-size: 0.9rem; font-weight: 700; text-decoration: none; white-space: nowrap; }
        .skilt-toolbar__sizes { display: flex; flex: 1; gap: 0.3rem; justify-content: center; }
        .skilt-toolbar__size {
          background: #f1f3ee; border: none; border-radius: 999px; color: ${GREEN_DARK};
          cursor: pointer; font-size: 0.85rem; font-weight: 700; padding: 0.4rem 0.85rem;
        }
        .skilt-toolbar__size--on { background: ${GREEN}; color: #fff; }
        .skilt-toolbar__print {
          background: ${GREEN}; border: none; border-radius: 999px; color: #fff; cursor: pointer;
          font-size: 0.9rem; font-weight: 700; padding: 0.55rem 1.1rem; white-space: nowrap;
        }

        .skilt-poster {
          background: #fff;
          box-shadow: 0 12px 32px rgba(11, 93, 77, 0.18);
          box-sizing: border-box;
          display: grid;
          gap: 1.4rem;
          justify-items: center;
          padding: 3rem 2.6rem;
          text-align: center;
        }
        /* A4 portrait at 96dpi CSS px (210mm x 297mm ≈ 794 x 1123px) */
        .skilt-shell--a4 .skilt-poster { width: 794px; min-height: 1123px; }
        /* A5 portrait ≈ 559 x 794px */
        .skilt-shell--a5 .skilt-poster { width: 559px; min-height: 794px; padding: 2.1rem 1.8rem; }
        .skilt-shell--a5 .skilt-poster__icon { width: 64px; height: 64px; }
        .skilt-shell--a5 .skilt-poster__category h1 { font-size: 1.9rem; }
        .skilt-shell--a5 .skilt-poster__qr :global(svg) { width: 260px; height: 260px; }

        .skilt-poster__category { align-items: center; display: grid; gap: 0.6rem; justify-items: center; }
        .skilt-poster__icon {
          align-items: center; background: ${CREAM}; border-radius: 50%; color: ${GREEN};
          display: flex; height: 88px; justify-content: center; width: 88px;
        }
        .skilt-poster__icon :global(svg) { height: 46px; width: 46px; }
        .skilt-poster__category h1 { color: ${GREEN_DARK}; font-family: var(--font-heading, inherit); font-size: 2.4rem; margin: 0; }

        .skilt-poster__lede { color: #33473f; font-size: 1.15rem; line-height: 1.5; margin: 0; max-width: 34ch; }

        .skilt-poster__qr { display: flex; justify-content: center; }
        .skilt-poster__qr :global(svg) { height: 340px; width: 340px; }

        .skilt-poster__url { color: #6b7a73; font-size: 0.85rem; margin: 0; word-break: break-all; }

        .skilt-poster__footer {
          align-items: center; border-top: 1px solid #e2e6de; display: flex; gap: 0.7rem;
          justify-content: center; margin-top: auto; padding-top: 1.2rem; width: 100%;
        }
        .skilt-poster__status {
          background: ${CREAM}; border-radius: 999px; color: ${GREEN_DARK}; font-size: 0.82rem;
          font-weight: 700; padding: 0.28rem 0.75rem;
        }
        .skilt-poster__caseid, .skilt-poster__site { color: #8a978f; font-size: 0.82rem; }

        @media print {
          .skilt-shell { background: #fff; min-height: 0; padding: 0; }
          .skilt-poster { box-shadow: none; margin: 0; }
        }
      `}</style>
    </>
  );
}

export async function getServerSideProps({ params, req, query }) {
  const id = String(params?.id || '');
  // `context.req` (unlike an API route's request) doesn't come with `.query`
  // pre-parsed — Next.js exposes that separately as `context.query` — but
  // isAdminRequest()/isBackofficeAuthorized() expect `req.query.secret`.
  // Adapt a minimal object carrying both so the same shared secret/cookie
  // auth check works unchanged here.
  const authRequest = { query: query || {}, headers: req.headers };
  const authorized = await isAdminRequest(authRequest);
  if (!authorized) {
    return { props: { authorized: false } };
  }

  if (!id || !hasSupabaseConfig()) {
    return { props: { authorized: true, notFound: true } };
  }

  let reportRow = null;
  try {
    reportRow = await getReportById(id);
  } catch (_error) {
    reportRow = null;
  }
  if (!reportRow) {
    return { props: { authorized: true, notFound: true } };
  }

  // Same base-URL resolution used everywhere else public case links are
  // built (Trello card links, README docs): PUBLIC_BASE_URL /
  // NEXT_PUBLIC_SITE_URL, then Vercel's own URL env vars. Falls back to the
  // incoming request's own host only when none of those are configured
  // (e.g. local `next dev`), so the QR always encodes a real, reachable URL.
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  const requestOrigin = host ? `${proto}://${host}` : '';
  const baseUrl = siteBaseUrl() || requestOrigin;
  const publicUrl = `${baseUrl}/sak/${encodeURIComponent(id)}`;

  const qrSvg = encodeQrSvg(publicUrl, { errorCorrectionLevel: 'M', moduleSize: 8, margin: 3 });

  return {
    props: {
      authorized: true,
      report: {
        id: reportRow.id || id,
        category: reportRow.category || 'Melding',
        description: reportRow.description || '',
        status: reportRow.status || 'Ny',
      },
      publicUrl,
      qrSvg,
    },
  };
}
