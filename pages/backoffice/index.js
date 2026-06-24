import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Logo from '../../components/Logo';

const SECRET_KEY = 'ff-admin-secret';

// Warm, emoji-free greetings rooted in Finns Fairway's purpose: a safe and
// active childhood, and safer routes to school and leisure.
const GREETINGS = [
  'Velkommen tilbake. Hver sak du følger opp gjør veien litt tryggere for et barn.',
  'Godt å se deg. Sammen bygger vi en tryggere og mer aktiv oppvekst.',
  'Takk for innsatsen. Det dere gjør her teller – ett trygt veikryss om gangen.',
  'Hei, og velkommen. Bak hver melding står et barn som fortjener en trygg skolevei.',
  'Godt å ha deg på laget. Trygge veier skapes av folk som bryr seg.',
  'Velkommen. I dag kan vi gjøre nærmiljøet litt tryggere å sykle og gå i.',
  'Hyggelig at du er her. Trygg ferdsel for barn begynner med oppmerksomme voksne.',
];

function pickGreeting() {
  // Stable per page load without relying on Math.random at module scope.
  const index = Math.abs(new Date().getMinutes() + new Date().getSeconds()) % GREETINGS.length;
  return GREETINGS[index];
}

export default function Backoffice() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [boardUrl, setBoardUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [greeting, setGreeting] = useState('');

  const verify = useCallback(async (value) => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/backoffice/session', { headers: { 'x-backoffice-secret': value } });
      if (!r.ok) { setError('Feil passord. Prøv igjen.'); setAuthed(false); return false; }
      const d = await r.json();
      setBoardUrl(d.trelloBoardUrl || '');
      window.localStorage.setItem(SECRET_KEY, value);
      setAuthed(true);
      setGreeting(pickGreeting());
      return true;
    } catch (_e) {
      setError('Noe gikk galt. Prøv igjen.');
      return false;
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SECRET_KEY) : '';
    if (stored) { setSecret(stored); verify(stored); }
  }, [verify]);

  const logout = () => {
    window.localStorage.removeItem(SECRET_KEY);
    setAuthed(false); setSecret(''); setError('');
  };

  return (
    <>
      <Head><title>Finns Fairway – Innlogging</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <main className="admin-login">
        <div className="admin-login__brand"><Logo size="md" /></div>

        {!authed ? (
          <form
            className="admin-login__card"
            onSubmit={(e) => { e.preventDefault(); verify(secret); }}
          >
            <h1>Logg inn</h1>
            <p className="admin-login__sub">For ansatte i Finns Fairway.</p>
            <input
              type="password"
              className="admin-login__input"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Passord"
              autoFocus
            />
            {error && <p className="admin-login__error">{error}</p>}
            <button type="submit" className="big-button big-button--primary admin-login__btn" disabled={busy || !secret}>
              {busy ? 'Logger inn …' : 'Logg inn'}
            </button>
          </form>
        ) : (
          <div className="admin-login__card">
            <p className="admin-login__greeting">{greeting}</p>
            <nav className="admin-menu">
              <Link className="admin-menu__item" href="/">Se kart</Link>
              <Link className="admin-menu__item" href="/backoffice/liste">Se liste</Link>
              {boardUrl && <a className="admin-menu__item" href={boardUrl} target="_blank" rel="noopener noreferrer">Åpne Trello</a>}
            </nav>
            <button type="button" className="admin-login__logout" onClick={logout}>Logg ut</button>
          </div>
        )}
      </main>
    </>
  );
}
