import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../../components/BackofficeHeader';
import { EffortChip, FinnAvatar, UrgencyDots } from '../../../components/Finn';

// Per municipality: Finn's letter to a road owner and Finn's report for the
// municipality or the local press. Drafts only — staff edit and send.
const OWNERS = ['Kommunen', 'Fylkeskommunen', 'Statens vegvesen'];
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function Bars({ rows, labelKey, valueKey = 'antall', fmt }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <ul className="finn-bars">
      {rows.map((r) => (
        <li key={r[labelKey]}>
          <span>{fmt ? fmt(r[labelKey]) : r[labelKey]}</span>
          <i style={{ width: `${(r[valueKey] / max) * 100}%` }} />
          <b>{r[valueKey]}</b>
        </li>
      ))}
    </ul>
  );
}

function caseListText(cases, origin) {
  return cases.map((c, i) => `${i + 1}. ${c.category}${c.summary ? ` – ${c.summary}` : ''} (meldt ${fmtDate(c.created_at)}${Number(c.linked_count) > 0 ? `, ${Number(c.linked_count) + 1} meldinger` : ''}${Number(c.support_count) > 0 ? `, ${c.support_count} støtter` : ''})\n   ${origin}/sak/${c.id}`).join('\n');
}

function Letter({ data, kode, onSaved }) {
  const [owner, setOwner] = useState('Kommunen');
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState(null);

  const list = useMemo(() => data.cases.filter((c) => showAll || c.responsible === owner), [data.cases, owner, showAll]);
  useEffect(() => { setPicked(new Set(data.cases.filter((c) => c.responsible === owner).slice(0, 10).map((c) => c.id))); }, [owner, data.cases]);
  useEffect(() => {
    const last = data.letters.find((l) => l.content?.responsible === owner);
    setDraft(last ? { subject: last.content.subject, body: last.content.body, cases: last.content.cases, at: last.created_at } : null);
  }, [owner, data.letters]);

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const write = async () => {
    setBusy(true); setMsg('Finn skriver brevet …');
    try {
      const r = await fetch('/api/backoffice/finn/kommune', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kommune: kode, type: 'brev', responsible: owner, caseIds: [...picked], sender }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setMsg(d.reason || d.error || 'Finn klarte ikke å skrive brevet.'); return; }
      setDraft({ subject: d.letter.content.subject, body: d.letter.content.body, cases: d.letter.content.cases, at: d.letter.created_at });
      setMsg(''); onSaved();
    } catch (_e) { setMsg('Nettverksfeil.'); } finally { setBusy(false); }
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://finnsvei.no';
  const full = draft ? `${draft.body}\n\nVedlegg – sakene det gjelder:\n${caseListText(draft.cases || [], origin)}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(`Emne: ${draft.subject}\n\n${full}`); setMsg('Kopiert.'); } catch (_e) { setMsg('Kunne ikke kopiere.'); } };

  return (
    <div className="finn-letter">
      <div className="finn-row">
        <label>Til
          <select className="comp-select" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {OWNERS.map((o) => <option key={o} value={o}>{o === 'Kommunen' ? `${data.navn} kommune` : o}</option>)}
          </select>
        </label>
        <label>Signert av
          <input className="comp-select" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Navn, rolle" />
        </label>
      </div>
      <div className="finn-row finn-row--between">
        <strong>{picked.size} saker valgt</strong>
        <label className="finn-check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Vis saker hos alle veieiere</label>
      </div>
      {list.length === 0 && <p className="admin-list-empty">Finn har ingen åpne saker hos {owner.toLowerCase()} her.{!showAll ? ' Huk av for å se alle.' : ''}</p>}
      <ul className="finn-pick">
        {list.slice(0, 60).map((c) => (
          <li key={c.id}>
            <label>
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
              <span>
                <strong>{c.measure || c.category}</strong>
                <em>{c.summary || c.category}</em>
                <span className="finn-pick__meta">
                  <EffortChip effort={c.effort} />
                  {c.urgency ? <UrgencyDots n={c.urgency} /> : null}
                  {Number(c.linked_count) > 0 && <span>{Number(c.linked_count) + 1} meldinger</span>}
                  <span>{c.responsible || 'Veieier ukjent'}</span>
                  <Link href={`/backoffice/sak/${c.id}`} target="_blank">Åpne ↗</Link>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="big-button big-button--primary finn-go" onClick={write} disabled={busy || picked.size === 0 || !data.configured}>
        {busy ? 'Finn skriver …' : draft ? 'Skriv nytt brev' : 'La Finn skrive brevet'}
      </button>
      {msg && <p className="finn-msg">{msg}</p>}
      {draft && (
        <div className="finn-doc">
          <p className="finn-doc__meta">Utkast fra Finn · {fmtDate(draft.at)} · les gjennom og rett før du sender</p>
          <input className="finn-doc__subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} aria-label="Emne" />
          <textarea className="finn-doc__body" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={18} aria-label="Brev" />
          <details><summary>Vedlegg: sakslista ({(draft.cases || []).length})</summary><pre>{caseListText(draft.cases || [], origin)}</pre></details>
          <button type="button" className="big-button big-button--secondary" onClick={copy}>Kopier brev med saksliste</button>
        </div>
      )}
    </div>
  );
}

function Report({ data, kode, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const doc = data.report?.content;
  const s = data.stats;
  const write = async () => {
    setBusy(true); setMsg('Finn skriver rapporten …');
    try {
      const r = await fetch('/api/backoffice/finn/kommune', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kommune: kode, type: 'rapport' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setMsg(d.reason || d.error || 'Finn klarte ikke å skrive rapporten.'); return; }
      setMsg(''); onSaved();
    } catch (_e) { setMsg('Nettverksfeil.'); } finally { setBusy(false); }
  };
  const text = doc ? [doc.title, '', doc.lead, '', ...doc.sections.flatMap((x) => [x.heading, x.text, ''])].join('\n') : '';
  const copy = async () => { try { await navigator.clipboard.writeText(text); setMsg('Kopiert.'); } catch (_e) { setMsg('Kunne ikke kopiere.'); } };
  return (
    <div className="finn-report">
      <div className="finn-nums">
        <div><strong>{s.meldinger_totalt}</strong><span>meldinger</span></div>
        <div><strong>{s.saker}</strong><span>saker</span></div>
        <div><strong>{s.siste_30_dager}</strong><span>siste 30 dager</span></div>
        <div><strong>{s.hastesaker}</strong><span>hastesaker</span></div>
        <div><strong>{s.stotte_fra_innbyggere}</strong><span>støtter fra innbyggere</span></div>
      </div>
      <div className="finn-report__charts">
        <div><h3>Siste 12 måneder</h3><Bars rows={s.per_maned} labelKey="maned" fmt={(m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`} /></div>
        <div><h3>Hva meldes</h3><Bars rows={s.per_kategori} labelKey="navn" /></div>
      </div>
      <button type="button" className="big-button big-button--primary finn-go" onClick={write} disabled={busy || !data.configured}>
        {busy ? 'Finn skriver …' : doc ? 'Skriv rapporten på nytt' : 'La Finn skrive rapporten'}
      </button>
      {msg && <p className="finn-msg">{msg}</p>}
      {doc && (
        <article className="finn-doc finn-doc--report">
          <p className="finn-doc__meta">Fra Finn · {fmtDate(data.report.created_at)} · les gjennom før du deler</p>
          <h2>{doc.title}</h2>
          <p className="finn-doc__lead">{doc.lead}</p>
          {doc.sections.map((x) => <section key={x.heading}><h3>{x.heading}</h3><p>{x.text}</p></section>)}
          {doc.press_angle && <p className="finn-tip"><b>Vinkel for lokalavisa:</b> {doc.press_angle}</p>}
          <div className="finn-row">
            <button type="button" className="big-button big-button--secondary" onClick={copy}>Kopier tekst</button>
            <button type="button" className="big-button big-button--secondary" onClick={() => window.print()}>Skriv ut / PDF</button>
          </div>
        </article>
      )}
    </div>
  );
}

