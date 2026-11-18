import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import FinnPanel from './FinnPanel';

// Two menus only: Saker (where the work happens) and Innsikt (numbers and
// the big picture). Finn opens as a side panel from anywhere; the rest sits
// under «Mer».
const SAKER = ['/backoffice/saker', '/backoffice/liste', '/backoffice/sak', '/backoffice/sammenkobling', '/backoffice/finn/personvern', '/backoffice/skilt'];
export const INNSIKT_TABS = [
  { href: '/backoffice/oversikt', label: 'Oversikt' },
  { href: '/backoffice/finn/kommune', label: 'Kommuner' },
  { href: '/backoffice/kartanalyse', label: 'Kartanalyse' },
  { href: '/backoffice/statistikk', label: 'Statistikk' },
  { href: '/', label: 'Kart' },
  { href: '/backoffice/tetthet', label: 'Sykkelspor' },
  { href: '/backoffice/sparkesykler', label: 'Sparkesykler' },
  { href: '/backoffice/gjentakende-steder', label: 'Gjentakende steder' },
  { href: '/backoffice/skolevei-avvik', label: 'Skolevei-avvik' },
  { href: '/backoffice/konkurranser', label: 'Konkurranser' },
  { href: '/innsikt', label: 'Finnsvei i tall' },
];
const INNSIKT = INNSIKT_TABS.map((t) => t.href).filter((h) => h !== '/' && h !== '/innsikt');
// Saker's queues, shown in the same row and style as Innsikt's tabs.
export const SAKER_QUEUES = [
  { key: 'idag', label: 'I dag' },
  { key: 'stjerne', label: '★ Stjernemerket' },
  { key: 'viktigst', label: 'Viktigst nå' },
  { key: 'raske', label: 'Raske gevinster' },
  { key: 'nye', label: 'Nye' },
  { key: 'kontakt', label: 'Kan følges opp' },
  { key: 'mine', label: 'Tildelt meg' },
  { key: 'alle', label: 'Alle' },
];

const under = (path, list) => list.some((m) => path === m || path.startsWith(`${m}/`));

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const logout = async () => {
    try { await fetch('/api/staff/logout', { method: 'POST' }); } catch (_e) { /* ignore */ }
    try { window.localStorage.removeItem('ff-admin-secret'); } catch (_e) { /* ignore */ }
    window.location.href = '/backoffice';
  };
  return (
    <div className="bo-more" ref={ref}>
      <button type="button" className="bo-more__btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        Mer
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="bo-more__menu" role="menu">
          <Link role="menuitem" href="/backoffice/brukere" onClick={() => setOpen(false)}>Brukere</Link>
          <Link role="menuitem" href="/backoffice/oversikt#bytt-passord" onClick={() => setOpen(false)}>Bytt passord</Link>
          <button type="button" role="menuitem" onClick={logout}>Logg ut</button>
        </div>
      )}
    </div>
  );
}

export default function BackofficeHeader({ counts = null }) {
  const router = useRouter();
  const path = router?.pathname?.replace('/[id]', '') || '';
  const [finnOpen, setFinnOpen] = useState(false);
  const inInnsikt = under(path, INNSIKT);
  const inSaker = !inInnsikt && (under(path, SAKER) || path === '/backoffice');
  const finnQuery = router?.query?.finn;
  useEffect(() => { if (finnQuery === '1') setFinnOpen(true); }, [finnQuery]);

  const queue = path === '/backoffice/liste' ? 'alle' : path === '/backoffice/saker' ? (SAKER_QUEUES.some((q) => q.key === router?.query?.ko) ? router.query.ko : 'idag') : '';
  return (
    <>
      <div className="bo-top">
      <header className="bo-header">
        <Link className="bo-header__brand" href="/backoffice/saker" aria-label="Finnsvei – saker">
          <Logo size="sm" variant="symbol" />
          <span className="bo-header__brandtext">Finnsvei</span>
        </Link>
        <nav className="bo-header__nav bo-header__nav--two" aria-label="Backoffice">
          <Link href="/backoffice/saker" className={inSaker ? 'bo-header__link bo-header__link--on' : 'bo-header__link'} aria-current={inSaker ? 'page' : undefined}>Saker</Link>
          <Link href="/backoffice/oversikt" className={inInnsikt ? 'bo-header__link bo-header__link--on' : 'bo-header__link'} aria-current={inInnsikt ? 'page' : undefined}>Innsikt</Link>
        </nav>
        <button type="button" className={finnOpen ? 'bo-header__finn bo-header__finn--on' : 'bo-header__finn'} onClick={() => setFinnOpen((o) => !o)} aria-expanded={finnOpen} aria-label="Spør Finn, AI-rådgiveren">
          <span className="bo-header__finnmark" aria-hidden="true">F<i>✦</i></span>
          <span className="bo-header__finntext">Finn</span>
        </button>
        <MoreMenu />
      </header>
      {inSaker && (
        <nav className="bo-subnav" aria-label="Køer">
          {SAKER_QUEUES.map((q) => {
            const on = q.key === queue;
            const href = q.key === 'alle' ? '/backoffice/liste' : q.key === 'idag' ? '/backoffice/saker' : `/backoffice/saker?ko=${q.key}`;
            const n = counts && q.key !== 'idag' && q.key !== 'alle' ? counts[q.key] : null;
            return (
              <Link key={q.key} href={href} shallow={path === '/backoffice/saker' && q.key !== 'alle'} className={on ? 'bo-subnav__tab bo-subnav__tab--on' : 'bo-subnav__tab'} aria-current={on ? 'page' : undefined}>
                {q.label}{q.key !== 'idag' && q.key !== 'alle' && path === '/backoffice/saker' ? <b>{n === null || n === undefined ? '·' : n}</b> : null}
              </Link>
            );
          })}
        </nav>
      )}
      {inInnsikt && (
        <nav className="bo-subnav" aria-label="Innsikt">
          {INNSIKT_TABS.map((t) => {
            const on = t.href !== '/' && (path === t.href || path.startsWith(`${t.href}/`));
            return <Link key={t.href} href={t.href} className={on ? 'bo-subnav__tab bo-subnav__tab--on' : 'bo-subnav__tab'} aria-current={on ? 'page' : undefined}>{t.label}</Link>;
          })}
        </nav>
      )}
      </div>
      <FinnPanel open={finnOpen} onClose={() => setFinnOpen(false)} initialQuestion={typeof router?.query?.spor === 'string' ? router.query.spor : ''} />
    </>
  );
}
