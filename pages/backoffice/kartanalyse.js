import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';

// Innsikt › Kartanalyse: what the reported places have in common.
const FACTS = [
  ['andel_naer_skole_300m', 'innen 300 m fra en skole'],
  ['andel_med_barnehage_500m', 'har barnehage innen 500 m'],
  ['andel_med_idrettsanlegg_500m', 'har idrettsanlegg innen 500 m'],
  ['andel_adt_over_4000', 'på veg med ÅDT over 4000'],
  ['andel_fart_50_pluss', 'på veg med 50 km/t eller mer'],
  ['andel_uten_fortau_eller_gs', 'uten fortau eller gang- og sykkelveg'],
  ['andel_uten_gangfelt_100m', 'uten registrert gangfelt innen 100 m'],
  ['andel_gangfeltgap_over_300m', 'over 300 m mellom gangfeltene (eller ingen)'],
  ['andel_med_bussholdeplass_300m', 'har bussholdeplass innen 300 m'],
  ['andel_maalpunkt_langt_fra_gangfelt', 'har buss, skole, barnehage eller idrett over 150 m fra gangfelt'],
  ['andel_med_ulykker_10ar', 'med personskadeulykke innen 100 m (10 år)'],
  ['andel_med_fotgjenger_sykkel_ulykke', 'med ulykke med fotgjenger eller syklist'],
];
const COLS = [
  ['navn', 'Kommune'], ['saker', 'Saker'], ['median_barn_6_15_1km', 'Barn innen 1 km (median)'], ['andel_naer_skole_300m', 'Ved skole %'],
  ['andel_adt_over_4000', 'ÅDT > 4000 %'], ['andel_uten_fortau_eller_gs', 'Uten fortau %'], ['andel_med_ulykker_10ar', 'Med ulykker %'], ['risikosteder', 'Risikosteder'],
];
const pct = (v) => (v == null ? '–' : `${v} %`);

