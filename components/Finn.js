import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

// Finn: the AI adviser in the backoffice. Shared pieces used on Oversikt, the
// Finn page and case pages.

export function FinnAvatar({ size = 40 }) {
  return (
    <span className="finn-avatar" style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden="true">
      F<i>✦</i>
    </span>
  );
}

export const EFFORT_TEXT = {
  enkel: 'Enkel innsats: skilt, merking, klipping eller lys. Ofte løst på uker.',
  middels: 'Middels innsats: fartshumper, enkel ombygging, krever et vedtak.',
  stor: 'Stor innsats: fortau, gang- og sykkelvei eller nytt kryss. Krever plan og budsjett.',
};
export function EffortChip({ effort }) {
  if (!effort) return null;
  const label = { enkel: 'Enkel', middels: 'Middels', stor: 'Stor' }[effort] || effort;
  return <span className={`pri-effort pri-effort--${effort}`} title={EFFORT_TEXT[effort]}>{label} innsats</span>;
}
export function UrgencyDots({ n, label = true }) {
  const v = Number(n) || 0;
  return (
    <span className="finn-urg" title={`Hast ${v} av 5`}>
      <span className="pri-urg" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? 'on' : ''} />)}</span>
      {label && <span>Hast {v}/5</span>}
    </span>
  );
}

// Minimal, safe rendering of Finn's text: paragraphs, "- " lists, **bold**
// and [sak:ID] links. No HTML from the model is ever injected.
function inline(text, keyBase) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\[sak:([0-9a-f-]{36})\]/gi;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>);
    else out.push(<Link key={`${keyBase}-l${i}`} className="finn-caselink" href={`/backoffice/sak/${m[2]}`}>åpne sak</Link>);
    last = m.index + m[0].length; i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function FinnText({ text }) {
  const blocks = String(text || '').split(/\n{2,}/);
  return (
    <div className="finn-text">
      {blocks.map((b, bi) => {
        const lines = b.split('\n').filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), `${bi}-${li}`)}</li>)}</ul>;
        }
        return <p key={bi}>{lines.map((l, li) => <span key={li}>{li > 0 && <br />}{inline(l.replace(/^#+\s*/, ''), `${bi}-${li}`)}</span>)}</p>;
      })}
    </div>
  );
}