export default function FinnKommune() {
  const router = useRouter();
  const [kommuner, setKommuner] = useState(null);
  const [search, setSearch] = useState('');
  const [kode, setKode] = useState('');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('brev');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/backoffice/finn/kommune').then(async (r) => {
      if (r.status === 403) { setError('not-authed'); return; }
      const d = await r.json(); setKommuner(d.kommuner || []);
    }).catch(() => setError('Kunne ikke hente kommuner.'));
  }, []);
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.vis === 'rapport') setTab('rapport');
    if (typeof router.query.kommune === 'string') setKode(router.query.kommune);
  }, [router.isReady, router.query.vis, router.query.kommune]);

  const load = useCallback(async () => {
    if (!kode) return;
    const r = await fetch(`/api/backoffice/finn/kommune?kommune=${encodeURIComponent(kode)}`);
    if (r.ok) setData(await r.json()); else setError('Kunne ikke hente kommunen.');
  }, [kode]);
  useEffect(() => { setData(null); load(); }, [load]);

  const matches = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('nb');
    const all = kommuner || [];
    return (q ? all.filter((k) => k.navn.toLocaleLowerCase('nb').includes(q) || String(k.fylke || '').toLocaleLowerCase('nb').includes(q)) : [...all].sort((a, b) => b.antall - a.antall)).slice(0, 12);
  }, [kommuner, search]);

  return (
    <>
      <Head><title>Finn – kommune – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Brev og kommunerapport" />
      <main className="page admin-page finn-page">
        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        <header className="finn-hero finn-hero--small">
          <FinnAvatar size={44} />
          <div>
            <h1>Brev og kommunerapport</h1>
            <p>Velg en kommune. Finn skriver brev til riktig veieier om sakene du velger, eller en rapport kommunen og lokalavisa kan bruke.</p>
          </div>
        </header>
        <div className="finn-kpick">
          <input className="comp-select" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søk etter kommune eller fylke" aria-label="Søk kommune" />
          <div className="finn-kpick__list">
            {kommuner === null && <span>Henter …</span>}
            {matches.map((k) => (
              <button key={k.kode} type="button" className={k.kode === kode ? 'finn-kbtn finn-kbtn--on' : 'finn-kbtn'} onClick={() => { setKode(k.kode); router.replace({ query: { ...router.query, kommune: k.kode } }, undefined, { shallow: true }); }}>
                {k.navn}<small>{k.antall}</small>
              </button>
            ))}
          </div>
        </div>
        {kode && !data && !error && <p className="admin-list-empty">Henter …</p>}
        {data && (
          <>
            <div className="pri-views" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'brev'} className={tab === 'brev' ? 'pri-view pri-view--on' : 'pri-view'} onClick={() => setTab('brev')}><strong>Brev til veieier</strong><span>{data.cases.length}</span></button>
              <button type="button" role="tab" aria-selected={tab === 'rapport'} className={tab === 'rapport' ? 'pri-view pri-view--on' : 'pri-view'} onClick={() => setTab('rapport')}><strong>Kommunerapport</strong><span>{data.stats.meldinger_totalt}</span></button>
            </div>
            <h2 className="finn-kname">{data.navn}</h2>
            {tab === 'brev' ? <Letter data={data} kode={kode} onSaved={load} /> : <Report data={data} kode={kode} onSaved={load} />}
          </>
        )}
      </main>
    </>
  );
}
