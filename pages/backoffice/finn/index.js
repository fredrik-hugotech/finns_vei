import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import BackofficeHeader from '../../../components/BackofficeHeader';
import { FinnAsk, FinnAvatar, FinnBrief } from '../../../components/Finn';

// Finn's home: the brief, «Spør Finn», and every tool Finn helps with.
const TOOLS = [
  { href: '/backoffice/prioritering', title: 'Prioritering', text: 'Finn har lest hver sak og foreslått tiltak, innsats, veieier og hast. Se hva som bør tas først.' },
  { href: '/backoffice/sammenkobling', title: 'Like saker', text: 'Meldinger om samme sted og problem. Koble dem til én sak: ingenting slettes, og engasjementet teller.', count: 'likeSaker' },
  { href: '/backoffice/finn/kommune', title: 'Brev til veieier', text: 'Velg kommune og saker. Finn skriver et brev til kommunen, fylket eller Statens vegvesen.' },
  { href: '/backoffice/finn/kommune?vis=rapport', title: 'Kommunerapport', text: 'Tall og tekst om én kommune, klar for kommunen eller lokalavisa.' },
  { href: '/backoffice/finn/personvern', title: 'Personvern og kvalitet', text: 'Finn ser etter barnenavn, bilnummer og telefonnummer i meldingene, og etter testmeldinger.', count: 'flagg' },
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
    <div className="finn-tool">
      <strong>Ukesbrev</strong>
      <span>Hver mandag morgen sender Finn en oppsummering av uka på e-post til staben.</span>
      <button type="button" className="finn-link" onClick={send} disabled={state.busy}>{state.busy ? 'Skriver …' : 'Send ukesbrevet nå'}</button>
      {state.msg && <em>{state.msg}</em>}
    </div>
  );
}

export default function FinnHome() {
  const router = useRouter();
  const [counts, setCounts] = useState({});
  const [ready, setReady] = useState(false);
  useEffect(() => { if (router.isReady) setReady(true); }, [router.isReady]);
  useEffect(() => {
    fetch('/api/backoffice/finn/brief').then((r) => (r.ok ? r.json() : null)).then((d) => d && setCounts(d.counts || {})).catch(() => {});
  }, []);
  const spor = ready && typeof router.query.spor === 'string' ? router.query.spor : '';

  return (
    <>
      <Head><title>Finn – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Finn" />
      <main className="page admin-page finn-page">
        <header className="finn-hero">
          <FinnAvatar size={64} />
          <div>
            <h1>Finn</h1>
            <p>Finn er rådgiveren vår for vei, transport og trafikksikkerhet. Han kjenner prosessene hos kommunen, fylket og Statens vegvesen, leser hver melding, husker hva som har virket i tidligere saker og foreslår hvordan vi kommer videre. Finn foreslår. Dere bestemmer.</p>
          </div>
        </header>
        <div className="finn-page__grid">
          <FinnBrief />
          {ready ? <FinnAsk key={spor} initial={spor} /> : <section className="finn-ask" />}
        </div>
        <h2 className="dash2__h2">Dette kan Finn hjelpe med</h2>
        <div className="finn-tools">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="finn-tool">
              <strong>{t.title}{t.count && counts[t.count] > 0 ? <b className="finn-count">{counts[t.count]}</b> : null}</strong>
              <span>{t.text}</span>
            </Link>
          ))}
          <div className="finn-tool finn-tool--static">
            <strong>Framdrift og svar på hver sak</strong>
            <span>Åpne en sak: Finn foreslår neste steg ut fra historikken, og skriver utkast til svar til innbyggeren.</span>
          </div>
          <WeeklyLetter />
        </div>
      </main>
    </>
  );
}