const fmtTime = (v) => (v ? new Date(v).toLocaleString('nb-NO', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '');

// Today's brief with key numbers. Writes today's brief on first view if the
// nightly run hasn't (e.g. right after deploy).
export function FinnBrief({ compact = false }) {
  const [data, setData] = useState(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const asked = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/backoffice/finn/brief');
      if (!r.ok) { setError(r.status === 403 ? '' : 'Finn er ikke tilgjengelig akkurat nå.'); return null; }
      const d = await r.json(); setData(d); return d;
    } catch (_e) { setError('Finn er ikke tilgjengelig akkurat nå.'); return null; }
  }, []);

  const write = useCallback(async () => {
    setWriting(true); setError('');
    try {
      const r = await fetch('/api/backoffice/finn/brief', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) setError(d.reason || d.error || 'Finn klarte ikke å skrive nå.');
      else setData((x) => ({ ...x, brief: d.brief }));
    } finally { setWriting(false); }
  }, []);

  useEffect(() => {
    load().then((d) => {
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
      if (d && d.configured && (d.brief?.scope !== today || d.brief?.content?.v !== 2) && !asked.current) { asked.current = true; write(); }
    });
  }, [load, write]);

  const b = data?.brief?.content;
  const s = data?.stats;
  const c = data?.counts;
  const chips = s ? [
    { n: s.nye_i_perioden, label: 'nye siste døgn', href: '/backoffice/liste' },
    { n: s.hastesaker_apne, label: 'hastesaker', href: '/backoffice/prioritering', warn: s.hastesaker_apne > 0 },
    { n: s.raske_gevinster_apne, label: 'raske gevinster', href: '/backoffice/prioritering?vis=raske' },
    { n: c?.likeSaker ?? 0, label: 'forslag om like saker', href: '/backoffice/sammenkobling', warn: (c?.likeSaker || 0) > 0 },
    { n: c?.flagg ?? 0, label: 'personvernflagg', href: '/backoffice/finn/personvern', warn: (c?.flagg || 0) > 0 },
  ] : [];

  return (
    <section className={compact ? 'finn-brief finn-brief--compact' : 'finn-brief'}>
      <div className="finn-brief__head">
        {compact && <FinnAvatar size={40} />}
        <div>
          <span className="finn-kicker">Finn · i dag</span>
          <h2>{b?.headline || (writing ? 'Finn leser gjennom sakene …' : data && !data.configured ? 'Finn er ikke koblet til ennå' : 'God morgen')}</h2>
        </div>
      </div>
      {error && <p className="finn-brief__err">{error}</p>}
      {data && !data.configured && <p className="finn-brief__sum">Legg inn <code>ANTHROPIC_API_KEY</code> i Vercel for å vekke Finn.</p>}
      {b?.summary && <p className="finn-brief__sum">{b.summary}</p>}
      {writing && !b && <div className="finn-skeleton"><i /><i /><i /></div>}
      {chips.length > 0 && (
        <div className="finn-chips">
          {chips.map((x) => (
            <Link key={x.label} href={x.href} className={x.warn ? 'finn-chip finn-chip--warn' : 'finn-chip'}><strong>{x.n}</strong>{x.label}</Link>
          ))}
        </div>
      )}
      {Array.isArray(b?.focus) && b.focus.length > 0 && (
        <>
          <h3 className="finn-brief__h3">Ta disse først</h3>
          <ol className="finn-focus">
            {b.focus.map((f) => (
              <li key={f.case_id}>
                <Link href={`/backoffice/sak/${encodeURIComponent(f.case_id)}`}>
                  <strong>{f.title}</strong>
                  <span>{f.why}</span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
      {b?.tip && <p className="finn-tip"><b>Finns råd:</b> {b.tip}</p>}
      <div className="finn-brief__foot">
        {data?.brief && <span>Skrevet {fmtTime(data.brief.created_at)}{data.total ? ` · ${data.assessed} av ${data.total} saker vurdert` : ''}</span>}
        {data?.configured && <button type="button" className="finn-link" onClick={write} disabled={writing}>{writing ? 'Skriver …' : 'Skriv på nytt'}</button>}
        {compact && <Link className="finn-link" href="/backoffice/finn">Alt Finn kan gjøre ›</Link>}
      </div>
    </section>
  );
}

const EXAMPLES = [
  ['Flest hastesaker per kommune', 'Hvilke kommuner har flest hastesaker nå?'],
  ['Meldinger per måned', 'Hvor mange saker har kommet hver måned i år?'],
  ['Raske gevinster hos Statens vegvesen', 'Hvilke raske gevinster ligger hos Statens vegvesen?'],
];

export function FinnAsk({ initial = '', compact = false }) {
  const [q, setQ] = useState(initial);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);

  const ask = useCallback(async (question) => {
    const text = String(question || '').trim();
    if (text.length < 3 || busy) return;
    if (compact) { window.location.href = `/backoffice/finn?spor=${encodeURIComponent(text)}`; return; }
    setBusy(true); setError(''); setQ('');
    setLog((l) => [...l, { q: text, a: null }]);
    try {
      const r = await fetch('/api/backoffice/finn/spor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, history: log.filter((h) => h.a).map(({ q: hq, a }) => ({ q: hq, a })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setError(d.reason || d.error || 'Finn klarte ikke å svare.'); setLog((l) => l.slice(0, -1)); setQ(text); return; }
      setLog((l) => [...l.slice(0, -1), { q: text, a: d.answer }]);
    } catch (_e) { setError('Nettverksfeil. Prøv igjen.'); setLog((l) => l.slice(0, -1)); setQ(text); } finally { setBusy(false); }
  }, [busy, compact, log]);

  useEffect(() => { if (initial && !started.current && !compact) { started.current = true; ask(initial); } }, [initial, compact, ask]);

  return (
    <section className={compact ? 'finn-ask finn-ask--compact' : 'finn-ask'}>
      {!compact && <h2 className="finn-ask__title">Spør Finn om tallene</h2>}
      {log.map((h, i) => (
        <div key={i} className="finn-turn">
          <p className="finn-turn__q">{h.q}</p>
          {h.a ? <FinnText text={h.a} /> : <div className="finn-skeleton"><i /><i /></div>}
        </div>
      ))}
      {error && <p className="finn-brief__err">{error}</p>}
      <form className="finn-ask__form" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={compact ? 'Spør Finn om sakene …' : 'Spør om sakene …'} aria-label="Spørsmål til Finn" maxLength={1000} />
        <button type="submit" disabled={busy || q.trim().length < 3}>{busy ? 'Tenker …' : 'Spør'}</button>
      </form>
      {log.length === 0 && (
        <div className="finn-examples">
          {EXAMPLES.map(([label, full]) => <button key={label} type="button" onClick={() => ask(full)}>{label}</button>)}
        </div>
      )}
    </section>
  );
}

// «Finn foreslår framdrift» on a case page.
export function FinnProgress({ id, contactEmail = null }) {
  const [plan, setPlan] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!id) return;
    fetch(`/api/backoffice/finn/framdrift?id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setPlan(d.plan); setConfigured(d.configured); }
    }).catch(() => {});
  }, [id]);
  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/backoffice/finn/framdrift?id=${encodeURIComponent(id)}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) setMsg(d.reason || d.error || 'Finn klarte ikke dette nå.');
      else setPlan(d.plan);
    } catch (_e) { setMsg('Nettverksfeil.'); } finally { setBusy(false); }
  };
  const p = plan?.content;
  const copy = async () => { try { await navigator.clipboard.writeText(p.message_draft); setMsg('Henvendelsen er kopiert.'); } catch (_e) { setMsg('Kunne ikke kopiere.'); } };
  return (
    <div className="finn-progress">
      <div className="finn-progress__head">
        <h3>Framdrift</h3>
        {configured && <button type="button" className={p ? 'finn-link' : 'finn-btn'} onClick={run} disabled={busy}>{busy ? 'Finn leser historikken …' : p ? 'Oppdater forslaget' : '✦ Finn foreslår framdrift'}</button>}
      </div>
      {busy && !p && <div className="finn-skeleton"><i /><i /><i /></div>}
      {!p && !busy && <p className="sak-ai__note">Finn leser saken, det som har skjedd, og tidligere saker i nærheten og hos samme veieier, og foreslår neste steg.</p>}
      {p && (
        <>
          <p>{p.situation}</p>
          <p className="sak-kv finn-kv"><span>Kontakt</span><b>{p.recipient}</b></p>
          <ol className="finn-steps">
            {p.steps.map((s) => <li key={s.step}><strong>{s.step}</strong><span>{s.why}</span><em>{s.when}</em></li>)}
          </ol>
          {p.arguments?.length > 0 && (
            <>
              <h4>Argumenter som virker her</h4>
              <ul className="finn-args">{p.arguments.map((a) => <li key={a}>{a}</li>)}</ul>
            </>
          )}
          {p.learned_from_history && <p className="finn-tip"><b>Fra tidligere saker{plan.content.related_count ? ` (${plan.content.related_count})` : ''}:</b> {p.learned_from_history}</p>}
          {p.reporter_message && (
            <div className="finn-reporter">
              <strong>Følg opp med melderen</strong>
              <p>{p.reporter_message}</p>
              <div className="finn-row">
                {contactEmail && <a className="finn-btn" href={`mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent('Om meldingen din på Finnsvei')}&body=${encodeURIComponent(`${p.reporter_message}\n\nVennlig hilsen\nStiftelsen Finns.Fairway`)}`}>Skriv til melderen</a>}
                <button type="button" className="finn-link" onClick={async () => { try { await navigator.clipboard.writeText(p.reporter_message); setMsg('Meldingen er kopiert.'); } catch (_e) { setMsg('Kunne ikke kopiere.'); } }}>Kopier</button>
              </div>
              {!contactEmail && <span className="sak-ai__note">Kontaktinfo står på koblede meldinger eller som telefon. Se Detaljer.</span>}
            </div>
          )}
          {p.message_draft && (
            <details className="finn-draft">
              <summary>Utkast til henvendelse</summary>
              <p>{p.message_draft}</p>
              <button type="button" className="finn-link" onClick={copy}>Kopier</button>
            </details>
          )}
          <p className="sak-ai__note">Forslag fra Finn {new Date(plan.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}. Dere bestemmer.</p>
        </>
      )}
      {msg && <p className="finn-msg">{msg}</p>}
    </div>
  );
}
