import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import BackofficeHeader from '../../../components/BackofficeHeader';
import { FinnAsk, FinnAvatar, FinnBrief } from '../../../components/Finn';

// Finn's home: what Finn can do first (verb-first tiles), then today's
// brief and «Spør Finn».
const TOOLS = [
  { href: '/backoffice/prioritering', title: 'Hva tar vi først?', text: 'Sakene sortert etter hast og innsats', count: 'haste' },
  { href: '/backoffice/sammenkobling', title: 'Samle like saker', text: 'Flere meldinger om samme sted', count: 'likeSaker' },
  { href: '/backoffice/finn/kommune', title: 'Skriv brev til veieier', text: 'Kommune, fylke eller Statens vegvesen' },
  { href: '/backoffice/finn/kommune?vis=rapport', title: 'Lag kommunerapport', text: 'Til kommunen eller lokalavisa' },
  { href: '/backoffice/finn/personvern', title: 'Sjekk personvern', text: 'Navn, bilnummer og testmeldinger', count: 'flagg' },
  { href: '/backoffice/liste', title: 'Neste steg i en sak', text: 'Åpne en sak og trykk «Finn foreslår»' },
];

function WeeklyLetter() {
  const [state, setState] = useState({ busy: false, msg: '' });
  const send = async () => {
    if (!window.confirm('Lage ukesbrevet nå og sende det på e-post til staben?')) return;
    setState({ busy: true, msg: 'Finn skriver ukesbrevet …' });
    try {
      const r = await fetch('/api/cron/finn-ukesbrev', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) setState({ busy: false, msg: d.reason || d.error || 'Kunne ikke lage ukesbrevet.' });
      else setState({ busy: false, msg: d.sent ? `Sendt til ${d.to}.` : `Skrevet, men ikke sendt: ${d.reason}` });
    } catch (_e) { setState({ busy: false, msg: 'Nettverksfeil.' }); }
  };
  return (
    <button type="button" className="finn-tool" onClick={send} disabled={state.busy}>
      <strong>{state.busy ? 'Skriver …' : 'Send ukesbrev'}</strong>
      <span>{state.msg || 'Går ellers ut hver mandag'}</span>
    </button>
  );
}

export default function FinnHome() {
  const router = useRouter();
  const [counts, setCounts] = useState({});
  const [ready, setReady] = useState(false);
  useEffect(() => { if (router.isReady) setReady(true); }, [router.isReady]);
  useEffect(() => {
    fetch('/api/backoffice/finn/brief').then((r) => (r.ok ? r.json() : null)).then((d) => d && setCounts({ ...(d.counts || {}), haste: d.stats?.hastesaker_apne || 0 })).catch(() => {});
  }, []);
  const spor = ready && typeof router.query.spor === 'string' ? router.query.spor : '';

  return (
    <>
      <Head><title>Finn – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Finn" />
      <main className="page admin-page finn-page">
        <header className="finn-hero finn-hero--small">
          <FinnAvatar size={48} />
          <div>
            <h1>Finn</h1>
            <p>Rådgiver for vei og trafikksikkerhet. Finn foreslår, dere bestemmer.</p>
          </div>
        </header>
        <div className="finn-tools">
          {TOOLS.map((t) => (
            <Link key={t.title} href={t.href} className="finn-tool">
              <strong>{t.title}{t.count && counts[t.count] > 0 ? <b className="finn-count">{counts[t.count]}</b> : null}</strong>
              <span>{t.text}</span>
            </Link>
          ))}
          <WeeklyLetter />
        </div>
        <div className="finn-page__grid">
          <FinnBrief />
          {ready ? <FinnAsk key={spor} initial={spor} /> : <section className="finn-ask" />}
        </div>
      </main>
    </>
  );
}
