import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Logo from '../../components/Logo';

const FLAG = 'ff-admin-secret'; // client "logged in" flag; real auth is the httpOnly cookie

const GREETINGS = [
  'Velkommen tilbake. Hver sak du følger opp gjør veien litt tryggere for et barn.',
  'Godt å se deg. Sammen bygger vi en tryggere og mer aktiv oppvekst.',
  'Takk for innsatsen. Det dere gjør her teller – ett trygt veikryss om gangen.',
  'Hei, og velkommen. Bak hver melding står et barn som fortjener en trygg skolevei.',
  'Godt å ha deg på laget. Trygge veier skapes av folk som bryr seg.',
];
function pickGreeting() {
  const d = new Date();
  return GREETINGS[Math.abs(d.getMinutes() + d.getSeconds()) % GREETINGS.length];
}

export default function Backoffice() {
  const [me, setMe] = useState(null);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [boardUrl, setBoardUrl] = useState('');
  const [greeting, setGreeting] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const r = await fetch('/api/staff/me');
      if (r.ok) {
        const d = await r.json();
        setMe(d);
        try { window.localStorage.setItem(FLAG, 'session'); } catch (_e) { /* ignore */ }
        setGreeting(pickGreeting());
        fetch('/api/backoffice/session').then((s) => (s.ok ? s.json() : null)).then((s) => { if (s) setBoardUrl(s.trelloBoardUrl || ''); }).catch(() => {});
      } else {
        setMe(null);
        try { window.localStorage.removeItem(FLAG); } catch (_e) { /* ignore */ }
      }
    } catch (_e) { setMe(null); } finally { setChecked(true); }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  const login = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Innlogging feilet.'); return; }
      setPassword('');
      await loadSession();
    } catch (_e) { setError('Noe gikk galt.'); } finally { setBusy(false); }
  };

  const logout = async () => {
    try { await fetch('/api/staff/logout', { method: 'POST' }); } catch (_e) { /* ignore */ }
    try { window.localStorage.removeItem(FLAG); } catch (_e) { /* ignore */ }
    setMe(null);
  };

  return (
    <>
      <Head><title>Finns Fairway – Innlogging</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <main className="admin-login">
        <div className="admin-login__brand"><Logo size="md" /></div>

        {!checked ? (
          <div className="admin-login__card"><p className="admin-login__sub">Laster …</p></div>
        ) : me ? (
          <div className="admin-login__card">
            <p className="admin-login__greeting">{greeting}</p>
            <p className="admin-login__sub">Innlogget som {me.name || me.email}{me.role === 'superuser' ? ' · superbruker' : ''}</p>
            <nav className="admin-menu">
              <Link className="admin-menu__item" href="/">Se kart</Link>
              <Link className="admin-menu__item" href="/backoffice/liste">Se liste</Link>
              <Link className="admin-menu__item" href="/backoffice/tetthet">Sykkelspor</Link>
              <Link className="admin-menu__item" href="/backoffice/konkurranser">Konkurranser</Link>
              {me.role === 'superuser' && <Link className="admin-menu__item" href="/backoffice/brukere">Brukere</Link>}
              {boardUrl && <a className="admin-menu__item" href={boardUrl} target="_blank" rel="noopener noreferrer">Åpne Trello</a>}
            </nav>
            <button type="button" className="admin-login__logout" onClick={logout}>Logg ut</button>
          </div>
        ) : (
          <>
            <form className="admin-login__card" onSubmit={login}>
              <h1>Logg inn</h1>
              <p className="admin-login__sub">For ansatte i Finns Fairway.</p>
              <input type="email" className="admin-login__input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-post" autoComplete="username" autoFocus />
              <input type="password" className="admin-login__input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passord" autoComplete="current-password" />
              {error && <p className="admin-login__error">{error}</p>}
              <button type="submit" className="big-button big-button--primary admin-login__btn" disabled={busy || !email || !password}>{busy ? 'Logger inn …' : 'Logg inn'}</button>
              <button type="button" className="admin-login__logout" onClick={() => setSetupOpen((v) => !v)}>Første gangs oppsett</button>
            </form>
            {setupOpen && <FirstSetup onDone={loadSession} />}
          </>
        )}
      </main>
    </>
  );
}

function FirstSetup({ onDone }) {
  const [secret, setSecret] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/staff/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-backoffice-secret': secret }, body: JSON.stringify({ email, password, name }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Kunne ikke opprette bruker.'); return; }
      setMsg('Superbruker opprettet. Logg inn med e-post og passord.');
      onDone?.();
    } catch (_e) { setMsg('Noe gikk galt.'); } finally { setBusy(false); }
  };

  return (
    <form className="admin-login__card" onSubmit={submit}>
      <h1 style={{ fontSize: '1.2rem' }}>Første superbruker</h1>
      <p className="admin-login__sub">Bruk oppsett-passordet (BACKOFFICE_SECRET) én gang for å opprette den første kontoen.</p>
      <input type="password" className="admin-login__input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Oppsett-passord" />
      <input className="admin-login__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn" />
      <input type="email" className="admin-login__input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-post" />
      <input type="password" className="admin-login__input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passord (minst 8 tegn)" />
      {msg && <p className="admin-login__sub">{msg}</p>}
      <button type="submit" className="big-button big-button--primary admin-login__btn" disabled={busy}>{busy ? 'Oppretter …' : 'Opprett superbruker'}</button>
    </form>
  );
}
