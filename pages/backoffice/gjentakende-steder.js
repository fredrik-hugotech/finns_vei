import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';

function fmtDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_e) {
    return value;
  }
}

// Recurrence/seasonal-pattern overview: spots where reports keep coming back
// across several different seasons/years, computed server-side in
// lib/hotspotAnalysis.js (via lib/supabaseRest.js's listRecurringHotspots)
// from the FULL report history — not just currently open cases. This is
// intentionally distinct from /backoffice/hotteste, which ranks OPEN cases
// by a right-now heat score. Purely read-only.
export default function GjentakendeSteder() {
  const [hotspots, setHotspots] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/backoffice/hotspots')
      .then((r) => (r.status === 403 ? Promise.reject(new Error('not-authed')) : (r.ok ? r.json() : Promise.reject(new Error('feil')))))
      .then((d) => setHotspots(d.hotspots || []))
      .catch((e) => setError(e.message === 'not-authed' ? 'not-authed' : 'Kunne ikke hente gjentakende steder.'));
  }, []);

  const totalReports = useMemo(
    () => (hotspots || []).reduce((n, h) => n + Number(h.reportCount || 0), 0),
    [hotspots],
  );

  return (
    <>
      <Head>
        <title>Gjentakende steder – Finns Fairway</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <BackofficeHeader title="Gjentakende steder" />
      <main className="page admin-list-page">
        <p className="dash2__hint" style={{ margin: 0 }}>
          Steder som får meldinger igjen og igjen på tvers av flere ulike sesonger eller år — ikke bare mye
          engasjement akkurat nå. Rangert etter hvor mange ulike perioder stedet har dukket opp i, ikke
          rått meldingsantall: et sted med 6 meldinger fordelt på 3 forskjellige år er et sterkere signal om
          et kronisk problem enn 10 meldinger fra én travel uke. Se{' '}
          <Link href="/backoffice/hotteste">Hotteste saker</Link> for åpne saker rangert etter engasjement akkurat nå.
        </p>

        {error === 'not-authed' && (
          <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>
        )}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && hotspots === null && <p className="admin-list-empty">Laster …</p>}
        {!error && hotspots && hotspots.length === 0 && (
          <p className="admin-list-empty">Ingen gjentakende steder funnet ennå.</p>
        )}
        {!error && hotspots && hotspots.length > 0 && (
          <p className="sak-count">
            {hotspots.length} gjentakende sted{hotspots.length === 1 ? '' : 'er'}
            {totalReports > 0 ? ` · ${totalReports} meldinger totalt` : ''}
          </p>
        )}

        <div className="admin-list">
          {(hotspots || []).map((h) => (
            <HotspotItem key={`${h.center.lat},${h.center.lng}`} hotspot={h} />
          ))}
        </div>
      </main>
    </>
  );
}

function HotspotItem({ hotspot }) {
  const firstId = hotspot.reportIds?.[0];
  const extraCount = Math.max(0, (hotspot.reportIds?.length || 0) - 1);

  return (
    <div className="admin-list-item hotspot-item">
      <div className="admin-list-item__head">
        <span className="admin-list-item__tag hotspot-item__rank">#{hotspot.rank}</span>
        <span className="admin-list-item__headright">
          <span className="admin-list-item__time" title="Antall ulike sesonger/år stedet er meldt i">
            {hotspot.periodCount} perioder
          </span>
        </span>
      </div>
      <strong className="admin-list-item__title">{hotspot.dominantCategory}</strong>
      <span className="admin-list-item__desc">
        {hotspot.reportCount} melding{hotspot.reportCount === 1 ? '' : 'er'} · først sett {fmtDate(hotspot.firstSeen)} · sist sett {fmtDate(hotspot.lastSeen)}
      </span>
      <span className="admin-list-item__foot">
        {hotspot.periods.map((p) => (
          <span key={p} className="admin-list-item__tag">{p}</span>
        ))}
        {hotspot.statusMix.map((s) => (
          <span key={s.status} className="sak-due">{s.status} · {s.count}</span>
        ))}
      </span>
      <span className="admin-list-item__foot hotspot-item__links">
        {firstId && (
          <Link href={`/backoffice/sak/${encodeURIComponent(firstId)}`} className="dash2__seeall">
            Se en melding fra stedet ›
          </Link>
        )}
        {extraCount > 0 && <span className="admin-list-item__loc">+{extraCount} til på samme sted</span>}
      </span>
    </div>
  );
}
