import Head from 'next/head';
import Link from 'next/link';

export default function Meld() {
  return (
    <>
      <Head>
        <title>Meld fra – Finns.Vei</title>
      </Head>
      <main className="page">
        <section className="hero-card">
          <h1>Meld fra</h1>
          <p className="lede">Velg hvem som melder.</p>
          <div className="choice-stack">
            <Link className="big-button big-button--primary" href="/meld/form?type=barn">Barn</Link>
            <Link className="big-button big-button--secondary" href="/meld/form?type=voksen">Voksen</Link>
          </div>
        </section>
      </main>
    </>
  );
}
