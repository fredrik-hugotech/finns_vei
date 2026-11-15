import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';

// AI-suggested links between reports about the same problem at the same spot.
// Linking never deletes: the newer report is placed under the older one, every
// report still counts, and a case with more linked reports shows more
// engagement. Every link can be undone from the case page.
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function ReportCard({ r, label }) {
  return (
    <div className="mg-card">
      <span className="mg-card__label">{label}</span>
      <strong>{r.category}</strong>
      <span className="mg-card__meta">{fmtDate(r.created_at)}{Number(r.support_count) > 0 ? ` · ♥ ${r.support_count}` : ''}</span>
      <p>{String(r.description || '').replace(/^\s*Gjelder:[^\n]*\.\s*/i, '').slice(0, 400) || 'Ingen tekst.'}</p>
      <Link href={`/backoffice/sak/${encodeURIComponent(r.id)}`} target="_blank">Åpne saken ↗</Link>
    </div>
  );
}

export default function Sammenkobling() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({});
  const [scan, setScan] = useState({ running: false, msg: '' });

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/backoffice/sammenkobling');
      if (r.status === 403) { setError('not-authed'); return; }
      if (!r.ok) { setError('Kunne ikke hente forslag.'); return; }
      setData(await r.json());
    } catch (_e) { setError('Kunne ikke hente forslag.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      const r = await fetch('/api/backoffice/sammenkobling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }) });
      if (r.ok) setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
    } finally { setBusy((b) => { const n = { ...b }; delete n[id]; return n; }); }
  };

  const runScan = async () => {
    setScan({ running: true, msg: 'Finn leser meldinger som ligger nær hverandre …' });
    let found = 0; let checked = 0;
    for (let round = 0; round < 30; round += 1) {
      try {
        const r = await fetch('/api/backoffice/sammenkobling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan' }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) { setScan({ running: false, msg: d.reason || 'Stoppet.' }); break; }
        found += d.found; checked += d.checked;
        setScan({ running: true, msg: `${checked} par sjekket, ${found} ser like ut. ${d.remaining} igjen …` });
        if (!d.remaining || !d.checked) { setScan({ running: false, msg: `Ferdig: ${checked} par sjekket, ${found} forslag.` }); break; }
      } catch (_e) { setScan({ running: false, msg: 'Nettverksfeil. Prøv igjen.' }); break; }
    }
    load();
  };

  return (
    <>
      <Head><title>Like saker – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Like saker" />
      <main className="page admin-list-page mg">
        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && !data && <p className="admin-list-empty">Henter …</p>}
        {data && (
          <>
            <section className="mg-top">
              <div>
                <span className="finn-kicker">Finn foreslår</span>
                <h1>Like saker</h1>
                <p>Meldinger som ligger nær hverandre og handler om det samme. Koble dem til én sak: ingenting slettes, alle meldinger telles fortsatt, og saken får mer engasjement. Kan angres på saken.</p>
              </div>
              {data.unscanned > 0 && (
                <div className="mg-scan">
                  <button type="button" className="big-button big-button--primary" onClick={runScan} disabled={scan.running || !data.configured}>
                    {scan.running ? 'Leter …' : `La Finn se på ${data.unscanned} nye par`}
                  </button>
                  {scan.msg && <span>{scan.msg}</span>}
                </div>
              )}
            </section>

            {data.items.length === 0 && <p className="admin-list-empty">Ingen forslag som venter. {data.unscanned > 0 ? 'Trykk knappen over for å la Finn lete.' : 'Alt er gjennomgått.'}</p>}
            <ul className="mg-list">
              {data.items.map((s) => (
                <li key={s.id} className="mg-item">
                  <div className="mg-item__why">
                    <span className={`mg-conf mg-conf--${s.confidence}`}>{s.confidence === 'høy' ? 'Trolig samme sak' : s.confidence === 'lav' ? 'Kanskje samme sak' : 'Sannsynligvis samme sak'}</span>
                    <span>{Math.round(Number(s.distance_m))} m fra hverandre</span>
                    <p>{s.reason}</p>
                  </div>
                  <div className="mg-pair">
                    <ReportCard r={s.primary} label="Hovedsak (eldst)" />
                    <ReportCard r={s.other} label="Kobles til" />
                  </div>
                  <div className="mg-actions">
                    <button type="button" className="big-button big-button--primary" disabled={Boolean(busy[s.id])} onClick={() => act(s.id, 'accept')}>{busy[s.id] === 'accept' ? 'Kobler …' : 'Koble sammen'}</button>
                    <button type="button" className="big-button big-button--secondary" disabled={Boolean(busy[s.id])} onClick={() => act(s.id, 'reject')}>Ikke samme sak</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
