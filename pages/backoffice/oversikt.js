import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import SourcesCard from '../../components/SourcesCard';
import TrafficIncidentsCard from '../../components/TrafficIncidents';
import { splitReportText } from '../../lib/reportText';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { REPORT_STATUS } from '../../lib/config';
import { timeAgo, staffName, describeFetchError } from '../../lib/backofficeFormat';

// Innsikt › Oversikt: numbers and the big picture. Day-to-day case work
// happens in Saker (/backoffice/saker).
const STATUSES = [REPORT_STATUS.NEW, REPORT_STATUS.REGISTERED, REPORT_STATUS.STARTED, REPORT_STATUS.DONE];

function greetingFor(name) {
  const h = new Date().getHours();
  const part = h < 10 ? 'God morgen' : h < 18 ? 'God dag' : 'God kveld';
  return `${part}, ${name || 'Fairway'}`;
}
function fmtShort(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }); } catch (_e) { return d; }
}

export default function Oversikt() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  useEffect(() => {
    fetch('/api/staff/me').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) setMe(d); else router.replace('/backoffice');
    }).catch(() => router.replace('/backoffice'));
  }, [router]);
  if (!me) return <><BackofficeHeader title="Oversikt" /><main className="page admin-page"><p className="admin-list-empty">Laster …</p></main></>;
  return <Dashboard me={me} />;
}

