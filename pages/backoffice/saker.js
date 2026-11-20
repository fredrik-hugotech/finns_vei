import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import { EffortChip, FinnBrief, UrgencyDots } from '../../components/Finn';
import { ShareButton, StarButton, StatusPicker, rememberQueue, setCaseStatus, useStars } from '../../components/CaseQuick';
import { REPORT_STATUS } from '../../lib/config';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { splitReportText } from '../../lib/reportText';
import { staffName, timeAgo } from '../../lib/backofficeFormat';
import { MAIN_CATEGORY_LABELS, caseCategory } from '../../lib/mainCategories';
import { isRiskSite } from '../../lib/aiStats';

// Saker: the one place for day-to-day case work. Fixed queues instead of
// separate pages; Finn's assessment, stars and status on every row.
const QUEUES = [
  { key: 'idag', label: 'I dag' },
  { key: 'stjerne', label: 'Stjernemerket' },
  { key: 'viktigst', label: 'Viktigst nå' },
  { key: 'raske', label: 'Raske gevinster' },
  { key: 'nye', label: 'Nye' },
  { key: 'kontakt', label: 'Kan følges opp' },
  { key: 'mine', label: 'Tildelt meg' },
  { key: 'alle', label: 'Alle', href: '/backoffice/liste' },
];
const HINT = {
  stjerne: 'Arbeidslista: sakene teamet jobber med nå. Den som har ventet lengst på en oppdatering står øverst. Sett status og gi innbyggeren en oppdatering når noe skjer.',
  mine: 'Saker du er ansvarlig for.',
  viktigst: 'Finns rekkefølge: hast, engasjement og flere meldinger på samme sted. Ta ovenfra.',
  raske: 'Enkle tiltak som trolig løses med én henvendelse.',
  nye: 'Ikke behandlet ennå, nyeste først.',
  kontakt: 'En voksen melder har lagt igjen kontaktinfo og kan bidra med bilder eller befaring.',
};
const PAGE = 20;
const DONE = REPORT_STATUS.DONE;

