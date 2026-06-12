import Head from 'next/head';
import Link from 'next/link';
import Logo from '../../components/Logo';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { getPublicReportById, hasSupabaseConfig } from '../../lib/supabaseRest';

export default function SakPage({ report, shareUrl }) {
  const meta = reportStatusMeta(report.status);
  const title = `Finns Fairway – ${report.category}`;
  const description = report.description
    ? report.description.slice(0, 180)
    : 'Meld fra om utrygge steder i trafikken, eller se kart over meldinger.';

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
        {report.image_url && <meta property="og:image" content={report.image_url} />}
        <meta name="twitter:card" content={report.image_url ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {report.image_url && <meta name="twitter:image" content={report.image_url} />}
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
          <Link className="big-button big-button--primary" href="/">Åpne i kartet</Link>
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
  const shareUrl = `${proto}://${host}/sak/${safe.id}`;

  return { props: { report: safe, shareUrl } };
}
