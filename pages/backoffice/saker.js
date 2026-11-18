import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import { EffortChip, FinnBrief, UrgencyDots } from '../../components/Finn';
import { ShareButton, StarButton, StatusPicker, setCaseStatus, useStars } from '../../components/CaseQuick';
import { REPORT_STATUS } from '../../lib/config';
import { reportStatusMeta } from '../../lib/reportStatusMeta';
import { splitReportText } from '../../lib/reportText';
import { staffName, timeAgo } from '../../lib/backofficeFormat';
import { MAIN_CATEGORY_LABELS, caseCategory } from '../../lib/mainCategories';

// Saker: the one place for day-to-day case work. Fixed queues instead of
// separate pages; Finn's assessment, stars and status on every row.
const QUEUES = [
  { key: 'idag', label: 'I dag' },
  { key: 'mine', label: 'Mine' },
  { key: 'viktigst', label: 'Viktigst nå' },
  { key: 'raske', label: 'Raske gevinster' },
  { key: 'nye', label: 'Nye' },
  { key: 'kontakt', label: 'Kan følges opp' },
  { key: 'alle', label: 'Alle', href: '/backoffice/liste' },
];
const HINT = {
  mine: 'Saker du har stjernemerket eller er ansvarlig for.',
  viktigst: 'Finns rekkefølge: hast, engasjement og flere meldinger på samme sted. Ta ovenfra.',
  raske: 'Enkle tiltak som trolig løses med én henvendelse.',
  nye: 'Ikke behandlet ennå, nyeste først.',
  kontakt: 'En voksen melder har lagt igjen kontaktinfo og kan bidra med bilder eller befaring.',
};
const PAGE = 20;
const DONE = REPORT_STATUS.DONE;

function CaseRow({ c, star, onStar, onStatus }) {
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
      <span>{state.msg || (reassess > 0 ? 'Finn vurderer alt på nytt etter strengere regler for hast og befaring. Gamle vurderinger vises til de er erstattet.' : 'De kommer ikke med i køene før de er vurdert.')}</span>
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
        if (!d.remaining || !d.done) { setMsg('Ferdig.'); break; }
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

function FillContext({ missing, onDone }) {
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
        if (!d.remaining || !d.done) { setMsg('Ferdig.'); break; }
      } catch (_e) { setMsg('Nettverksfeil. Prøv igjen.'); break; }
    }
    setBusy(false); onDone();
  };
  return (
    <div className="sk-task">
      <strong>{missing} saker mangler ulykker, trafikk og barnetall</strong>
      <span>{msg || 'Politiregistrerte ulykker, ÅDT og barn som bor i nærheten hentes for hver sak.'}</span>
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
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kommune, setKommune] = useState('');
  const [owner, setOwner] = useState('');
  const [cat, setCat] = useState('');
  const [shown, setShown] = useState(PAGE);
  const { stars, toggle } = useStars();

  const loadPri = useCallback(() => fetch('/api/backoffice/prioritering').then((r) => (r.ok ? r.json() : null)).then((d) => d && setPri(d)).catch(() => {}), []);
  useEffect(() => {
    fetch('/api/backoffice/cases').then(async (r) => {
      if (r.status === 403) throw new Error('not-authed');
      if (!r.ok) throw new Error('Kunne ikke hente saker.');
      return r.json();
    }).then((d) => setCases(d.cases || [])).catch((e) => setError(e.message));
    loadPri();
    fetch('/api/staff/me').then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
    fetch('/api/backoffice/finn/brief').then((r) => (r.ok ? r.json() : null)).then((d) => d && setCounts(d.counts || {})).catch(() => {});
  }, [loadPri]);
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
      mine: open.filter((c) => stars.has(c.id) || (myEmail && String(c.assignee_email || '').toLowerCase() === myEmail))
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || byScore(a, b)),
      viktigst: open.filter((c) => c.t).sort(byScore),
      raske: open.filter((c) => c.t && (c.t.quick_win || c.t.effort === 'enkel')).sort(byScore),
      nye: rows.filter((c) => c.status === REPORT_STATUS.NEW).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      kontakt: open.filter((c) => Number(c.contact_count) > 0).sort(byScore),
    };
  }, [open, rows, stars, myEmail]);

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
      && (!query || `${c.category} ${c.description || ''} ${c.t?.summary || ''} ${c.t?.measure || ''} ${c.t?.kommune_navn || ''}`.toLowerCase().includes(query))
    ));
  }, [queues, queueKey, q, kommune, owner, cat]);

  const setStatus = (id) => async (v) => {
    await setCaseStatus(id, v);
    setCases((cs) => cs.map((x) => (x.id === id ? { ...x, status: v } : x)));
  };
  const row = (c) => <CaseRow key={c.id} c={c} star={stars.has(c.id)} onStar={() => toggle(c.id)} onStatus={setStatus(c.id)} />;

  const overdue = open.filter((c) => c.due_date && String(c.due_date).slice(0, 10) < today).length;
  const newDay = rows.filter((c) => Date.now() - new Date(c.created_at).getTime() < 864e5).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const tasks = [
    counts.likeSaker > 0 && { href: '/backoffice/sammenkobling', title: `${counts.likeSaker} forslag om like saker`, text: 'Koble meldinger om samme sted. Ingenting slettes.' },
    counts.flagg > 0 && { href: '/backoffice/finn/personvern', title: `${counts.flagg} personvernflagg`, text: 'Navn, bilnummer eller testmeldinger å se på.' },
    overdue > 0 && { href: '/backoffice/liste?aging=over', title: `${overdue} saker over fristen`, text: 'Følg opp eller sett ny frist.' },
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
            {(tasks.length > 0 || (pri && (pri.missingContext > 0 || (pri.configured && (pri.pending > 0 || pri.missingCategory > 0))))) && (
              <section>
                <h2 className="sk-h2">Oppgaver</h2>
                <div className="sk-tasks">
                  {tasks.map((x) => (
                    <Link key={x.href} href={x.href} className="sk-task"><strong>{x.title}</strong><span>{x.text}</span></Link>
                  ))}
                  {pri && pri.configured && pri.missingCategory > 0 && <FillCategories missing={pri.missingCategory} onDone={loadPri} />}
                  {pri && pri.missingContext > 0 && <FillContext missing={pri.missingContext} onDone={loadPri} />}
                  {pri && pri.configured && pri.pending > 0 && <RunAssessments pending={pri.pending} reassess={pri.reassess || 0} onDone={loadPri} />}
                </div>
              </section>
            )}
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
              <p className="admin-list-empty">{queueKey === 'mine' ? 'Ingen saker her ennå. Trykk ☆ på en sak for å legge den i «Mine».' : 'Ingen saker her.'}</p>
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
