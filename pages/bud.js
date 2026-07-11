import Head from 'next/head';
import { useRouter } from 'next/router';
import Logo from '../components/Logo';
import { SAFETY_COMMANDMENTS } from '../lib/safetyCommandments';

function Group({ label, items }) {
  return (
    <section className="bud-group">
      <h2 className="bud-group__title">{label}</h2>
      <ol className="bud-list">
        {items.map((b) => (
          <li key={b.n} className="bud">
            <span className="bud__n">{b.n}</span>
            <div className="bud__body">
              <strong>{b.title}</strong>
              <p>{b.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Bud() {
  const router = useRouter();
  const barn = SAFETY_COMMANDMENTS.filter((b) => b.audience === 'barn');
  const voksne = SAFETY_COMMANDMENTS.filter((b) => b.audience === 'voksen');

  return (
    <>
      <Head>
        <title>Finns 10 bud for trygg ferdsel</title>
        <meta name="description" content="Finns Fairways ti bud for trygg ferdsel til og fra idrettsaktiviteter." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <main className="page bud-page">
        <button type="button" className="bud-back" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}>‹ Tilbake</button>
        <header className="bud-hero">
          <div className="bud-hero__brand"><Logo size="sm" /></div>
          <h1>Finns 10 bud</h1>
          <p>for trygg ferdsel til og fra idrett</p>
        </header>
        <Group label="For barn" items={barn} />
        <Group label="For voksne" items={voksne} />
      </main>
    </>
  );
}
