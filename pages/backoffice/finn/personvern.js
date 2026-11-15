import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BackofficeHeader from '../../../components/BackofficeHeader';
import { FinnAvatar } from '../../../components/Finn';

// Privacy and quality: Finn flags personal details and test/junk reports.
// «Skjul opplysningene» replaces the public text with Finn's (editable)
// version; the original is kept for staff and can be restored. Nothing is
// deleted.
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function FlagItem({ f, onDone }) {
  const [text, setText] = useState(f.redacted_text || f.report.description || '');
  const [busy, setBusy] = useState('');
  const act = async (action) => {
    setBusy(action);
    try {
      const r = await fetch('/api/backoffice/finn/sjekk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reportId: f.report_id, text }) });
      if (r.ok) onDone(f.report_id);
    } finally { setBusy(''); }
  };
  return (
    <li className="finn-flag">
      <div className="finn-flag__tags">
        {f.personal_info && <span className="finn-tag finn-tag--warn">Personopplysninger{f.personal_kinds?.length ? `: ${f.personal_kinds.join(', ')}` : ''}</span>}
        {f.junk && <span className="finn-tag">Test eller tull?</span>}
        <span className="finn-flag__meta">{f.report.category} · {fmtDate(f.report.created_at)}{f.report.reporter_type === 'barn' ? ' · meldt av barn' : ''}</span>
      </div>
      {f.note && <p className="finn-flag__note">{f.note}</p>}
      <div className="finn-flag__texts">
        <div>
          <span className="finn-flag__label">Slik står det nå (offentlig)</span>
          <p>{f.report.description}</p>
        </div>
        {f.personal_info && (
          <div>
            <span className="finn-flag__label">Finns forslag (kan endres)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
          </div>
        )}
      </div>
      <div className="finn-row">
        {f.personal_info && <button type="button" className="big-button big-button--primary" disabled={!!busy || text.trim().length < 2} onClick={() => act('redact')}>{busy === 'redact' ? 'Lagrer …' : 'Skjul opplysningene'}</button>}
        <button type="button" className="big-button big-button--secondary" disabled={!!busy} onClick={() => act(f.junk && !f.personal_info ? 'handled' : 'dismiss')}>{f.junk && !f.personal_info ? 'Sett som sjekket' : 'Ingenting å skjule'}</button>
        <Link className="finn-link" href={`/backoffice/sak/${f.report_id}`} target="_blank">Åpne saken ↗</Link>
      </div>
    </li>
  );
}

export default function Personvern() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [scan, setScan] = useState({ running: false, msg: '' });
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/backoffice/finn/sjekk');
      if (r.status === 403) { setError('not-authed'); return; }
      if (!r.ok) { setError('Kunne ikke hente.'); return; }
      setData(await r.json());
    } catch (_e) { setError('Kunne ikke hente.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    setScan({ running: true, msg: 'Finn leser meldingene …' });
    let checked = 0; let found = 0;
    for (let round = 0; round < 40; round += 1) {
      try {
        const r = await fetch('/api/backoffice/finn/sjekk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan' }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) { setScan({ running: false, msg: d.reason || d.error || 'Stoppet.' }); break; }
        checked += d.checked; found += d.found;
        setScan({ running: true, msg: `${checked} lest, ${found} flagget. ${d.remaining} igjen …` });
        if (!d.remaining || !d.checked) { setScan({ running: false, msg: `Ferdig: ${checked} lest, ${found} flagget.` }); break; }
      } catch (_e) { setScan({ running: false, msg: 'Nettverksfeil. Prøv igjen.' }); break; }
    }
    load();
  };

  return (
    <>
      <Head><title>Personvern og kvalitet – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Personvern og kvalitet" />
      <main className="page admin-page finn-page">
        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        <header className="finn-hero finn-hero--small">
          <FinnAvatar size={44} />
          <div>
            <h1>Personvern og kvalitet</h1>
            <p>Finn leser alle nye meldinger og ser etter navn på barn, bilnummer, telefonnummer og e-post, og etter meldinger som ser ut som test. Skjuler du opplysningene, tar vi vare på originalteksten internt, så det kan angres på saken.</p>
          </div>
        </header>
        {data && data.unscanned > 0 && (
          <div className="finn-row">
            <button type="button" className="big-button big-button--primary" onClick={runScan} disabled={scan.running || !data.configured}>{scan.running ? 'Leser …' : `La Finn lese ${data.unscanned} meldinger`}</button>
            {scan.msg && <span className="finn-msg">{scan.msg}</span>}
          </div>
        )}
        {!data && !error && <p className="admin-list-empty">Henter …</p>}
        {data && data.items.length === 0 && <p className="admin-list-empty">Ingen flagg som venter. {data.unscanned > 0 ? 'Trykk knappen over for å la Finn lese.' : 'Alt er sjekket.'}</p>}
        {data && (
          <ul className="finn-flags">
            {data.items.map((f) => <FlagItem key={f.report_id} f={f} onDone={(id) => setData((d) => ({ ...d, items: d.items.filter((x) => x.report_id !== id) }))} />)}
          </ul>
        )}
      </main>
    </>
  );
}
