import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import Logo from '../../components/Logo';
import ReadAloudButton from '../../components/ReadAloudButton';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { caseProgress } from '../../lib/processSteps';
import { getPublicReportById, listCaseAttachments, hasSupabaseConfig } from '../../lib/supabaseRest';

export default function SakPage({ report, shareUrl, ogImageUrl, photos }) {
  const meta = reportStatusMeta(report.status);
  const title = `Finns Fairway – ${report.category}`;
  const description = report.description
    ? report.description.slice(0, 180)
    : 'Meld fra om utrygge steder i trafikken, eller se kart over meldinger.';

  // Same "read this aloud" control as /bud, reused here so the status and
  // description of a case can be heard, not just read.
  const readAloudText = [
    `${report.category}.`,
    `Status: ${meta.label}.`,
    report.description || '',
    report.public_status_note ? `Oppdatering fra Finns Fairway: ${report.public_status_note}` : '',
  ].filter(Boolean).join(' ');

  // Feature-detected client-side so the button never renders as a dead no-op
  // on browsers without navigator.share or navigator.clipboard, and so the
  // server-rendered markup (no `navigator` on the server) matches the first
  // client render before hydration flips this on.
  const [canShare, setCanShare] = useState(false);
  const [toast, setToast] = useState('');
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && Boolean(navigator.share || navigator.clipboard?.writeText));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleShare = async () => {
    const shareData = {
      title,
      text: `${report.category} – status: ${meta.label}`,
      url: shareUrl,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setToast('Lenke kopiert!');
      }
    } catch (error) {
      // Share sheet cancelled by the user (or clipboard write blocked) — nothing to do.
    }
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        {/* Overrides the global user-scalable=no from _app.js — this page shows
            the public "bilder fra oppfølgingen" photo gallery, where visitors
            should be able to pinch-zoom, same as the backoffice attachment views. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="Finns Fairway" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <main className="page">
        <section className="hero-card share-card">
          <Logo size="md" />
          <span
            className={`status-pill status-pill--${meta.key}`}
            dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }}
          />
          <h1>{report.category}</h1>
          <ReadAloudButton text={readAloudText} label="Hør saken lest opp" />

          {(() => {
            const p = caseProgress(report.status);
            return (
              <div className="case-progress">
                <div className="case-progress__row">
                  <strong>Slik jobber vi videre</strong>
                  <span className="case-progress__count">Steg {p.done} av {p.total}</span>
                </div>
                <div className="case-progress__track"><span className="case-progress__fill" style={{ width: `${p.percent}%` }} /></div>
                <p className="case-progress__now"><span className="case-progress__dot" aria-hidden="true" />{p.current}</p>
                <p className="case-progress__next">{p.next ? `Neste: ${p.next}` : 'Saken er ferdig behandlet.'}</p>
              </div>
            );
          })()}

          {report.image_url && <img className="share-card__image" src={report.image_url} alt="" />}
          {report.description && <p className="share-card__text">{report.description}</p>}
          {report.public_status_note && (
            <div className="share-card__update">
              <strong>Oppdatering fra Finns Fairway</strong>
              <p>{report.public_status_note}</p>
            </div>
          )}
          {photos.length > 0 && (
            <div className="share-card__gallery">
              <strong className="share-card__gallery-title">Bilder fra oppfølgingen</strong>
              <div className="share-card__gallery-grid">
                {photos.map((photo) => (
                  <button
                    type="button"
                    key={photo.id}
                    className="share-card__gallery-thumb"
                    onClick={() => setLightbox(photo.url)}
                  >
                    <img src={photo.url} alt={photo.filename || ''} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <Link className="big-button big-button--primary" href={`/?sak=${encodeURIComponent(report.id)}`}>Åpne og støtt saken</Link>
          {canShare && (
            <button type="button" className="big-button big-button--secondary share-card__share" onClick={handleShare}>
              <Icon name="share" size={18} /> Del saken
            </button>
          )}
        </section>
      </main>
      {toast && <div className="app-toast" role="status" onClick={() => setToast('')}>{toast}</div>}
      {lightbox && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Bilde i full størrelse" />
          <button type="button" className="lightbox__close" aria-label="Lukk" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </>
  );
}

export async function getServerSideProps({ params, req, res }) {
  const id = String(params.id || '');
  if (!hasSupabaseConfig()) return { notFound: true };

  // getPublicReportById(id) and listCaseAttachments(id, ...) are independent
  // Supabase reads keyed off the same route id (getPublicReportById queries
  // by exact primary key, so report.id === id whenever a report is found) —
  // run them concurrently instead of sequentially.
  const [report, attachments] = await Promise.all([
    getPublicReportById(id).catch(() => null),
    listCaseAttachments(id, { publicOnly: true }).catch(() => []),
  ]);
  if (!report) return { notFound: true };

  // This is the URL embedded in every Trello card and every citizen "share"
  // tap, so link-preview bots and repeat visits each triggered a fresh SSR
  // render plus 2 live Supabase queries with no caching at all — unlike its
  // own OG-image sibling route (/api/og/sak/[id]), which already caches for
  // 300s. Same TTL here, only once we know the report actually exists (a
  // transient Supabase hiccup shouldn't get cached as a false "not found").
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  const firstImage = Array.isArray(report.image_urls)
    ? report.image_urls.find((image) => image && image.url)
    : null;

  // Staff-uploaded case attachments marked "public" (e.g. proof a hazard was
  // fixed).
  const photos = (Array.isArray(attachments) ? attachments : [])
    .filter((a) => a && a.url && String(a.content_type || '').startsWith('image/'))
    .map((a) => ({ id: a.id, url: a.url, filename: a.filename || null }));

  const safe = {
    id: report.id || id,
    category: report.category || 'Sak',
    description: report.description || '',
    status: report.status || 'Ny',
    image_url: firstImage ? firstImage.url : null,
    public_status_note: report.public_status_note || null,
  };

  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  const origin = `${proto}://${host}`;
  const shareUrl = `${origin}/sak/${safe.id}`;
  const ogImageUrl = `${origin}/api/og/sak/${encodeURIComponent(safe.id)}`;

  return { props: { report: safe, shareUrl, ogImageUrl, photos } };
}
