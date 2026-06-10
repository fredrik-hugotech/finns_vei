import Head from 'next/head';
import Link from 'next/link';

export default function Meld() {
  return (
    <>
      <Head>
        <title>Meld fra – Finns vei</title>
      </Head>
      <main className="page">
        <section className="hero-card">
          <p className="eyebrow">Steg 1 av 2</p>
          <h1>Hvordan vil du melde?</h1>
          <p className="lede">Barn melder helt anonymt. Voksne kan legge igjen kontaktinfo, men det er frivillig.</p>
          <div className="choice-stack">
            <Link className="big-button big-button--primary" href="/meld/form?type=barn">Meld som barn</Link>
            <Link className="big-button big-button--secondary" href="/meld/form?type=voksen">Meld som voksen</Link>
          </div>
        </section>
      </main>
    </>
  );
}
