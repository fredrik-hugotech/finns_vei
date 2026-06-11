import Head from 'next/head';
import MapExperience from '../components/MapExperience';

export default function MapPage() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://finns-vei.vercel.app';
  const shareTitle = 'Finns.Vei – støtt trafikksak';
  const shareDescription = 'Se og støtt en trafikksikkerhetssak i kartet.';

  return (
    <>
      <Head>
        <title>Kart – Finns vei</title>
        <meta name="description" content={shareDescription} />
        <meta property="og:title" content={shareTitle} />
        <meta property="og:description" content={shareDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/map`} />
        <meta property="og:image" content={`${siteUrl}/brand/finns-fairway-logo.svg`} />
      </Head>
      <MapExperience />
    </>
  );
}
