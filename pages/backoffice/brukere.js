import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';

export default function Brukere() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/staff/users');
      if (r.status === 403) { setError('not-authed'); return; }
      if (!r.ok) throw new Error('feil');
      const d = await r.json();
      setUsers(d.users || []);
    } catch (_e) { setError('Kunne ikke hente brukere.'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const r = await fetch('/api/staff/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || 'Kunne ikke opprette bruker.'); return; }
      setForm({ name: '', email: '', password: '', role: 'staff' });
      setMsg('Bruker opprettet.');
      load();
    } catch (_e) { setMsg('Noe gikk galt.'); }
  };

  const toggle = async (u) => {
    try {
      await fetch('/api/staff/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, active: !u.active }) });
      load();
    } catch (_e) { setMsg('Kunne ikke endre.'); }
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
          <ul className="admin-list">
            {(users || []).map((u) => (
              <li key={u.id} className="admin-list__item">
                <div>
                  <strong>{u.name || u.email}</strong>
                  <span className="admin-list__meta">{u.email} · {u.role === 'superuser' ? 'superbruker' : 'ansatt'}{u.active ? '' : ' · deaktivert'}</span>
                </div>
                <button type="button" className="big-button big-button--secondary" onClick={() => toggle(u)}>{u.active ? 'Deaktiver' : 'Aktiver'}</button>
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
            <button type="submit" className="big-button big-button--primary">Opprett bruker</button>
          </form>
        </section>
      </main>
    </>
  );
}
