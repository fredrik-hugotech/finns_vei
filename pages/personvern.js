import Head from 'next/head';
import Link from 'next/link';
import Logo from '../components/Logo';

const POINTS = [
  {
    title: 'Vi lagrer ikke personopplysninger om barn',
    body: 'Når et barn melder fra om et utrygt sted, spør vi aldri om navn, e-post eller telefon. Meldingen er anonym.',
  },
  {
    title: 'Voksne bestemmer selv',
    body: 'En voksen kan legge igjen kontaktinfo hvis de vil bli kontaktet om saken – men det er helt frivillig. Uten det er også voksnes meldinger anonyme.',
  },
  {
    title: 'Området rundt hjemmet skjules',
    body: 'Når du logger en gå- eller sykkeltur, beskyttes de første ~150 meterne fra der du starter (ofte hjemme). Det punktet lagres aldri nøyaktig – det rundes av til et grovt rutenett før noe sendes.',
  },
  {
    title: 'Ruten bearbeides på telefonen din',
    body: 'Selve ruten klippes og avrundes lokalt på enheten før den sendes. Vi lagrer bare grove, anonyme spor som viser hvor mange som sykler og går – ikke hvem, og ikke nøyaktig hvor du bor.',
  },
  {
    title: 'Ingen sporing og ingen deling',
    body: 'Vi bruker ikke annonsesporing, og vi selger eller deler ikke data. Lista over dine egne turer og meldinger ligger kun i din egen nettleser.',
  },
];

export default function Personvern() {
  return (
    <>
      <Head>
        <title>Personvern – Finns Fairway</title>
        <meta name="description" content="Slik tar Finns Fairway vare på personvernet: anonyme meldinger, ingen personopplysninger om barn, og hjemmeområdet skjules ved turlogging." />
      </Head>
      <main className="page">
        <section className="hero-card personvern-card">
          <Logo size="md" />
          <h1>Personvern</h1>
          <p className="lede">Kort og enkelt om hvordan vi tar vare på personvernet ditt – og barna sitt.</p>

          <ul className="personvern-list">
            {POINTS.map((point) => (
              <li className="personvern-item" key={point.title}>
                <span className="personvern-item__check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-11" /></svg>
                </span>
                <span className="personvern-item__body">
                  <strong>{point.title}</strong>
                  <span>{point.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="personvern-note">
            Har du spørsmål om personvern, ta kontakt på <a href="mailto:post@finnsfairway.no">post@finnsfairway.no</a>.
          </p>

          <Link className="back-link" href="/">← Til forsiden</Link>
        </section>
      </main>
    </>
  );
}
