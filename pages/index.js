import Head from 'next/head';
import Link from 'next/link';
import Logo from '../components/Logo';

export default function Home() {
  return (
    <>
      <Head>
        <title>Finns Fairway</title>
        <meta name="description" content="For en trygg og aktiv oppvekst. Meld fra om steder som føles utrygge i trafikken, eller se kart over meldinger." />
      </Head>
      <main className="page page--home">
        <section className="hero-card">
          <h1 className="hero-logo">
            <Logo size="lg" />
          </h1>
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
