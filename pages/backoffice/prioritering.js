import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';

// AI-assisted priority list: Claude has read every report and suggested a
// measure, effort, road owner and urgency. Staff decide; this sorts the pile.
const VIEWS = [
  { key: 'viktigst', label: 'Viktigst nå', hint: 'Hast, støtte og flere meldinger på samme sted' },
  { key: 'raske', label: 'Raske gevinster', hint: 'Enkle tiltak som trolig løses med én henvendelse' },
  { key: 'store', label: 'Store saker med engasjement', hint: 'Krever plan og budsjett, men mange bryr seg' },
  { key: 'befaring', label: 'Trenger befaring', hint: 'For vage til å vurdere uten å se stedet' },
];
const EFFORT_LABEL = { enkel: 'Enkel', middels: 'Middels', stor: 'Stor' };
const PAGE = 50;

function Urgency({ n }) {
  return (
    <span className="pri-urg" title={`Hast ${n} av 5`} aria-label={`Hast ${n} av 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  );
}

function RunAssessments({ pending, onDone }) {
  const [state, setState] = useState({ running: false, msg: '' });
  const run = async () => {
    setState({ running: true, msg: 'Starter …' });
    let total = 0;
    for (let round = 0; round < 80; round += 1) {
      try {
        const r = await fetch('/api/cron/ai-triage', { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) { setState({ running: false, msg: d.reason || d.error || 'Stoppet.' }); onDone(); return; }
        total += d.assessed || 0;
        setState({ running: true, msg: `${total} vurdert, ${d.remaining} igjen …` });
        if (!d.remaining) break;
        if (!d.assessed && round > 2) break;
      } catch (_e) { setState({ running: false, msg: 'Nettverksfeil. Prøv igjen.' }); onDone(); return; }
    }
    setState({ running: false, msg: `Ferdig: ${total} vurdert.` });
    onDone();
  };
  return (
    <div className="pri-run">
      <button type="button" className="big-button big-button--secondary" onClick={run} disabled={state.running || pending === 0}>
        {state.running ? 'Vurderer …' : `Vurder ${pending} ventende`}
      </button>
      {state.msg && <span>{state.msg}</span>}
    </div>
  );
}

export default function Prioritering() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('viktigst');
  const [filters, setFilters] = useState({ responsible: '', fylke: '', kommune: '', measure: '' });
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/backoffice/prioritering');
      if (r.status === 403) { setError('not-authed'); return; }
      if (!r.ok) { setError('Kunne ikke hente lista.'); return; }
      setData(await r.json());
    } catch (_e) { setError('Kunne ikke hente lista.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShown(PAGE); }, [view, filters]);

  const cases = data?.cases || [];
  const options = useMemo(() => {
    const uniq = (f) => Array.from(new Set(cases.map(f).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nb'));
    return {
      responsible: uniq((c) => c.responsible),
      fylke: uniq((c) => c.fylke),
      kommune: uniq((c) => (!filters.fylke || c.fylke === filters.fylke ? c.kommune_navn : null)),
      measure: uniq((c) => c.measure_type),
    };
  }, [cases, filters.fylke]);

  const filtered = useMemo(() => cases.filter((c) => (
    (!filters.responsible || c.responsible === filters.responsible)
    && (!filters.fylke || c.fylke === filters.fylke)
    && (!filters.kommune || c.kommune_navn === filters.kommune)
    && (!filters.measure || c.measure_type === filters.measure)
  )), [cases, filters]);

  const list = useMemo(() => {
    if (view === 'raske') return filtered.filter((c) => c.quick_win || c.effort === 'enkel');
    if (view === 'store') {
      return filtered.filter((c) => c.effort === 'stor')
        .sort((a, b) => (b.support_count + b.nearby * 2) - (a.support_count + a.nearby * 2) || b.score - a.score);
    }
    if (view === 'befaring') return filtered.filter((c) => c.needs_site_visit);
    return filtered;
  }, [filtered, view]);

  const counts = useMemo(() => ({
    viktigst: filtered.length,
    raske: filtered.filter((c) => c.quick_win || c.effort === 'enkel').length,
    store: filtered.filter((c) => c.effort === 'stor').length,
    befaring: filtered.filter((c) => c.needs_site_visit).length,
  }), [filtered]);

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v, ...(k === 'fylke' ? { kommune: '' } : {}) }));

  return (
    <>
      <Head><title>Prioritering – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Prioritering" />
      <main className="page admin-list-page pri">
        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && !data && <p className="admin-list-empty">Henter …</p>}
        {data && (
          <>
            <section className="pri-top">
              <div>
                <h1>Hva bør vi ta først?</h1>
                <p>Claude har lest {data.assessed} av {data.open} åpne saker og foreslått tiltak, innsats, veieier og hast. Forslagene er råd, ikke vedtak.</p>
              </div>
              {data.configured
                ? (data.pending > 0 && <RunAssessments pending={data.pending} onDone={load} />)
                : <p className="pri-warn">AI er ikke koblet til ennå: legg inn <code>ANTHROPIC_API_KEY</code> i Vercel (Settings → Environment Variables) og publiser på nytt.</p>}
            </section>

            <div className="pri-views" role="tablist">
              {VIEWS.map((v) => (
                <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'pri-view pri-view--on' : 'pri-view'} onClick={() => setView(v.key)}>
                  <strong>{v.label}</strong><span>{counts[v.key]}</span>
                </button>
              ))}
            </div>
            <p className="pri-hint">{VIEWS.find((v) => v.key === view)?.hint}</p>

            <div className="pri-filters">
              <select className="comp-select" value={filters.responsible} onChange={(e) => setFilter('responsible', e.target.value)} aria-label="Veieier">
                <option value="">Alle veieiere</option>
                {options.responsible.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select className="comp-select" value={filters.fylke} onChange={(e) => setFilter('fylke', e.target.value)} aria-label="Fylke">
                <option value="">Hele landet</option>
                {options.fylke.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select className="comp-select" value={filters.kommune} onChange={(e) => setFilter('kommune', e.target.value)} aria-label="Kommune">
                <option value="">Alle kommuner</option>
                {options.kommune.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select className="comp-select" value={filters.measure} onChange={(e) => setFilter('measure', e.target.value)} aria-label="Tiltak">
                <option value="">Alle tiltak</option>
                {options.measure.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>

            {list.length === 0 && <p className="admin-list-empty">Ingen saker her.</p>}
            <ol className="pri-list">
              {list.slice(0, shown).map((c, i) => (
                <li key={c.id}>
                  <Link className="pri-item" href={`/backoffice/sak/${encodeURIComponent(c.id)}`}>
                    <span className="pri-item__rank">{i + 1}</span>
                    <span className="pri-item__body">
                      <span className="pri-item__top">
                        <strong>{c.measure}</strong>
                        <span className={`pri-effort pri-effort--${c.effort}`}>{EFFORT_LABEL[c.effort] || c.effort}</span>
                        <Urgency n={c.urgency} />
                      </span>
                      <span className="pri-item__sum">{c.summary}</span>
                      <span className="pri-item__meta">
                        <span>{c.category}</span>
                        {c.kommune_navn && <span>{c.kommune_navn}</span>}
                        <span>{c.responsible}</span>
                        {Number(c.support_count) > 0 && <span>♥ {c.support_count}</span>}
                        {Number(c.nearby) > 0 && <span>{c.nearby} til på samme sted</span>}
                      </span>
                      {Array.isArray(c.next_steps) && c.next_steps.length > 0 && (
                        <span className="pri-item__next">Neste: {c.next_steps[0]}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            {list.length > shown && (
              <button type="button" className="big-button big-button--secondary list-more" onClick={() => setShown((n) => n + PAGE)}>Vis flere ({list.length - shown} til)</button>
            )}
          </>
        )}
      </main>
    </>
  );
}
