import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>Finns.Vei</title>
        <meta name="description" content="Meld fra om farlige steder i trafikken, eller se kart over meldinger." />
      </Head>
      <main className="page page--home">
        <section className="hero-card">
          <h1>Finns.Vei</h1>
          <p className="lede">Meld fra om steder som føles utrygge.</p>
          <div className="choice-stack">
            <Link className="big-button big-button--primary" href="/meld">Meld fra</Link>
            <Link className="big-button big-button--secondary" href="/map">Se kart</Link>
          </div>
        </section>
      </main>
    </>
  );
}
