import { useEffect, useState } from 'react';
import Logo from './Logo';

// Closing card of the /demo tour, built for a big screen: the quarterly
// hand-over to the road chief, with live figures from the solution.
// A partner logo can be dropped in at /public/demo/partner-logo.png; until
// then the slot simply stays empty.
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function DemoFinale({ trips = 0, hotspots = 0, onRestart, onDone }) {
  const [cases, setCases] = useState(null);
  const [partnerOk, setPartnerOk] = useState(true);
  useEffect(() => {
    fetch('/api/reports').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d && Array.isArray(d.features)) setCases(d.features.length);
    }).catch(() => {});
  }, []);
  const quarter = Math.floor(new Date().getMonth() / 3);
  const fmt = (n) => (Number(n) || 0).toLocaleString('nb-NO');

  return (
    <div className="fin" role="dialog" aria-label="Avslutning">
      <div className="fin__inner">
        <div className="fin__brand"><Logo size="xl" /></div>
        <p className="fin__kicker">Hvert kvartal</p>
        <h2 className="fin__title">Kart og historikk legges fram for veisjefen</h2>
        <ol className="fin__quarters" aria-label="Kvartaler">
          {QUARTERS.map((q, i) => (
            <li key={q} className={i === quarter ? 'fin__q fin__q--now' : (i < quarter ? 'fin__q fin__q--done' : 'fin__q')}>
              <span className="fin__dot" />
              <span>{q}</span>
            </li>
          ))}
        </ol>
        <dl className="fin__figures">
          <div><dd>{cases === null ? '–' : fmt(cases)}</dd><dt>meldte steder</dt></div>
          <div><dd>{fmt(trips)}</dd><dt>turer logget</dt></div>
          <div><dd>{fmt(hotspots)}</dd><dt>ulykkessteder fulgt</dt></div>
        </dl>
        <p className="fin__line">Trygg vei for alle barn · <strong>finnsvei.no</strong></p>
        {partnerOk && (
          <img className="fin__partner" src="/demo/partner-logo.png" alt="" onError={() => setPartnerOk(false)} />
        )}
        <div className="fin__nav">
          <button type="button" className="fin__again" onClick={onRestart}>Start på nytt</button>
          <button type="button" className="fin__done" onClick={onDone}>Ferdig</button>
        </div>
      </div>
    </div>
  );
}
