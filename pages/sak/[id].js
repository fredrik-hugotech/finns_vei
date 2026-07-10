import Head from 'next/head';
import Link from 'next/link';
import Logo from '../../components/Logo';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { getPublicReportById, hasSupabaseConfig } from '../../lib/supabaseRest';
import { normalizeImageEntries } from '../../lib/reportImages';

export default function SakPage({ report, shareUrl, ogImageUrl }) {
  const meta = reportStatusMeta(report.status);
  const title = `Finns Fairway – ${report.category}`;
  const description = report.description
    ? report.description.slice(0, 180)
    : 'Meld fra om utrygge steder i trafikken, eller se kart over meldinger.';
  // Before/after proof: once staff have added a resolution photo, replace the
  // single hero image with a Før/Etter comparison instead of showing the
  // "before" photo twice. Cases without a resolution photo render exactly as
  // before (no empty section, no layout change).
  const hasResolution = report.resolution_image_urls.length > 0;

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
          {report.image_url && !hasResolution && <img className="share-card__image" src={report.image_url} alt="" />}
          {hasResolution && (
            <div className="share-card__beforeafter">
              <div className="share-card__ba-col">
                <span className="share-card__ba-label">Før</span>
                {report.image_url
                  ? <img className="share-card__ba-img" src={report.image_url} alt="Bilde ved melding" />
                  : <div className="share-card__ba-placeholder">Ingen bilde ved melding</div>}
              </div>
              <div className="share-card__ba-col">
                <span className="share-card__ba-label">Etter</span>
                <img className="share-card__ba-img" src={report.resolution_image_urls[0]} alt="Bilde etter utbedring" />
              </div>
            </div>
          )}
          {report.description && <p className="share-card__text">{report.description}</p>}
          {report.public_status_note && (
            <div className="share-card__update">
              <strong>Oppdatering fra Finns.Fairway</strong>
              <p>{report.public_status_note}</p>
            </div>
          )}
          <Link className="big-button big-button--primary" href={`/?sak=${encodeURIComponent(report.id)}`}>Åpne og støtt saken</Link>
        </section>
      </main>
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

  const images = normalizeImageEntries(report.image_urls);
  // resolution_image_urls may be undefined on Supabase deployments that
  // haven't run the migration yet (see README) — normalizeImageEntries
  // treats that the same as "no resolution photos" instead of throwing.
  const resolutionImages = normalizeImageEntries(report.resolution_image_urls);

  const safe = {
    id: report.id || id,
    category: report.category || 'Sak',
    description: report.description || '',
    status: report.status || 'Ny',
    image_url: images[0]?.url || null,
    public_status_note: report.public_status_note || null,
    resolution_image_urls: resolutionImages.map((img) => img.url).filter(Boolean),
  };

  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  const origin = `${proto}://${host}`;
  const shareUrl = `${origin}/sak/${safe.id}`;
  const ogImageUrl = `${origin}/api/og/sak/${encodeURIComponent(safe.id)}`;

  return { props: { report: safe, shareUrl, ogImageUrl } };
}
