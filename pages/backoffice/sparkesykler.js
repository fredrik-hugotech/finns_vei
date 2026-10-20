import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import { describeFetchError } from '../../lib/backofficeFormat';
import { FYLKER } from '../../lib/fylker';

const ScooterStatsMap = dynamic(() => import('../../components/ScooterStatsMap'), { ssr: false, loading: () => <div className="sk-map sk-map--loading">Laster kart …</div> });

const RANGES = [['1d', 'Siste døgn'], ['7d', '7 dager'], ['30d', '30 dager'], ['90d', '90 dager']];
const KINDS = [['', 'Alle'], ['anlegg', 'Anlegg'], ['skole', 'Skoler']];
const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const TYPE_LABEL = { skole: 'Skole', bane: 'Bane', hall: 'Hall' };
const SHOW = 25;

const nb = (n) => (n == null || Number.isNaN(Number(n)) ? '–' : Number(n).toLocaleString('nb-NO', { maximumFractionDigits: 0 }));
function fmtDateTime(v) {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
}

// One-series column chart: thin columns from one baseline, the peak labelled,
// every column hoverable/focusable with its value; a table view below.
function Columns({ title, values, labels, tickEvery = 1, unit = 'ankomster', tipLabel = (l) => l }) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  return (
    <figure className="sk-chart">
      <figcaption className="sk-chart__title">{title}</figcaption>
      <div className="sk-cols" role="img" aria-label={`${title}. Høyest: ${tipLabel(labels[peak])} med ${values[peak]} ${unit}.`}>
        {values.map((v, i) => (
          <div key={labels[i]} className="sk-col" tabIndex={0} aria-label={`${tipLabel(labels[i])}: ${v} ${unit}`}>
            {i === peak && v > 0 && <span className="sk-col__peak" style={{ bottom: `calc(${(v / max) * 100}% + 2px)` }}>{nb(v)}</span>}
            <span className="sk-col__bar" style={{ height: `${(v / max) * 100}%` }} />
            <span className="sk-col__tip" role="tooltip"><strong>{nb(v)}</strong> {unit}<br />{tipLabel(labels[i])}</span>
          </div>
        ))}
      </div>
      <div className="sk-cols__axis" aria-hidden="true">
        {labels.map((l, i) => <span key={l}>{i % tickEvery === 0 ? l : ''}</span>)}
      </div>
      <details className="sk-table-toggle">
        <summary>Vis som tabell</summary>
        <table className="sk-table">
          <tbody>{labels.map((l, i) => <tr key={l}><th scope="row">{tipLabel(l)}</th><td>{nb(values[i])}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

// Which schools and sports venues in Norway get the most shared e-scooter
// traffic: parkings and rentals within 100 m (nearest place only), ranked by
// net traffic above each place's own neighbourhood. From Entur's open data.
export default function Sparkesykler() {
  const [range, setRange] = useState('7d');
  const [kind, setKind] = useState('');
  const [fylke, setFylke] = useState('');
  const [kommune, setKommune] = useState('');
  const [fylker, setFylker] = useState([]);
  const [data, setData] = useState(null);
  const [kommuner, setKommuner] = useState([]);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState('');
  const [subtype, setSubtype] = useState(''); // '' | bane | hall
  const [sort, setSort] = useState({ key: 'net', dir: -1 });

  useEffect(() => {
    let alive = true;
    setData(null);
    const q = new URLSearchParams({ range, ...(kind ? { type: kind } : {}), ...(fylke ? { fylke } : {}), ...(kommune ? { kommune } : {}) });
    fetch(`/api/backoffice/sparkesykler?${q}`)
      .then(async (r) => {
        if (r.status === 403) throw new Error('not-authed');
        if (!r.ok) throw new Error(await describeFetchError(r, 'Kunne ikke hente statistikk.'));
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        // The county list is national and the municipality list covers the
        // chosen county, so keep the ones fetched before narrowing further.
        if (d.fylker) setFylker(d.fylker);
        if (!kommune && d.kommuner) setKommuner(d.kommuner);
      })
      .catch((e) => { if (alive) setError(e.message === 'not-authed' ? 'not-authed' : e.message); });
    return () => { alive = false; };
  }, [range, kind, fylke, kommune]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), []);
  const SORT_VALUE = {
    net: (p) => p.netArrivals + p.netDepartures,
    arrivals: (p) => p.arrivals,
    school: (p) => (p.kind === 'skole' ? p.arrivalsSchoolHours : -1),
    departures: (p) => p.departures,
    name: (p) => p.name,
  };
  const places = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.places || []).filter((p) => (!subtype || p.type === subtype)
      && (!q || p.name.toLowerCase().includes(q) || (p.kommuneNavn || '').toLowerCase().includes(q)));
    const val = SORT_VALUE[sort.key];
    return [...list].sort((a, b) => {
      const x = val(a); const y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y, 'nb') : x - y) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, subtype, sort]);
  const shown = all ? places : places.slice(0, SHOW);
  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : (key === 'name' ? 1 : -1) }));
  // A plain function (not a component) so the header buttons keep focus.
  const th = (k, label) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={sort.key === k ? 'sk-sort sk-sort--on' : 'sk-sort'} onClick={() => sortBy(k)}>
        {label}<span aria-hidden="true">{sort.key === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</span>
      </button>
    </th>
  );
  const collectingHours = data?.dataSince ? (Date.now() - new Date(data.dataSince)) / 3600000 : 0;
  const t = data?.totals;
  const area = kommune ? (kommuner.find((k) => k.nr === kommune)?.navn || 'kommunen') : (fylke ? FYLKER[fylke] || 'fylket' : 'Norge');

  return (
    <>
      <Head><title>Sparkesykler – Finns Fairway</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <BackofficeHeader title="Sparkesykler" />
      <main className="page admin-list-page sk">
        <p className="dash2__hint" style={{ margin: 0 }}>
          Hvilke idrettsanlegg og skoler i Norge som får mest trafikk fra delte elsparkesykler: parkeringer og utleie innen 100 m, utover det som er vanlig i nabolaget. Fra Enturs åpne data, hvert 5. minutt.
        </p>

        <div className="sk-filters">
          <div className="sk-tabs" role="tablist" aria-label="Periode">
            {RANGES.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={range === value} className={range === value ? 'sk-tab sk-tab--on' : 'sk-tab'} onClick={() => setRange(value)}>{label}</button>
            ))}
          </div>
          <div className="sk-tabs" role="tablist" aria-label="Type sted">
            {KINDS.map(([value, label]) => (
              <button key={label} type="button" role="tab" aria-selected={kind === value} className={kind === value ? 'sk-tab sk-tab--on' : 'sk-tab'} onClick={() => { setKind(value); setAll(false); }}>
                {value && <span className="sk-swatch" style={{ background: value === 'skole' ? '#eb6834' : '#2a78d6' }} aria-hidden="true" />}{label}
              </button>
            ))}
          </div>
          <select className="comp-select sk-kommune" value={fylke} onChange={(e) => { setFylke(e.target.value); setKommune(''); setAll(false); }} aria-label="Fylke">
            <option value="">Hele landet</option>
            {Object.entries(FYLKER).map(([nr, navn]) => {
              const n = fylker.find((f) => f.nr === nr)?.arrivals;
              return <option key={nr} value={nr}>{navn}{n ? ` (${nb(n)})` : ''}</option>;
            })}
          </select>
          <select className="comp-select sk-kommune" value={kommune} onChange={(e) => { setKommune(e.target.value); setAll(false); }} aria-label="Kommune">
            <option value="">{fylke ? `Alle kommuner i ${FYLKER[fylke]}` : 'Alle kommuner'}</option>
            {kommuner.map((k) => <option key={k.nr} value={k.nr}>{k.navn} ({nb(k.arrivals)})</option>)}
          </select>
        </div>

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && !data && <p className="admin-list-empty">Henter statistikk …</p>}

        {data && (
          <>
            {collectingHours < 72 && (
              <p className="admin-warning">Tellingen startet {fmtDateTime(data.dataSince)}. Tallene blir mer pålitelige etter noen dager, og ukedager etter et par uker.</p>
            )}

            <div className="sk-tiles">
              <div className="sk-tile"><span>Ankomster ved anlegg</span><strong>{nb(t.arrivalsAnlegg)}</strong><em>{area}</em></div>
              <div className="sk-tile"><span>Ankomster ved skoler</span><strong>{nb(t.arrivalsSkole)}</strong><em>{nb(t.arrivalsSchoolHours)} i skoletid</em></div>
              <div className="sk-tile"><span>Steder med trafikk</span><strong>{nb(t.placesWithTraffic)}</strong><em>av {nb(data.placesTracked)} anlegg og skoler</em></div>
              <div className="sk-tile"><span>Ledige sparkesykler nå</span><strong>{nb(data.fleetNow?.available)}</strong><em>i hele Norge</em></div>
            </div>

            <section className="sk-section">
              <div className="sk-section__head">
                <h2>Mest trafikk</h2>
                <div className="sk-listtools">
                  {kind !== 'skole' && (
                    <select className="comp-select" value={subtype} onChange={(e) => { setSubtype(e.target.value); setAll(false); }} aria-label="Type anlegg">
                      <option value="">Alle typer</option>
                      <option value="bane">Baner</option>
                      <option value="hall">Haller</option>
                      {kind === '' && <option value="skole">Skoler</option>}
                    </select>
                  )}
                  <input type="search" className="sk-search" value={query} onChange={(e) => { setQuery(e.target.value); setAll(false); }} placeholder="Søk sted eller kommune" aria-label="Søk sted eller kommune" />
                </div>
              </div>
              {places.length === 0 ? (
                <p className="admin-list-empty">Ingen sparkesykkeltrafikk registrert her i perioden ennå.</p>
              ) : (
                <div className="sk-table-wrap">
                  <table className="sk-table sk-table--places">
                    <thead>
                      <tr><th scope="col">#</th>{th('name', 'Sted')}{th('net', 'Netto')}{th('arrivals', 'Ankomster')}{th('school', 'I skoletid')}{th('departures', 'Leid herfra')}</tr>
                    </thead>
                    <tbody>
                      {shown.map((p, i) => (
                        <tr key={p.id}>
                          <td>{i + 1}</td>
                          <th scope="row">
                            <span className="sk-swatch" style={{ background: p.kind === 'skole' ? '#eb6834' : '#2a78d6' }} aria-hidden="true" />
                            {p.name}
                            <span className="sk-type">{TYPE_LABEL[p.type] || p.type}{p.kommuneNavn ? ` · ${p.kommuneNavn}` : ''}</span>
                          </th>
                          <td><strong>{nb(Math.max(0, p.netArrivals + p.netDepartures))}</strong></td>
                          <td>{nb(p.arrivals)}</td>
                          <td>{p.kind === 'skole' ? nb(p.arrivalsSchoolHours) : '–'}</td>
                          <td>{nb(p.departures)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {places.length > SHOW && (
                    <button type="button" className="sk-more" onClick={() => setAll((v) => !v)}>{all ? `Vis topp ${SHOW}` : `Vis alle ${places.length}`}</button>
                  )}
                </div>
              )}
            </section>

            <section className="sk-section">
              <div className="sk-section__head"><h2>Kart</h2></div>
              <ScooterStatsMap places={places.slice(0, 300)} focusKey={`${fylke}|${kommune}|${kind}|${range}`} />
              <p className="sk-legend">
                <span className="sk-swatch" style={{ background: '#2a78d6' }} aria-hidden="true" />Idrettsanlegg
                <span className="sk-swatch" style={{ background: '#eb6834' }} aria-hidden="true" />Skole
                <span>Større sirkel = mer trafikk</span>
              </p>
            </section>

            <div className="sk-grid">
              <Columns title="Ankomster per time på døgnet" values={data.byHour || []} labels={hours} tickEvery={3} tipLabel={(l) => `kl. ${l}–${String((Number(l) + 1) % 24).padStart(2, '0')}`} />
              <Columns title="Ankomster per ukedag" values={data.byWeekday || []} labels={WEEKDAYS} />
            </div>

            <details className="sk-notes">
              <summary>Slik leses tallene</summary>
              <ul>
                <li><b>Ankomst</b> er en sparkesykkel som blir parkert innen 100 m fra stedet etter en tur. <b>Leid herfra</b> er en som blir leid der. Hver hendelse telles bare for det nærmeste stedet. Sykler som operatøren setter ut i grupper, er holdt utenfor.</li>
                <li><b>Netto</b> er ankomster og utleie utover det som er vanlig i nabolaget: trafikken 200–300 m unna, omregnet til samme areal, trekkes fra. Et sted i et travelt sentrum kommer dermed ikke høyt bare fordi området er travelt.</li>
                <li><b>I skoletid</b> er hverdager kl. 07–09 og 13–17.</li>
                <li>Skolene er alle aktive grunnskoler i Utdanningsdirektoratets skoleregister. Idrettsanleggene er fotballbaner, haller og stadioner fra OpenStreetMap, der baner på samme anlegg er slått sammen.</li>
                <li>Utleie krever 18 år, så tallene viser trafikken rundt stedene der barna er, ikke barnas egne turer.</li>
                <li>Vi lagrer bare antall per sted og time. Detaljert sykkeldata slettes etter 3 dager.</li>
              </ul>
            </details>
          </>
        )}
      </main>
    </>
  );
}