function Dashboard({ me }) {
  const [cases, setCases] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [boardUrl, setBoardUrl] = useState('');
  const [error, setError] = useState('');
  const [skoleAvvik, setSkoleAvvik] = useState(null);

  // Where trips are being logged (Sykkelspor), grouped by municipality.
  const [tripAreas, setTripAreas] = useState(null);
  useEffect(() => {
    fetch('/api/backoffice/trip-areas')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTripAreas(d))
      .catch(() => {});
  }, []);

  // Bus disruptions near schools (Entur) — its own request so a slow or
  // failing Entur never holds up the case numbers.
  useEffect(() => {
    fetch('/api/backoffice/skolevei-avvik')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSkoleAvvik(d ? (d.items || []).filter((i) => i.nearSchool).length : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/backoffice/cases')
      .then(async (r) => {
        if (r.status === 403) throw new Error('not-authed');
        if (!r.ok) throw new Error(await describeFetchError(r, 'Kunne ikke hente saker.'));
        return r.json();
      })
      .then((d) => { setCases(d.cases || []); setTruncated(Boolean(d.truncated)); setBoardUrl(d.trelloBoardUrl || ''); })
      .catch((e) => setError(e.message === 'not-authed' ? 'not-authed' : e.message));
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const myEmail = String(me.email || '').toLowerCase();

  const counts = useMemo(() => {
    const acc = STATUSES.reduce((a, s) => { a[s] = 0; return a; }, {});
    (cases || []).forEach((c) => { if (acc[c.status] !== undefined) acc[c.status] += 1; else acc[c.status] = (acc[c.status] || 0) + 1; });
    return acc;
  }, [cases]);

  const open = useMemo(() => (cases || []).filter((c) => c.status !== REPORT_STATUS.DONE), [cases]);
  const overdue = useMemo(() => open.filter((c) => c.due_date && String(c.due_date).slice(0, 10) < todayStr), [open, todayStr]);
  const unassigned = useMemo(() => open.filter((c) => !c.assignee_email), [open]);
  const newToday = useMemo(() => (cases || []).filter((c) => String(c.created_at || '').slice(0, 10) === todayStr), [cases, todayStr]);
  const totalSupport = useMemo(() => (cases || []).reduce((n, c) => n + Number(c.support_count || 0), 0), [cases]);

  const minDag = useMemo(() => (cases || [])
    .filter((c) => c.status === REPORT_STATUS.NEW || (c.status === REPORT_STATUS.REGISTERED && Date.now() - new Date(c.created_at).getTime() < 7 * 864e5))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 6), [cases]);
  const mine = useMemo(() => (cases || [])
    .filter((c) => String(c.assignee_email || '').toLowerCase() === myEmail && c.status !== REPORT_STATUS.DONE)
    .sort((a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')), [cases, myEmail]);
  // Engagement = citizen support + reports linked into the case.
  const mostSupported = useMemo(() => open
    .filter((c) => !c.parent_report_id && Number(c.engagement ?? c.support_count ?? 0) > 0)
    .sort((a, b) => Number(b.engagement ?? b.support_count ?? 0) - Number(a.engagement ?? a.support_count ?? 0))
    .slice(0, 5), [open]);

  const pulse = [
    { key: 'open', n: open.length, label: 'Åpne saker', href: '/backoffice/liste' },
    { key: 'overdue', n: overdue.length, label: 'Forfalt', href: { pathname: '/backoffice/liste', query: { aging: 'over' } }, warn: overdue.length > 0 },
    { key: 'unassigned', n: unassigned.length, label: 'Uten ansvarlig', href: { pathname: '/backoffice/liste', query: { assignee: 'unassigned' } } },
    { key: 'today', n: newToday.length, label: 'Nye i dag', href: { pathname: '/backoffice/liste', query: { created: 'today' } } },
    { key: 'support', n: totalSupport, label: 'Innbyggerstøtter', href: { pathname: '/backoffice/liste', query: { sort: 'support' } } },
    { key: 'skoleavvik', n: skoleAvvik, label: 'Bussavvik ved skoler', href: '/backoffice/skolevei-avvik', warn: skoleAvvik > 0, own: true },
  ];

  const dueBadge = (c) => {
    if (!c.due_date) return null;
    const isOverdue = String(c.due_date).slice(0, 10) < todayStr && c.status !== REPORT_STATUS.DONE;
    return <span className={isOverdue ? 'sak-due sak-due--over' : 'sak-due'}>{isOverdue ? 'Forfalt' : 'Frist'} {fmtShort(c.due_date)}</span>;
  };
  const renderCase = (c) => {
    const meta = reportStatusMeta(c.status);
    const parts = splitReportText(c.description, { exclude: c.category });
    const hasFoot = dueBadge(c) || Number(c.support_count) > 0 || c.assignee_email || parts.categories.length > 0;
    return (
      <Link key={c.id} href={`/backoffice/sak/${encodeURIComponent(c.id)}`} className="admin-list-item">
        <div className="admin-list-item__head">
          <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
          <span className="admin-list-item__headright">
            {Number(c.linked_count) > 0 && <span className="admin-list-item__linked" title="Meldinger samlet i saken">{Number(c.linked_count) + 1} meldinger</span>}
            {Number(c.support_count) > 0 && <span className="admin-list-item__support" title="Innbyggerstøtte">♥ {c.support_count}</span>}
            <span className="admin-list-item__time">{timeAgo(c.created_at)}</span>
          </span>
        </div>
        <strong className="admin-list-item__title">{c.category}</strong>
        {parts.text && <span className="admin-list-item__desc">{parts.text}</span>}
        {hasFoot && (
          <span className="admin-list-item__foot">
            {parts.categories.map((cat) => <span key={cat} className="admin-list-item__cat">{cat}</span>)}
            {dueBadge(c)}
            {c.assignee_email && <span className="admin-list-item__assignee">{staffName(c.assignee_email)}</span>}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <Head><title>Dashbord – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Oversikt" />
      <main className="page admin-page dash2">
        <header className="dash2__top">
          <div>
            <h1>{greetingFor(me.name)}</h1>
            <p className="dash2__sub">Innlogget som {me.email}{me.role === 'superuser' ? ' · superbruker' : ''}</p>
          </div>
        </header>

        {error === 'not-authed' && (
          <p className="admin-warning">Økten er utløpt. <Link href="/backoffice">Logg inn på nytt</Link></p>
        )}
        {error && error !== 'not-authed' && <p className="admin-warning">{error}</p>}

        {!error && truncated && (
          <p className="admin-warning">Viser kun de {cases.length} nyeste sakene — tallene og listene under dekker ikke eldre saker (ofte de som har ventet lengst). Se <Link href="/backoffice/liste">alle saker</Link> for full liste.</p>
        )}

        <div className="dash2__pulse">
          {pulse.map((p) => (
            <Link key={p.key} href={p.href} className={p.warn ? 'dash2-pulse dash2-pulse--warn' : 'dash2-pulse'}>
              <strong>{(p.own ? p.n === null : cases === null) ? '–' : p.n}</strong>
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

        {tripAreas && tripAreas.totalTrips > 0 && (
          <section>
            <div className="dash2__h2row">
              <h2 className="dash2__h2">Sykkelspor <span className="dash2__hint">{tripAreas.totalTrips} turer · {tripAreas.lastWeek} siste 7 dager</span></h2>
              <Link className="dash2__seeall" href="/backoffice/tetthet">Se kartet ›</Link>
            </div>
            <div className="trip-areas">
              {tripAreas.areas.map((a) => (
                <Link
                  key={a.kommune}
                  className="trip-area"
                  href={{ pathname: '/backoffice/tetthet', query: { fit: a.bounds.flat().map((v) => v.toFixed(4)).join(','), sted: a.kommune } }}
                >
                  <span className="trip-area__name">{a.kommune}<small>{a.fylke}</small></span>
                  <span className="trip-area__n"><strong>{a.trips}</strong> {a.trips === 1 ? 'tur' : 'turer'}{a.lastWeek > 0 ? <em>+{a.lastWeek} denne uka</em> : null}</span>
                  <span className="trip-area__go" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          </section>
        )}


        <TrafficIncidentsCard />

        <SourcesCard />

        <div className="dash2__cols">
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
        </div>

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
  // «Mer › Bytt passord» links here with #bytt-passord: open the form.
  useEffect(() => {
    if (window.location.hash === '#bytt-passord') {
      setOpen(true);
      setTimeout(() => document.getElementById('bytt-passord')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, []);

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
    <form id="bytt-passord" onSubmit={submit} className="admin-section" style={{ display: 'grid', gap: '0.55rem', maxWidth: 360 }}>
      <input type="password" className="admin-login__input" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Nåværende passord" autoComplete="current-password" />
      <input type="password" className="admin-login__input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Nytt passord (minst 8 tegn)" autoComplete="new-password" />
      {msg && <p className="admin-login__sub">{msg}</p>}
      <button type="submit" className="big-button big-button--secondary" disabled={busy || !cur || next.length < 8}>{busy ? 'Bytter …' : 'Lagre nytt passord'}</button>
    </form>
  );
}

