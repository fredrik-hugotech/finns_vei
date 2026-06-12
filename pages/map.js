import Head from 'next/head';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const ReportMap = dynamic(() => import('../components/ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart...</div>,
});

export default function MapPage() {
  return (
    <>
      <Head>
        <title>Kart – Finns Fairway</title>
      </Head>
      <main className="map-page">
        <ReportMap className="map-canvas" enableNvdbLayers />
        <section className="map-header map-overlay" aria-label="Kartnavigasjon">
          <Link href="/" className="back-link">Tilbake</Link>
          <h1>Kart</h1>
        </section>
      </main>
    </>
  );
}
