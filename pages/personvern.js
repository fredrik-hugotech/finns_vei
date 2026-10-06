import Head from 'next/head';
import PageHeader from '../components/PageHeader';

const POINTS = [
  {
    title: 'Vi lagrer ikke personopplysninger om barn',
    body: 'Når et barn melder fra om et utrygt sted, spør vi aldri om navn, e-post eller telefon. Meldingen er anonym.',
  },
  {
    title: 'Voksne bestemmer selv',
    body: 'Voksne kan legge igjen kontaktinfo hvis de vil bli kontaktet om saken. Det er frivillig, og uten kontaktinfo er meldingen anonym.',
  },
  {
    title: 'Området rundt hjemmet skjules',
    body: 'Når du logger en tur, fjernes de første 50 meterne fra der du starter, som ofte er hjemme. Startpunktet lagres aldri.',
  },
  {
    title: 'Ruten bearbeides på telefonen din',
    body: 'Ruten klippes og avrundes på telefonen før den sendes. Vi ser hvor mange som sykler og går, ikke hvem.',
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
      <main className="page sub">
        <PageHeader title="Personvern" intro="Slik tar vi vare på personvernet ditt og barnas." />
        <section className="sub__body personvern-card">

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

        </section>
      </main>
    </>
  );
}
