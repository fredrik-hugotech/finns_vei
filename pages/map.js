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
        <title>Kart – Finns vei</title>
      </Head>
      <main className="map-page">
        <ReportMap className="map-canvas" enableNvdbLayers />
        <section className="map-overlay">
          <Link href="/" className="back-link">Tilbake</Link>
          <h1>Se kart</h1>
          <p>Trykk på et punkt for å se status, kategori og beskrivelse.</p>
          <div className="legend">
            <span><i className="dot dot--new" />Ny</span>
            <span><i className="dot dot--registered" />Registrert</span>
            <span><i className="dot dot--started" />Startet</span>
            <span><i className="dot dot--done" />Fullført</span>
          </div>
        </section>
      </main>
    </>
  );
}