export default function Kartanalyse() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [kommune, setKommune] = useState('');
  const [sort, setSort] = useState({ key: 'saker', dir: -1 });
  const [shownRisk, setShownRisk] = useState(12);
  useEffect(() => {
    setD(null);
    fetch(`/api/backoffice/kartanalyse${kommune ? `?kommune=${encodeURIComponent(kommune)}` : ''}`).then(async (r) => {
      if (r.status === 403) { setErr('not-authed'); return; }
      if (!r.ok) { setErr('Kunne ikke hente analysen.'); return; }
      setD(await r.json());
    }).catch(() => setErr('Kunne ikke hente analysen.'));
  }, [kommune]);
  const rows = useMemo(() => [...(d?.kommuner || [])].sort((a, b) => {
    const x = a[sort.key]; const y = b[sort.key];
    return (typeof x === 'string' ? String(x).localeCompare(String(y), 'nb') : (x ?? -1) - (y ?? -1)) * sort.dir;
  }), [d, sort]);
  const a = d?.analysis;
  return (
    <>
      <Head><title>Kartanalyse – Finnsvei</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader />
      <main className="page admin-page ka">
        {err === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        <header className="ka-head">
          <div>
            <h1>Kartanalyse</h1>
            <p>Hva stedene folk melder har til felles: barn, skoler, barnehager, idrett, trafikk, vegens utforming og ulykker. Tallene er hentet fra SSB, Barnehagefakta, skoleregisteret og Statens vegvesen (NVDB).</p>
          </div>
          <select className="comp-select" value={kommune} onChange={(e) => setKommune(e.target.value)} aria-label="Område">
            <option value="">Hele landet</option>
            {(d?.kommuner || []).slice().sort((x, y) => String(x.navn).localeCompare(String(y.navn), 'nb')).map((k) => <option key={k.kode} value={k.kode}>{k.navn}</option>)}
          </select>
        </header>
        {!d && !err && <p className="admin-list-empty">Regner …</p>}
        {a && (
          <>
            <div className="ka-tiles">
              <div><strong>{a.saker}</strong><span>saker i {d.scope}</span></div>
              <div><strong>{a.median_barn_6_15_1km != null ? `ca. ${a.median_barn_6_15_1km}` : '–'}</strong><span>barn 6–15 år innen 1 km (median)</span></div>
              <div><strong>{a.median_adt != null ? Number(a.median_adt).toLocaleString('nb-NO') : '–'}</strong><span>ÅDT (median)</span></div>
              <div><strong>{a.ulykker_10ar_totalt}</strong><span>personskadeulykker ved sakene (10 år)</span></div>
              <div><strong>{a.median_gangfeltgap != null ? `${a.median_gangfeltgap} m` : '–'}</strong><span>mellom gangfeltene (median)</span></div>
              <div className="ka-tile--warn"><strong>{a.risikosteder}</strong><span>risikosteder: mange barn, mye trafikk og mangler</span></div>
            </div>
            <h2 className="dash2__h2">Andel av sakene som …</h2>
            <ul className="finn-bars ka-bars">
              {FACTS.map(([k, label]) => <li key={k}><span>{label}</span><i style={{ width: `${a[k] || 0}%` }} /><b>{pct(a[k])}</b></li>)}
            </ul>
            <p className="ka-note">Dekning: ulykker for {a.dekning.ulykker}, ÅDT for {a.dekning.adt}, fortau for {a.dekning.fortau} og barnetall for {a.dekning.barn} av {a.saker} saker. Gangfelt og lys på kommunale veger er ofte ikke registrert i NVDB.</p>

            {d.risk.length > 0 && (
              <>
                <h2 className="dash2__h2">Risikosteder {kommune ? `i ${d.scope}` : ''}</h2>
                <p className="ka-note">Åpne saker med minst 300 barn innen 1 km, mye trafikk eller 50 km/t, og som mangler fortau, har langt mellom gangfeltene, har bussholdeplass, skole, barnehage eller idrettsanlegg langt fra gangfelt, eller har hatt ulykke med fotgjenger eller syklist.</p>
                <ul className="ka-risk">
                  {d.risk.slice(0, shownRisk).map((r) => (
                    <li key={r.id}>
                      <Link href={`/backoffice/sak/${r.id}`}>
                        <strong>{r.measure || r.category}</strong>
                        <span>{[r.kommune_navn, r.summary].filter(Boolean).join(' · ')}</span>
                        <em>
                          {`ca. ${r.barn_6_15_1km} barn · `}
                          {r.aadt ? `ÅDT ${Number(r.aadt).toLocaleString('nb-NO')} · ` : ''}
                          {r.speed_limit ? `${r.speed_limit} km/t · ` : ''}
                          {r.has_sidewalk === false ? 'uten fortau · ' : ''}
                          {r.crossings_100m === 0 ? 'ingen gangfelt registrert · ' : ''}
                          {Number(r.crossing_gap_m) > 300 ? `${r.crossing_gap_m} m mellom gangfelt · ` : ''}
                          {Number(r.destinations_far_from_crossing) > 0 ? 'målpunkt langt fra gangfelt · ' : ''}
                          {Number(r.acc_vulnerable_10y) > 0 ? `${r.acc_vulnerable_10y} ulykker med fotgjenger/syklist` : `${r.acc_10y || 0} ulykker`}
                        </em>
                      </Link>
                    </li>
                  ))}
                </ul>
                {d.risk.length > shownRisk && <button type="button" className="big-button big-button--secondary list-more" onClick={() => setShownRisk((n) => n + 12)}>Vis flere ({d.risk.length - shownRisk} til)</button>}
              </>
            )}

            {!kommune && (
              <>
                <h2 className="dash2__h2">Kommuner (minst 5 saker)</h2>
                <div className="ins-ktable-wrap ka-table">
                  <table className="ins-ktable">
                    <thead><tr>{COLS.map(([k, l]) => <th key={k} className={k === 'navn' ? '' : 'num'}><button type="button" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : (k === 'navn' ? 1 : -1) }))}>{l}{sort.key === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>)}</tr></thead>
                    <tbody>
                      {rows.map((k) => (
                        <tr key={k.kode} onClick={() => setKommune(k.kode)} style={{ cursor: 'pointer' }}>
                          <td><strong>{k.navn}</strong></td>
                          <td className="num">{k.saker}</td>
                          <td className="num">{k.median_barn_6_15_1km ?? '–'}</td>
                          <td className="num">{pct(k.andel_naer_skole_300m)}</td>
                          <td className="num">{pct(k.andel_adt_over_4000)}</td>
                          <td className="num">{pct(k.andel_uten_fortau_eller_gs)}</td>
                          <td className="num">{pct(k.andel_med_ulykker_10ar)}</td>
                          <td className="num">{k.risikosteder}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
