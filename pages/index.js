import Head from 'next/head';
import dynamic from 'next/dynamic';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div className="loading-state">Laster kart...</div>,
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Finns vei – trafikksikkerhet</title>
        <meta name="description" content="Mobil web-kart for innmelding av trafikksikkerhetspunkter til Supabase og Trello." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Map />
    </>
  );
}
