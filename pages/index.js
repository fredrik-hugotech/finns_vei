import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>Finns vei</title>
        <meta name="description" content="Meld fra om farlige steder i trafikken, eller se kart over meldinger." />
      </Head>
      <main className="page page--home">
        <section className="hero-card">
          <p className="eyebrow">Trafikksikkerhet</p>
          <h1>Finns vei</h1>
          <p className="lede">Si fra om steder som føles farlige. Ingen innlogging.</p>
          <div className="choice-stack">
            <Link className="big-button big-button--primary" href="/meld">Meld fra</Link>
            <Link className="big-button big-button--secondary" href="/map">Se kart</Link>
          </div>
        </section>
      </main>
    </>
  );
}
