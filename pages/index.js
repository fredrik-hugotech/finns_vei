import Head from 'next/head';
import MapExperience from '../components/MapExperience';

export default function Home() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://finns-vei.vercel.app';
  const shareTitle = 'Finns.Vei – støtt trafikksak';
  const shareDescription = 'Se og støtt en trafikksikkerhetssak i kartet.';

  return (
    <>
      <Head>
        <title>Finns.Vei</title>
        <meta name="description" content={shareDescription} />
        <meta property="og:title" content={shareTitle} />
        <meta property="og:description" content={shareDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteUrl} />
        <meta property="og:image" content={`${siteUrl}/brand/finns-fairway-logo.svg`} />
      </Head>
      <MapExperience />
    </>
  );
}