function CaseRow({ c, star, onStar, onStatus, starredBy, showUpdate }) {
  const meta = reportStatusMeta(c.status);
  const t = c.t;
  const text = t?.summary || splitReportText(c.description, { exclude: c.category }).text;
  const today = new Date().toISOString().slice(0, 10);
  const over = c.due_date && String(c.due_date).slice(0, 10) < today && c.status !== DONE;
  return (
    <li className="sk-row">
      <Link className="sk-item" href={`/backoffice/sak/${encodeURIComponent(c.id)}`}>
        <span className="sk-item__top">
          <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
          <span className="sk-cat">{caseCategory(c)}</span>
          <span className="sk-item__where">{[t?.kommune_navn, timeAgo(c.created_at)].filter(Boolean).join(' · ')}</span>
        </span>
        <strong className="sk-item__title">{t?.measure || c.category}</strong>
        {text && <span className="sk-item__text">{text}</span>}
        {(starredBy?.length > 0 || showUpdate) && (
          <span className="sk-item__work">
            {starredBy?.length > 0 && <span className="sk-starred">★ {starredBy.map((x) => x.by).join(', ')}</span>}
            {showUpdate && <span className={c.public_status_updated_at ? 'sk-updated' : 'sk-updated sk-updated--none'}>{c.public_status_updated_at ? `Sist oppdatert ${timeAgo(c.public_status_updated_at)}` : 'Ingen oppdatering til innbygger ennå'}</span>}
          </span>
        )}
        <span className="sk-item__meta">
          {t && <EffortChip effort={t.effort} />}
          {t?.urgency ? <UrgencyDots n={t.urgency} /> : null}
          {Number(c.linked_count) > 0 && <span className="admin-list-item__linked">{Number(c.linked_count) + 1} meldinger</span>}
          {Number(c.support_count) > 0 && <span className="sk-support">♥ {c.support_count}</span>}
          {Number(t?.acc_10y) > 0 && <span className="sk-acc" title="Politiregistrerte personskadeulykker innen 100 m siste 10 år">{t.acc_10y} {Number(t.acc_10y) === 1 ? 'ulykke' : 'ulykker'}{Number(t.acc_vulnerable_10y) > 0 ? ` · ${t.acc_vulnerable_10y} fotgj./sykkel` : ''}</span>}
          {Number(t?.aadt) >= 1000 && <span className="sk-aadt" title="Årsdøgntrafikk">ÅDT {Number(t.aadt).toLocaleString('nb-NO')}</span>}
          {Number(t?.barn_6_15_1km) >= 100 && <span className="sk-aadt" title="Barn 6–15 år som bor innen 1 km (SSB)">ca. {Number(t.barn_6_15_1km).toLocaleString('nb-NO')} barn</span>}
          {Number(c.contact_count) > 0 && <span className="admin-list-item__contact">Kontaktperson</span>}
          {c.due_date && <span className={over ? 'sak-due sak-due--over' : 'sak-due'}>{over ? 'Forfalt' : 'Frist'} {new Date(c.due_date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}</span>}
          {c.assignee_email && <span className="admin-list-item__assignee">{staffName(c.assignee_email)}</span>}
        </span>
      </Link>
      <div className="cq-bar">
        <StatusPicker value={c.status} onChange={onStatus} />
        <ShareButton id={c.id} title={`${c.t?.measure || c.category} – Finnsvei`} />
        <StarButton on={star} onToggle={onStar} />
      </div>
    </li>
  );
}

function RunAssessments({ pending, reassess, onDone }) {
  const [state, setState] = useState({ running: false, msg: '' });
  const run = async () => {
    setState({ running: true, msg: 'Starter …' });
    let total = 0;
    for (let round = 0; round < 80; round += 1) {
      try {
        const r = await fetch('/api/cron/ai-triage?kjede=1', { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) { setState({ running: false, msg: d.reason || d.error || 'Stoppet.' }); onDone(); return; }
        total += d.assessed || 0;
        if (d.chained) {
          // The server carries on by itself; this page only shows progress.
          setState({ running: false, msg: `Finn jobber videre på serveren (${d.remaining} igjen). Du kan lukke siden.` });
          onDone();
          return;
        }
        setState({ running: true, msg: `${total} vurdert, ${d.remaining} igjen …` });
        if (!d.remaining || (!d.assessed && round > 2)) break;
      } catch (_e) { setState({ running: false, msg: 'Nettverksfeil. Prøv igjen.' }); onDone(); return; }
    }
    setState({ running: false, msg: `Ferdig: ${total} vurdert.` });
    onDone();
  };
  return (
    <div className="sk-task">
      <strong>{reassess > 0 ? `${pending} saker venter på ny vurdering fra Finn` : `${pending} saker er ikke vurdert av Finn`}</strong>
      <span>{state.msg || (reassess > 0 ? 'Saken er endret siden Finn vurderte den (ny tekst, kategori eller veidata). Gamle vurderinger vises til de er erstattet.' : 'De kommer ikke med i køene før de er vurdert.')}</span>
      <button type="button" className="finn-link" onClick={run} disabled={state.running}>{state.running ? 'Vurderer …' : 'Start nå'}</button>
    </div>
  );
}

function FillCategories({ missing, onDone }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setMsg('Finn leser sakene …');
    for (let round = 0; round < 20; round += 1) {
      try {
        const r = await fetch('/api/cron/kategorier?kjede=1', { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) { setMsg(d.reason || 'Stoppet. Prøv igjen.'); break; }
        if (d.chained) { setMsg(`Finn fortsetter på serveren (${d.remaining} igjen). Du kan lukke siden.`); break; }
        setMsg(`${d.remaining} igjen …`);
        if (!d.remaining || !(d.done || d.refreshed)) { setMsg('Ferdig.'); break; }
      } catch (_e) { setMsg('Nettverksfeil. Prøv igjen.'); break; }
    }
    setBusy(false); onDone();
  };
  return (
    <div className="sk-task">
      <strong>{missing} saker mangler hovedkategori</strong>
      <span>{msg || 'Finn leser hver sak og setter én av de åtte hovedkategoriene.'}</span>
      <button type="button" className="finn-link" onClick={run} disabled={busy}>{busy ? 'Setter …' : 'Sett nå'}</button>
    </div>
  );
}

// Finn's fact proposals for all existing cases. Nothing runs until someone
// confirms the estimated cost here.
const USD_NOK = 11;
function FactProposals({ st, load }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!st || !st.configured || !st.remaining) return null;
  let run = null;
  try { run = st.confirmed ? JSON.parse(st.confirmed) : null; } catch (_e) { run = null; }
  const running = run?.batch && !run.finished_at;
  const kr = `ca. ${Math.round((st.cost_usd.low * USD_NOK) / 10) * 10}–${Math.round((st.cost_usd.high * USD_NOK) / 10) * 10} kr`;
  const start = async () => {
    if (!window.confirm(`Finn lager forslag til faktamelding for ${st.remaining} saker.\n\nAnslått kostnad: ${kr} (${st.cost_usd.low}–${st.cost_usd.high} USD).\n\nForslagene lagres på hver sak. Ingenting publiseres. Bekrefte kostnaden og starte?`)) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/backoffice/finn/faktaforslag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', confirm: true }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) setErr(d.error || d.reason || 'Kunne ikke starte.');
      load();
    } finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await fetch('/api/backoffice/finn/faktaforslag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) }); load(); } finally { setBusy(false); }
  };
  return (
    <div className="sk-task">
      <strong>{running ? `Finn lager faktaforslag (${st.remaining} igjen)` : `Faktaforslag for ${st.remaining} saker`}</strong>
      <span>{err || (running
        ? 'Forslagene lagres på hver sak etter hvert. Ingenting publiseres. Oppdater siden for å se framdriften.'
        : `Finn skriver et forslag til faktamelding på hver sak, bare med fakta om stedet. Ingenting publiseres. Anslått kostnad ${kr}.`)}</span>
      {running
        ? <button type="button" className="finn-link" onClick={stop} disabled={busy}>Stopp</button>
        : <button type="button" className="finn-link" onClick={start} disabled={busy}>{busy ? 'Starter …' : 'Bekreft kostnad og start'}</button>}
    </div>
  );
}

function FillContext({ missing, oldSite = 0, onDone }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setMsg('Henter ulykker og trafikk …');
    for (let round = 0; round < 30; round += 1) {
      try {
        const r = await fetch('/api/cron/ulykker?kjede=1', { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { setMsg('Stoppet. Prøv igjen.'); break; }
        if (d.chained) { setMsg(`Hentes videre på serveren (${d.remaining} igjen). Du kan lukke siden.`); break; }
        setMsg(`${d.remaining} igjen …`);
        if (!d.remaining || !(d.done || d.refreshed)) { setMsg('Ferdig.'); break; }
      } catch (_e) { setMsg('Nettverksfeil. Prøv igjen.'); break; }
    }
    setBusy(false); onDone();
  };
  return (
    <div className="sk-task">
      <strong>{missing > 0 ? `${missing} saker mangler ulykker, trafikk og barnetall` : `${oldSite} saker får oppdaterte vegdata`}</strong>
      <span>{msg || (missing > 0 ? 'Politiregistrerte ulykker, ÅDT og barn som bor i nærheten hentes for hver sak.' : 'Fortau hentes nå også fra Statens vegvesens fortau-register, og trafikktall knyttes til vegen saken ligger på. Gratis, tar noen minutter.')}</span>
      <button type="button" className="finn-link" onClick={run} disabled={busy}>{busy ? 'Henter …' : 'Hent nå'}</button>
    </div>
  );
}

export default function Saker() {
  const router = useRouter();
  const queueKey = QUEUES.some((x) => x.key === router.query.ko && !x.href) ? router.query.ko : 'idag';
  const [cases, setCases] = useState(null);
  const [pri, setPri] = useState(null);
  const [me, setMe] = useState(null);
  const [counts, setCounts] = useState({});
  const [factDrafts, setFactDrafts] = useState([]);
  const [proposals, setProposals] = useState(null);
  const [incidents, setIncidents] = useState(null);
  const loadProposals = useCallback(() => {
    fetch('/api/backoffice/finn/faktaforslag').then((r) => (r.ok ? r.json() : null)).then((d) => d && setProposals(d)).catch(() => {});
  }, []);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kommune, setKommune] = useState('');
  const [owner, setOwner] = useState('');
  const [cat, setCat] = useState('');
  const riskOnly = router.query.risiko === '1';
  useEffect(() => { if (router.isReady && typeof router.query.kommune === 'string') setKommune(router.query.kommune); }, [router.isReady, router.query.kommune]);
  const [shown, setShown] = useState(PAGE);
  const { stars, team, toggle } = useStars();

  const loadPri = useCallback(() => fetch('/api/backoffice/prioritering').then((r) => (r.ok ? r.json() : null)).then((d) => d && setPri(d)).catch(() => {}), []);
  useEffect(() => {
    fetch('/api/backoffice/cases').then(async (r) => {
      if (r.status === 403) throw new Error('not-authed');
      if (!r.ok) throw new Error('Kunne ikke hente saker.');
      return r.json();
    }).then((d) => setCases(d.cases || [])).catch((e) => setError(e.message));
    loadPri();
    fetch('/api/staff/me').then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
    loadProposals();
    // Also keeps the incident log fresh: the API fetches new ones when it's stale.
    fetch('/api/backoffice/trafikkhendelser?dager=7').then((r) => (r.ok ? r.json() : null)).then((d) => d && setIncidents(d)).catch(() => {});
    fetch('/api/backoffice/finn/faktamelding').then((r) => (r.ok ? r.json() : null)).then((d) => d && setFactDrafts(d.drafts || [])).catch(() => {});
    fetch('/api/backoffice/finn/brief').then((r) => (r.ok ? r.json() : null)).then((d) => d && setCounts(d.counts || {})).catch(() => {});
  }, [loadPri, loadProposals]);
  useEffect(() => { setShown(PAGE); }, [queueKey, q, kommune, owner, cat]);
  // While Finn works through a backlog, refresh the count every half minute.
  const pendingNow = pri?.pending || 0;
  useEffect(() => {
    if (!pendingNow || queueKey !== 'idag') return undefined;
    const t = setInterval(loadPri, 30000);
    return () => clearInterval(t);
  }, [pendingNow, queueKey, loadPri]);

  const rows = useMemo(() => {
    const tri = new Map((pri?.cases || []).map((t) => [t.id, t]));
    return (cases || []).filter((c) => !c.parent_report_id).map((c) => ({ ...c, t: tri.get(c.id) || null }));
  }, [cases, pri]);
  const open = useMemo(() => rows.filter((c) => c.status !== DONE), [rows]);
  const score = (c) => c.t?.score || 0;
  const myEmail = String(me?.email || '').toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  const queues = useMemo(() => {
    const byScore = (a, b) => score(b) - score(a) || String(b.created_at).localeCompare(String(a.created_at));
    return {
      // The team's work list; the one that has waited longest for an update first.
      stjerne: rows.filter((c) => team.has(c.id))
        .sort((a, b) => String(a.public_status_updated_at || a.created_at).localeCompare(String(b.public_status_updated_at || b.created_at))),
      mine: open.filter((c) => myEmail && String(c.assignee_email || '').toLowerCase() === myEmail).sort(byScore),
      viktigst: open.filter((c) => c.t).sort(byScore),
      raske: open.filter((c) => c.t && (c.t.quick_win || c.t.effort === 'enkel')).sort(byScore),
      // New cases get «Registrert» at once, so «new» means the last 7 days.
      nye: rows.filter((c) => c.status === REPORT_STATUS.NEW || Date.now() - new Date(c.created_at).getTime() < 7 * 864e5).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      kontakt: open.filter((c) => Number(c.contact_count) > 0).sort(byScore),
    };
  }, [open, rows, team, myEmail]);

  const options = useMemo(() => {
    const uniq = (f) => Array.from(new Set(open.map(f).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nb'));
    return { kommune: uniq((c) => c.t?.kommune_navn), owner: uniq((c) => c.t?.responsible) };
  }, [open]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (queues[queueKey] || []).filter((c) => (
      (!kommune || c.t?.kommune_navn === kommune)
      && (!owner || c.t?.responsible === owner)
      && (!cat || caseCategory(c) === cat)
      && (!riskOnly || (c.t && isRiskSite({ ...c.t, status: c.status })))
      && (!query || `${c.category} ${c.description || ''} ${c.t?.summary || ''} ${c.t?.measure || ''} ${c.t?.kommune_navn || ''}`.toLowerCase().includes(query))
    ));
  }, [queues, queueKey, q, kommune, owner, cat, riskOnly]);

  const setStatus = (id) => async (v) => {
    await setCaseStatus(id, v);
    setCases((cs) => cs.map((x) => (x.id === id ? { ...x, status: v } : x)));
  };
  const row = (c) => <CaseRow key={c.id} c={c} star={stars.has(c.id)} starredBy={team.get(c.id)} showUpdate={queueKey === 'stjerne'} onStar={() => toggle(c.id)} onStatus={setStatus(c.id)} />;

  const overdue = open.filter((c) => c.due_date && String(c.due_date).slice(0, 10) < today).length;
  const newDay = rows.filter((c) => Date.now() - new Date(c.created_at).getTime() < 864e5).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const starredList = queues.stjerne || [];
  const label = QUEUES.find((x) => x.key === queueKey)?.label || 'Saker';
  useEffect(() => {
    if (!cases) return;
    if (queueKey === 'idag') rememberQueue('Stjernemerket', starredList.map((c) => c.id));
    else rememberQueue(label, list.map((c) => c.id));
  }, [cases, queueKey, list, starredList, label]);
  const tasks = [
    counts.likeSaker > 0 && { href: '/backoffice/sammenkobling', title: `${counts.likeSaker} forslag om like saker`, text: 'Koble meldinger om samme sted. Ingenting slettes.' },
    counts.flagg > 0 && { href: '/backoffice/finn/personvern', title: `${counts.flagg} personvernflagg`, text: 'Navn, bilnummer eller testmeldinger å se på.' },
    overdue > 0 && { href: '/backoffice/liste?aging=over', title: `${overdue} saker over fristen`, text: 'Følg opp eller sett ny frist.' },
    incidents?.near_cases_7d > 0 && { href: '/backoffice/oversikt#trafikkulykker', title: `${incidents.near_cases_7d} ${incidents.near_cases_7d === 1 ? 'trafikkulykke' : 'trafikkulykker'} nær meldte steder`, text: 'Siste 7 dager, fra politiloggen og Statens vegvesen. Bare internt.' },
  ].filter(Boolean);

  return (
    <>
      <Head><title>Saker – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader counts={cases && pri ? Object.fromEntries(Object.entries(queues).map(([k, v]) => [k, v.length])) : null} />
      <main className="page admin-page sk">

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && (!cases || (!pri && queueKey !== 'idag' && queueKey !== 'nye')) && <p className="admin-list-empty">Henter saker …</p>}

        {cases && queueKey === 'idag' && (
          <div className="sk-today">
            <FinnBrief compact />
            {(tasks.length > 0 || (proposals?.configured && proposals.remaining > 0) || (pri && (pri.missingContext > 0 || pri.oldSite > 0 || (pri.configured && (pri.pending > 0 || pri.missingCategory > 0))))) && (
              <section>
                <h2 className="sk-h2">Oppgaver</h2>
                <div className="sk-tasks">
                  {tasks.map((x) => (
                    <Link key={x.href} href={x.href} className="sk-task"><strong>{x.title}</strong><span>{x.text}</span></Link>
                  ))}
                  {pri && pri.configured && pri.missingCategory > 0 && <FillCategories missing={pri.missingCategory} onDone={loadPri} />}
                  <FactProposals st={proposals} load={loadProposals} />
                  {pri && (pri.missingContext > 0 || pri.oldSite > 0) && <FillContext missing={pri.missingContext} oldSite={pri.oldSite || 0} onDone={loadPri} />}
                  {pri && pri.configured && pri.pending > 0 && <RunAssessments pending={pri.pending} reassess={pri.reassess || 0} onDone={loadPri} />}
                </div>
              </section>
            )}
            {factDrafts.length > 0 && (
              <section>
                <div className="sk-h2row">
                  <h2 className="sk-h2">Faktameldinger til godkjenning ({factDrafts.length})</h2>
                </div>
                <ul className="sk-facts">
                  {factDrafts.slice(0, 8).map((f) => {
                    const c = rows.find((x) => x.id === f.report_id);
                    return (
                      <li key={f.report_id}>
                        <Link href={`/backoffice/sak/${f.report_id}`} onClick={() => rememberQueue('Faktameldinger', factDrafts.map((x) => x.report_id))}>
                          <strong>{c ? caseCategory(c) : 'Sak'}{c?.t?.kommune_navn ? ` · ${c.t.kommune_navn}` : ''}</strong>
                          <span>{String(f.message).split('\n')[0].slice(0, 180)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <section>
              <div className="sk-h2row">
                <h2 className="sk-h2">Arbeidslista (stjernemerket)</h2>
                <Link href="/backoffice/saker?ko=stjerne" className="finn-link">{starredList.length ? `Alle ${starredList.length} ›` : 'Åpne ›'}</Link>
              </div>
              {starredList.length === 0
                ? <p className="admin-list-empty">Ingen saker i arbeidslista. Trykk ☆ på en sak for å legge den til.</p>
                : <ul className="sk-list">{starredList.slice(0, 5).map((c) => <CaseRow key={c.id} c={c} star={stars.has(c.id)} starredBy={team.get(c.id)} showUpdate onStar={() => toggle(c.id)} onStatus={setStatus(c.id)} />)}</ul>}
            </section>
            <section>
              <div className="sk-h2row">
                <h2 className="sk-h2">Nye siste døgn</h2>
                {newDay.length > 5 && <Link href="/backoffice/saker?ko=nye" className="finn-link">Alle nye ›</Link>}
              </div>
              {newDay.length === 0 ? <p className="admin-list-empty">Ingen nye meldinger siste døgn.</p> : <ul className="sk-list">{newDay.slice(0, 5).map(row)}</ul>}
            </section>
          </div>
        )}

        {cases && queueKey !== 'idag' && (pri || queueKey === 'nye') && (
          <>
            <p className="sk-hint">{HINT[queueKey]}</p>
            {riskOnly && (
              <p className="sk-filterchip">
                Viser bare risikosteder: mange barn, mye trafikk og mangler eller ulykker.
                <Link href={{ pathname: '/backoffice/saker', query: { ko: queueKey } }}>Vis alle ×</Link>
              </p>
            )}
            <div className="sk-filters">
              <input className="sak-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i køen …" aria-label="Søk" />
              <select className="comp-select" value={kommune} onChange={(e) => setKommune(e.target.value)} aria-label="Kommune">
                <option value="">Alle kommuner</option>
                {options.kommune.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select className="comp-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kategori">
                <option value="">Alle kategorier</option>
                {MAIN_CATEGORY_LABELS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select className="comp-select" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Veieier">
                <option value="">Alle veieiere</option>
                {options.owner.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            {list.length === 0 ? (
              <p className="admin-list-empty">{queueKey === 'stjerne' ? 'Arbeidslista er tom. Trykk ☆ på en sak for å legge den til.' : 'Ingen saker her.'}</p>
            ) : (
              <>
                <p className="sak-count">{list.length} saker{list.length > shown ? ` · viser ${shown}` : ''}</p>
                <ol className="sk-list">{list.slice(0, shown).map(row)}</ol>
                {list.length > shown && (
                  <button type="button" className="big-button big-button--secondary list-more" onClick={() => setShown((n) => n + PAGE)}>Vis {Math.min(PAGE, list.length - shown)} til</button>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
