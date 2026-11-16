import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import Logo from '../../components/Logo';

const FLAG = 'ff-admin-secret'; // client "logged in" flag; real auth is the httpOnly cookie

// Staff login. Once logged in, the backoffice starts in Saker (the work
// queues); numbers live under Innsikt (/backoffice/oversikt).
export default function Backoffice() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // First-time setup (create the first superuser) is only needed once and the
  // accounts exist; it opens only via /backoffice?oppsett=1.
  const [setupOpen, setSetupOpen] = useState(false);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('oppsett') === '1') setSetupOpen(true); } catch (_e) { /* ignore */ } }, []);

  const loadSession = useCallback(async () => {
    try {
      const r = await fetch('/api/staff/me');
      if (r.ok) {
        setMe(await r.json());
        try { window.localStorage.setItem(FLAG, 'session'); } catch (_e) { /* ignore */ }
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



  useEffect(() => { if (checked && me) router.replace('/backoffice/saker'); }, [checked, me, router]);
  if (checked && me) return <main className="admin-login"><div className="admin-login__card"><p className="admin-login__sub">Åpner saker …</p></div></main>;

  return (
    <>
      <Head><title>Finnsvei – Innlogging</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <main className="admin-login">
        <div className="admin-login__brand"><Logo size="md" /></div>
        {!checked ? (
          <div className="admin-login__card"><p className="admin-login__sub">Laster …</p></div>
        ) : (
          <>
            <form className="admin-login__card" onSubmit={login}>
              <h1>Logg inn</h1>
              <p className="admin-login__sub">Finnsvei for ansatte i Finns.Fairway.</p>
              <input type="email" className="admin-login__input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-post" autoComplete="username" autoFocus />
              <input type="password" className="admin-login__input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passord" autoComplete="current-password" />
              {error && <p className="admin-login__error">{error}</p>}
              <button type="submit" className="big-button big-button--primary admin-login__btn" disabled={busy || !email || !password}>{busy ? 'Logger inn …' : 'Logg inn'}</button>
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
      // Clear the two credential fields on success, same as login()'s
      // setPassword('') above and ChangePassword's clear below — this form
      // was the one place in this file that left a just-used secret/password
      // sitting in a still-mounted input after a successful submit
      // (setupOpen stays true, so nothing else clears them until a full
      // page reload).
      setSecret(''); setPassword('');
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
      <button type="submit" className="big-button big-button--primary admin-login__btn" disabled={busy || !secret || !email || !password || password.length < 8}>{busy ? 'Oppretter …' : 'Opprett superbruker'}</button>
    </form>
  );
}

