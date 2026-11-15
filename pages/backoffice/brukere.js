import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import { describeFetchError } from '../../lib/backofficeFormat';

export default function Brukere() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/staff/users');
      if (r.status === 403) { setError('not-authed'); return; }
      if (!r.ok) { setError(await describeFetchError(r, 'Kunne ikke hente brukere.')); return; }
      const d = await r.json();
      setUsers(d.users || []);
    } catch (_e) { setError('Kunne ikke hente brukere.'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      const r = await fetch('/api/staff/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Kunne ikke opprette bruker.'); return; }
      setForm({ name: '', email: '', password: '', role: 'staff' });
      setMsg('Bruker opprettet.');
      load();
    } catch (_e) { setMsg('Noe gikk galt.'); }
    finally { setBusy(false); }
  };

  const [pwFor, setPwFor] = useState(null);
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const suggest = () => {
    const words = ['Sykkel', 'Skolevei', 'Gangfelt', 'Fortau', 'Refleks', 'Hjelm', 'Rundkjoring', 'Busslomme'];
    const a = new Uint32Array(3); window.crypto.getRandomValues(a);
    return `${words[a[0] % words.length]}-${words[a[1] % words.length].toLowerCase()}-${1000 + (a[2] % 9000)}`;
  };
  const openPw = (u) => { setPwFor(u.id); setPw(suggest()); setPwMsg(''); };
  const savePw = async (u) => {
    setPwBusy(true);
    try {
      const r = await fetch('/api/staff/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, newPassword: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPwMsg(d.error || 'Kunne ikke sette passord.'); return; }
      setPwMsg(`Nytt passord for ${u.name || u.email}: ${pw} – gi det til personen, og be dem bytte det etter innlogging.`);
      setPwFor(null);
    } catch (_e) { setPwMsg('Kunne ikke sette passord.'); } finally { setPwBusy(false); }
  };

  const toggle = async (u) => {
    if (togglingId) return;
    if (u.active && !window.confirm(`Deaktivere ${u.name || u.email}? De mister tilgang umiddelbart.`)) return;
    setMsg('');
    setTogglingId(u.id);
    try {
      const r = await fetch('/api/staff/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, active: !u.active }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Kunne ikke endre.'); return; }
      load();
    } catch (_e) { setMsg('Kunne ikke endre.'); }
    finally { setTogglingId(null); }
  };

  return (
    <>
      <Head><title>Brukere – backoffice</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Brukere" />
      <main className="page admin-page">
        <h1>Brukere</h1>

        {error === 'not-authed' && <p className="admin-list-empty">Kun superbrukere. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <div className="admin-status">{error}</div>}

        <section className="admin-section">
          <h2>Tilgang</h2>
          {pwMsg && <div className="admin-status user-pw__msg">{pwMsg}</div>}
          <ul className="admin-list">
            {!error && users === null && <p className="admin-list-empty">Laster …</p>}
            {(users || []).map((u) => (
              <li key={u.id} className="admin-list__item">
                <div>
                  <strong>{u.name || u.email}</strong>
                  <span className="admin-list__meta">{u.email} · {u.role === 'superuser' ? 'superbruker' : 'ansatt'}{u.active ? '' : ' · deaktivert'}</span>
                </div>
                <div className="user-actions">
                  <button type="button" className="big-button big-button--secondary" onClick={() => (pwFor === u.id ? setPwFor(null) : openPw(u))}>Sett nytt passord</button>
                  <button type="button" className="big-button big-button--secondary" disabled={togglingId === u.id} onClick={() => toggle(u)}>{u.active ? 'Deaktiver' : 'Aktiver'}</button>
                </div>
                {pwFor === u.id && (
                  <div className="user-pw">
                    <label className="admin-field"><span>Nytt passord (minst 8 tegn)</span><input type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" /></label>
                    <p className="admin-list__meta">{u.name || u.email} blir logget ut og må bruke dette passordet neste gang.</p>
                    <button type="button" className="big-button big-button--primary" disabled={pwBusy || pw.length < 8} onClick={() => savePw(u)}>{pwBusy ? 'Lagrer …' : 'Lagre passord'}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-section">
          <h2>Ny bruker</h2>
          <form className="admin-form" onSubmit={add}>
            <label className="admin-field"><span>Navn</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Navn" /></label>
            <label className="admin-field"><span>E-post</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-post" /></label>
            <label className="admin-field"><span>Passord (minst 8 tegn)</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Passord" /></label>
            <label className="admin-field"><span>Rolle</span>
              <select className="comp-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="staff">Ansatt</option>
                <option value="superuser">Superbruker</option>
              </select>
            </label>
            {msg && <div className="admin-status">{msg}</div>}
            <button type="submit" className="big-button big-button--primary" disabled={busy || !form.email || !form.password || form.password.length < 8}>{busy ? 'Oppretter …' : 'Opprett bruker'}</button>
          </form>
        </section>
      </main>
    </>
  );
}
