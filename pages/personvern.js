import Head from 'next/head';
import PageHeader from '../components/PageHeader';

const POINTS = [
  {
    title: 'Vi lagrer ikke personopplysninger om barn',
    body: 'Når et barn melder fra om et utrygt sted, spør vi aldri om navn, e-post eller telefon. Meldingen er anonym.',
  },
  {
    title: 'Barn under 13 år logger ikke turer selv',
    body: 'Barn under 13 år skal ikke registrere hvor de er på egen telefon, og skal ikke trenge egen smarttelefon for å være med. En voksen som er med på turen logger den på sin telefon, eller tegner ruten på kartet.',
  },
  {
    title: 'Vi spør om alder, men lagrer den ikke',
    body: 'Før en tur logges, spør vi hvem som logger den. Vi lagrer bare om det var et barn over 13 år eller en voksen, aldri alder eller navn.',
  },
  {
    title: 'Voksne bestemmer selv',
    body: 'Voksne kan legge igjen kontaktinfo hvis de vil bli kontaktet om saken. Det er frivillig, og uten kontaktinfo er meldingen anonym.',
  },
  {
    title: 'Området rundt hjemmet skjules',
    body: 'Når en tur logges eller en rute tegnes, fjernes de første 50 meterne fra der den starter, som ofte er hjemme. Startpunktet lagres aldri.',
  },
  {
    title: 'Ruten bearbeides på telefonen din',
    body: 'Ruten klippes og avrundes på telefonen før den sendes, og en gang til hos oss. Vi ser hvor mange som sykler og går, ikke hvem. Bare stiftelsen ser varmekartet, og enkeltruter vises aldri offentlig.',
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
        <meta name="description" content="Slik tar Finns Fairway vare på personvernet: anonyme meldinger, ingen personopplysninger om barn, hjemmeområdet skjules ved turlogging, og barn under 13 år logger ikke turer selv." />
      </Head>
      <main className="page sub">
        <PageHeader title="Personvern" intro="Slik tar vi vare på personvernet ditt og barnas." />
        <section className="sub__body personvern-card">

          <div className="personvern-summary">
            <p>
              Finns Fairway lagrer ingen navn, kontaktinfo eller alder om barn, og barn under 13 år logger aldri
              posisjon selv: en voksen som er med logger turen på sin egen telefon, eller tegner ruten på kartet.
            </p>
            <p>
              Ruten klippes både på telefonen og hos oss, slik at de første 50 meterne fra start (ofte hjemmet) aldri
              lagres, og bare stiftelsen bak Finns Fairway ser varmekartet over hvor barn ferdes, aldri offentligheten.
            </p>
          </div>

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
