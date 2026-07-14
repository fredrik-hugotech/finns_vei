import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import ReadAloudButton from '../components/ReadAloudButton';
import { SAFETY_COMMANDMENTS, KID_QUIZ } from '../lib/safetyCommandments';
import { getSolvedBud } from '../lib/budProgress';

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
              <ReadAloudButton text={`Finns bud ${b.n}. ${b.title}. ${b.text}`} />
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

  // Local-device-only quiz progress (lib/budProgress.js): once every kid
  // commandment covered by BudQuiz has been answered correctly at least
  // once on this device, show a small celebratory badge. Computed after
  // mount only, so server/first-client render stay in sync (no localStorage
  // access during SSR).
  const totalQuiz = KID_QUIZ.length;
  const [solvedCount, setSolvedCount] = useState(0);
  useEffect(() => {
    setSolvedCount(getSolvedBud().length);
  }, []);
  const allSolved = totalQuiz > 0 && solvedCount >= totalQuiz;

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
        {allSolved && (
          <div className="bud-badge" role="status">
            <Icon name="trophy" size={18} strokeWidth={2} />
            <span>{solvedCount}/{totalQuiz} riktige — Trafikkhelt!</span>
          </div>
        )}
        <Group label="For barn" items={barn} />
        <Group label="For voksne" items={voksne} />
      </main>
    </>
  );
}
