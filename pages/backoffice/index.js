import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Logo from '../../components/Logo';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { REPORT_STATUS } from '../../lib/config';

const FLAG = 'ff-admin-secret'; // client "logged in" flag; real auth is the httpOnly cookie
const STATUSES = [REPORT_STATUS.NEW, REPORT_STATUS.REGISTERED, REPORT_STATUS.STARTED, REPORT_STATUS.DONE];

function greetingFor(name) {
  const h = new Date().getHours();
  const part = h < 10 ? 'God morgen' : h < 18 ? 'God dag' : 'God kveld';
  return `${part}, ${name || 'Fairway'}`;
}
function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d} d`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h} t`;
  return `${Math.max(1, Math.floor(diff / 60000))} min`;
}
function fmtShort(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }); } catch (_e) { return d; }
}

export default function Backoffice() {
  const [me, setMe] = useState(null);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

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

  const logout = async () => {
    try { await fetch('/api/staff/logout', { method: 'POST' }); } catch (_e) { /* ignore */ }
    try { window.localStorage.removeItem(FLAG); } catch (_e) { /* ignore */ }
    setMe(null);
  };

  if (checked && me) return <Dashboard me={me} onLogout={logout} />;

  return (
    <>
      <Head><title>Finns Fairway – Innlogging</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <main className="admin-login">
        <div className="admin-login__brand"><Logo size="md" /></div>
        {!checked ? (
          <div className="admin-login__card"><p className="admin-login__sub">Laster …</p></div>
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

function Dashboard({ me, onLogout }) {
  const [cases, setCases] = useState(null);
  const [boardUrl, setBoardUrl] = useState('');

  useEffect(() => {
    fetch('/api/backoffice/cases').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setCases(d.cases || []); setBoardUrl(d.trelloBoardUrl || ''); }
    }).catch(() => setCases([]));
  }, []);

  const counts = STATUSES.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
  (cases || []).forEach((c) => { if (counts[c.status] !== undefined) counts[c.status] += 1; else counts[c.status] = (counts[c.status] || 0) + 1; });
  const todayStr = new Date().toISOString().slice(0, 10);
  const myEmail = String(me.email || '').toLowerCase();

  const open = (cases || []).filter((c) => c.status !== REPORT_STATUS.DONE);
  const overdue = open.filter((c) => c.due_date && String(c.due_date).slice(0, 10) < todayStr);
  const unassigned = open.filter((c) => !c.assignee_email);
  const newToday = (cases || []).filter((c) => String(c.created_at || '').slice(0, 10) === todayStr);
  const totalSupport = (cases || []).reduce((n, c) => n + Number(c.support_count || 0), 0);

  const minDag = (cases || [])
    .filter((c) => c.status === REPORT_STATUS.NEW)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 6);
  const mine = (cases || [])
    .filter((c) => String(c.assignee_email || '').toLowerCase() === myEmail && c.status !== REPORT_STATUS.DONE)
    .sort((a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31'));
  const mostSupported = open
    .filter((c) => Number(c.support_count || 0) > 0)
    .sort((a, b) => Number(b.support_count || 0) - Number(a.support_count || 0))
    .slice(0, 5);

  const pulse = [
    { key: 'open', n: open.length, label: 'Åpne saker', href: '/backoffice/liste' },
    { key: 'overdue', n: overdue.length, label: 'Forfalt', href: '/backoffice/liste', warn: overdue.length > 0 },
    { key: 'unassigned', n: unassigned.length, label: 'Uten ansvarlig', href: '/backoffice/liste' },
    { key: 'today', n: newToday.length, label: 'Nye i dag', href: '/backoffice/liste' },
    { key: 'support', n: totalSupport, label: 'Innbyggerstøtter', href: '/backoffice/liste' },
  ];

  const dueBadge = (c) => {
    if (!c.due_date) return null;
    const isOverdue = String(c.due_date).slice(0, 10) < todayStr && c.status !== REPORT_STATUS.DONE;
    return <span className={isOverdue ? 'sak-due sak-due--over' : 'sak-due'}>{isOverdue ? 'Forfalt' : 'Frist'} {fmtShort(c.due_date)}</span>;
  };
  const renderCase = (c) => {
    const meta = reportStatusMeta(c.status);
    const hasFoot = dueBadge(c) || Number(c.support_count) > 0 || c.assignee_email;
    return (
      <Link key={c.id} href={`/backoffice/sak/${encodeURIComponent(c.id)}`} className="admin-list-item">
        <div className="admin-list-item__head">
          <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
          <span className="admin-list-item__headright">
            {Number(c.support_count) > 0 && <span className="admin-list-item__support" title="Innbyggerstøtte">♥ {c.support_count}</span>}
            <span className="admin-list-item__time">{timeAgo(c.created_at)} siden</span>
          </span>
        </div>
        <strong className="admin-list-item__title">{c.category}</strong>
        {c.description && <span className="admin-list-item__desc">{c.description}</span>}
        {hasFoot && (
          <span className="admin-list-item__foot">
            {dueBadge(c)}
            {c.assignee_email && <span className="admin-list-item__assignee">{c.assignee_email.split('@')[0]}</span>}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <Head><title>Dashbord – Finns Fairway</title><meta name="robots" content="noindex" /></Head>
      <main className="page admin-page dash2">
        <header className="dash2__top">
          <div>
            <h1>{greetingFor(me.name)}</h1>
            <p className="dash2__sub">Innlogget som {me.email}{me.role === 'superuser' ? ' · superbruker' : ''}</p>
          </div>
          <button type="button" className="dash2__logout" onClick={onLogout}>Logg ut</button>
        </header>

        <div className="dash2__pulse">
          {pulse.map((p) => (
            <Link key={p.key} href={p.href} className={p.warn ? 'dash2-pulse dash2-pulse--warn' : 'dash2-pulse'}>
              <strong>{cases === null ? '–' : p.n}</strong>
              <span>{p.label}</span>
            </Link>
          ))}
        </div>

        <section>
          <h2 className="dash2__h2">Status</h2>
          <div className="dash2__tiles">
            {STATUSES.map((s) => {
              const meta = reportStatusMeta(s);
              return (
                <Link key={s} href={`/backoffice/liste?status=${encodeURIComponent(s)}`} className={`dash2-tile dash2-tile--${meta.key}`}>
                  <strong>{cases === null ? '–' : (counts[s] || 0)}</strong>
                  <span>{s}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {mine.length > 0 && (
          <section>
            <h2 className="dash2__h2">Mine saker <span className="dash2__hint">tildelt deg</span></h2>
            <div className="admin-list">{mine.slice(0, 8).map(renderCase)}</div>
          </section>
        )}

        {mostSupported.length > 0 && (
          <section>
            <div className="dash2__h2row">
              <h2 className="dash2__h2">Mest engasjement <span className="dash2__hint">flest innbyggere støtter</span></h2>
              <Link className="dash2__seeall" href="/backoffice/liste">Se alle ›</Link>
            </div>
            <div className="admin-list">{mostSupported.map(renderCase)}</div>
          </section>
        )}

        <section>
          <div className="dash2__h2row">
            <h2 className="dash2__h2">Min dag <span className="dash2__hint">nye saker som venter</span></h2>
            <Link className="dash2__seeall" href="/backoffice/liste">Alle saker ›</Link>
          </div>
          {cases === null && <p className="comp-muted">Laster …</p>}
          {cases && minDag.length === 0 && <p className="comp-muted">Ingen nye saker akkurat nå. Fint jobbet.</p>}
          <div className="admin-list">{minDag.map(renderCase)}</div>
        </section>

        <section>
          <h2 className="dash2__h2">Snarveier</h2>
          <div className="dash2__grid">
            <Link className="dash2-link" href="/">Kart</Link>
            <Link className="dash2-link" href="/backoffice/liste">Alle saker</Link>
            <Link className="dash2-link" href="/backoffice/hotteste">Hotteste saker</Link>
            <Link className="dash2-link" href="/backoffice/statistikk">Statistikk</Link>
            <Link className="dash2-link" href="/backoffice/tetthet">Sykkelspor</Link>
            <Link className="dash2-link" href="/backoffice/konkurranser">Konkurranser</Link>
            {me.role === 'superuser' && <Link className="dash2-link" href="/backoffice/brukere">Brukere</Link>}
            {boardUrl && <a className="dash2-link" href={boardUrl} target="_blank" rel="noopener noreferrer">Trello ↗</a>}
          </div>
        </section>

        <ChangePassword />
      </main>
    </>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/staff/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Kunne ikke bytte passord.'); return; }
      setCur(''); setNext(''); setMsg('Passord byttet.');
    } catch (_e) { setMsg('Noe gikk galt.'); } finally { setBusy(false); }
  };

  if (!open) return <button type="button" className="dash2__logout dash2__pw" onClick={() => setOpen(true)}>Bytt passord</button>;
  return (
    <form onSubmit={submit} className="admin-section" style={{ display: 'grid', gap: '0.55rem', maxWidth: 360 }}>
      <input type="password" className="admin-login__input" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Nåværende passord" autoComplete="current-password" />
      <input type="password" className="admin-login__input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Nytt passord (minst 8 tegn)" autoComplete="new-password" />
      {msg && <p className="admin-login__sub">{msg}</p>}
      <button type="submit" className="big-button big-button--secondary" disabled={busy}>{busy ? 'Bytter …' : 'Lagre nytt passord'}</button>
    </form>
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
