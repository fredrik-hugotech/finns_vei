import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import Logo from '../../components/Logo';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { getPublicReportById, hasSupabaseConfig } from '../../lib/supabaseRest';

export default function SakPage({ report, shareUrl, ogImageUrl }) {
  const meta = reportStatusMeta(report.status);
  const title = `Finns Fairway – ${report.category}`;
  const description = report.description
    ? report.description.slice(0, 180)
    : 'Meld fra om utrygge steder i trafikken, eller se kart over meldinger.';

  // Feature-detected client-side so the button never renders as a dead no-op
  // on browsers without navigator.share or navigator.clipboard, and so the
  // server-rendered markup (no `navigator` on the server) matches the first
  // client render before hydration flips this on.
  const [canShare, setCanShare] = useState(false);
  const [toast, setToast] = useState('');

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
          {report.image_url && <img className="share-card__image" src={report.image_url} alt="" />}
          {report.description && <p className="share-card__text">{report.description}</p>}
          {report.public_status_note && (
            <div className="share-card__update">
              <strong>Oppdatering fra Finns.Fairway</strong>
              <p>{report.public_status_note}</p>
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
    </>
  );
}

export async function getServerSideProps({ params, req }) {
  const id = String(params.id || '');
  if (!hasSupabaseConfig()) return { notFound: true };

  let report = null;
  try {
    report = await getPublicReportById(id);
  } catch (error) {
    report = null;
  }
  if (!report) return { notFound: true };

  const firstImage = Array.isArray(report.image_urls)
    ? report.image_urls.find((image) => image && image.url)
    : null;

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

  return { props: { report: safe, shareUrl, ogImageUrl } };
}
