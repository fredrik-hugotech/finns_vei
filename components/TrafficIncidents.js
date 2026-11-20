import Link from 'next/link';
import { useEffect, useState } from 'react';

// Recent traffic accidents near reported places (DATEX traffic messages and
// Politiloggen). Backoffice only.

const PRECISION = { punkt: 'nøyaktig posisjon', gate: 'omtrent: gate', sted: 'omtrent: stedsnavn', kommune: 'bare kommune' };
const SOURCE = { datex: 'Statens vegvesen', politiloggen: 'Politiloggen' };
const when = (iso) => (iso ? new Date(iso).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }) : '');

function SourceStatus({ sources }) {
  if (!sources) return null;
  const bad = [];
  if (sources.datex === 'ikke konfigurert') bad.push('Statens vegvesens trafikkmeldinger er ikke koblet til ennå (DATEX-konto mangler i Vercel).');
  else if (sources.datex && sources.datex !== 'ok' && sources.datex !== 'venter') bad.push(`Statens vegvesen svarte ikke (${sources.datex}).`);
  if (sources.politiloggen && sources.politiloggen !== 'ok' && sources.politiloggen !== 'venter') bad.push(`Politiloggen svarte ikke (${sources.politiloggen}).`);
  return (
    <p className="ti-note">
      {bad.join(' ')} {sources.at ? `Sist hentet ${when(sources.at)}.` : 'Hentes nå, last siden på nytt om litt.'} Vises bare internt.
    </p>
  );
}

function IncidentRow({ i }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`ti-row${i.cases?.length ? ' ti-row--near' : ''}`}>
      <div className="ti-row__head">
        <strong>{i.title}</strong>
        <span>{when(i.occurred_at)} · {SOURCE[i.source] || i.source} · {PRECISION[i.precision] || i.precision}{i.place_text ? ` (${i.place_text})` : ''}</span>
      </div>
      {i.text && (
        <p className="ti-row__text">
          {open || i.text.length < 180 ? i.text : `${i.text.slice(0, 180)}… `}
          {i.text.length >= 180 && <button type="button" className="finn-link" onClick={() => setOpen(!open)}>{open ? 'Mindre' : 'Mer'}</button>}
        </p>
      )}
      {i.cases?.length > 0 && (
        <ul className="ti-cases">
          {i.cases.map((c) => (
            <li key={c.id}><Link href={`/backoffice/sak/${c.id}`}>{c.category || 'Sak'}{c.kommune ? ` · ${c.kommune}` : ''}</Link> <em>{c.m} m unna</em></li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Innsikt: accidents in the last days, the ones near reported places first.
export default function TrafficIncidentsCard() {
  const [d, setD] = useState(null);
  const [days, setDays] = useState(30);
  const [all, setAll] = useState(false);
  useEffect(() => {
    fetch(`/api/backoffice/trafikkhendelser?dager=${days}`).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  }, [days]);
  const list = (d?.incidents || []).slice().sort((a, b) => (b.cases?.length ? 1 : 0) - (a.cases?.length ? 1 : 0) || String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const shown = all ? list : list.filter((i) => i.cases?.length);
  return (
    <section className="ti" id="trafikkulykker">
      <div className="dash2__h2row">
        <h2 className="dash2__h2">Nye trafikkulykker nær meldte steder</h2>
        <div className="src-range">
          {[7, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n} dager</button>)}
        </div>
      </div>
      <div className="src-card">
        {!d && <p className="admin-list-empty">Henter …</p>}
        {d && (
          <p className="ti-sum">
            <b>{d.near_cases}</b> av {d.total} ulykker siste {d.days} dager skjedde nær et meldt sted.
            {' '}<button type="button" className="finn-link" onClick={() => setAll(!all)}>{all ? 'Vis bare de nær meldte steder' : 'Vis alle'}</button>
          </p>
        )}
        {d && shown.length === 0 && <p className="admin-list-empty">{all ? 'Ingen ulykker registrert i perioden.' : 'Ingen ulykker nær meldte steder i perioden.'}</p>}
        {shown.length > 0 && <ul className="ti-list">{shown.slice(0, 40).map((i) => <IncidentRow key={i.id} i={i} />)}</ul>}
        <SourceStatus sources={d?.sources} />
      </div>
    </section>
  );
}

// Case page: accidents near this place, newest first.
export function CaseIncidents({ caseId }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    fetch(`/api/backoffice/trafikkhendelser?sak=${encodeURIComponent(caseId)}`).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  }, [caseId]);
  if (!d?.incidents?.length) return null;
  const after = d.incidents.filter((i) => i.after_report).length;
  return (
    <section className="admin-section ti-case">
      <h2>Trafikkulykker i nærheten</h2>
      {after > 0 && <p className="ti-alert">{after === 1 ? 'Én ulykke' : `${after} ulykker`} skjedde her etter at saken ble meldt.</p>}
      <ul className="ti-list">
        {d.incidents.map((i) => (
          <li key={i.id} className={`ti-row${i.after_report ? ' ti-row--near' : ''}`}>
            <div className="ti-row__head">
              <strong>{i.title} · {i.m} m unna</strong>
              <span>{when(i.occurred_at)} · {SOURCE[i.source] || i.source} · {PRECISION[i.precision] || i.precision}</span>
            </div>
            {i.text && <p className="ti-row__text">{i.text}</p>}
          </li>
        ))}
      </ul>
      <p className="ti-note">Fra politiloggen og Statens vegvesens trafikkmeldinger. Vises bare internt, ikke for innbyggere.</p>
    </section>
  );
}
