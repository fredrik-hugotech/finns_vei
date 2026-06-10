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
          <div className="brand-mark"><img src="/brand/finns-fairway-logo.svg" alt="Finns.Fairway" /><span className="brand-mark__text">For en trygg og aktiv oppvekst</span></div>
          <p className="eyebrow">Tryggere vei for barn og unge</p>
          <h1>Ser du et sted som føles utrygt?</h1>
          <p className="lede">Meld fra om farlige kryss, høy fart, dårlig sikt eller andre steder barn og unge bør ferdes tryggere.</p>
          <div className="choice-stack">
            <Link className="big-button big-button--primary" href="/meld">Meld fra</Link>
            <Link className="big-button big-button--secondary" href="/map">Se kart</Link>
          </div>
        </section>
      </main>
    </>
  );
}
