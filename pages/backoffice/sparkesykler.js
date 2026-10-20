import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import { describeFetchError } from '../../lib/backofficeFormat';

const ScooterStatsMap = dynamic(() => import('../../components/ScooterStatsMap'), { ssr: false, loading: () => <div className="sk-map sk-map--loading">Laster kart …</div> });

const RANGES = [['1d', 'Siste døgn'], ['7d', '7 dager'], ['30d', '30 dager']];
const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const TYPE_LABEL = { skole: 'Skole', bane: 'Bane', hall: 'Hall' };

const nb = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? '–' : Number(n).toLocaleString('nb-NO', { maximumFractionDigits: d }));
const fmtDist = (m) => (m == null ? '–' : m < 1000 ? `${nb(m)} m` : `${nb(m / 1000, 1)} km`);
const fmtMin = (min) => {
  if (min == null) return '–';
  if (min < 90) return `${nb(min)} min`;
  return `${nb(min / 60, 1)} t`;
};
function fmtDateTime(v) {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
}

// One-series column chart: thin columns from one baseline, the peak labelled,
// every column hoverable/focusable with its value; a table view below.
function Columns({ title, values, labels, tickEvery = 1, unit = 'utleier', tipLabel = (l) => l }) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  return (
    <figure className="sk-chart">
      <figcaption className="sk-chart__title">{title}</figcaption>
      <div className="sk-cols" role="img" aria-label={`${title}. Høyest: ${labels[peak]} med ${values[peak]} ${unit}.`}>
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
          <tbody>{labels.map((l, i) => <tr key={l}><th scope="row">{l}</th><td>{nb(values[i])}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

// Shared e-scooters in Kristiansand: rentals, rides, timing and arrivals at
// venues and schools — from Entur's open data, aggregated in the database.
export default function Sparkesykler() {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mapView, setMapView] = useState('ends');
  const [placeFilter, setPlaceFilter] = useState('alle');
  const [allPlaces, setAllPlaces] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/backoffice/sparkesykler?range=${range}`)
      .then(async (r) => {
        if (r.status === 403) throw new Error('not-authed');
        if (!r.ok) throw new Error(await describeFetchError(r, 'Kunne ikke hente statistikk.'));
        return r.json();
      })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message === 'not-authed' ? 'not-authed' : e.message); });
    return () => { alive = false; };
  }, [range]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), []);
  const places = useMemo(() => (data?.places || []).filter((p) => p.arrivals > 0 || p.departures > 0), [data]);
  const shownPlaces = places.filter((p) => placeFilter === 'alle' || (placeFilter === 'skole' ? p.type === 'skole' : p.type !== 'skole'));
  const days = data ? Math.max(1, (new Date(data.to) - new Date(Math.max(new Date(data.from), new Date(data.firstSnapshot || data.from)))) / 86400000) : 1;
  const collectingHours = data?.firstSnapshot ? (Date.now() - new Date(data.firstSnapshot)) / 3600000 : 0;
  const schoolHourArrivals = (data?.places || []).filter((p) => p.type === 'skole').reduce((n, p) => n + p.arrivals_school_hours, 0);
  const linkedShare = data?.rentals ? Math.round((data.trips.count / data.rentals) * 100) : null;

  return (
    <>
      <Head><title>Sparkesykler – Finns Fairway</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <BackofficeHeader title="Sparkesykler" />
      <main className="page admin-list-page sk">
        <p className="dash2__hint" style={{ margin: 0 }}>
          Delte elsparkesykler i Kristiansand, fra Enturs åpne data. Hentes hvert 3. minutt. Vi ser når en sykkel leies og hvor den parkeres, ikke hvem som kjører.
        </p>

        <div className="sk-tabs" role="tablist" aria-label="Periode">
          {RANGES.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={range === value} className={range === value ? 'sk-tab sk-tab--on' : 'sk-tab'} onClick={() => setRange(value)}>{label}</button>
          ))}
        </div>

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && !data && <p className="admin-list-empty">Henter statistikk …</p>}

        {data && (
          <>
            {collectingHours < 72 && (
              <p className="admin-warning">
                Innsamlingen startet {fmtDateTime(data.firstSnapshot)}. Tallene blir mer pålitelige etter noen dager, og ukedager etter et par uker.
              </p>
            )}

            <div className="sk-tiles">
              <div className="sk-tile"><span>Utleier</span><strong>{nb(data.rentals)}</strong><em>{nb(data.rentals / days, 0)} per døgn</em></div>
              <div className="sk-tile"><span>Typisk tur</span><strong>{fmtMin(data.trips.medianMin)}</strong><em>{fmtDist(data.trips.medianDistM)} i luftlinje</em></div>
              <div className="sk-tile"><span>Ankomster ved skoler i skoletid</span><strong>{nb(schoolHourArrivals)}</strong><em>hverdager 07–08.30 og 13.30–16.30</em></div>
              <div className="sk-tile"><span>Ledige nå</span><strong>{nb(data.fleetNow?.available)}</strong><em>snitt batteri {nb(data.fleetNow?.fuelPct)} %</em></div>
            </div>

            <div className="sk-grid">
              <Columns title="Utleie per time på døgnet" values={data.byHour || []} labels={hours} tickEvery={3} tipLabel={(l) => `kl. ${l}–${String((Number(l) + 1) % 24).padStart(2, '0')}`} />
              <Columns title="Utleie per ukedag" values={data.byWeekday || []} labels={WEEKDAYS} />
            </div>

            <section className="sk-section">
              <div className="sk-section__head">
                <h2>{mapView === 'ends' ? 'Hvor turene slutter' : 'Hvor turene starter'}</h2>
                <div className="sk-tabs sk-tabs--small" role="tablist" aria-label="Kartvisning">
                  <button type="button" role="tab" aria-selected={mapView === 'ends'} className={mapView === 'ends' ? 'sk-tab sk-tab--on' : 'sk-tab'} onClick={() => setMapView('ends')}>Slutter</button>
                  <button type="button" role="tab" aria-selected={mapView === 'starts'} className={mapView === 'starts' ? 'sk-tab sk-tab--on' : 'sk-tab'} onClick={() => setMapView('starts')}>Starter</button>
                </div>
              </div>
              <ScooterStatsMap cells={mapView === 'ends' ? data.ends : data.starts} places={data.places} />
              <p className="sk-legend">
                <span className="sk-legend__dot sk-legend__dot--cell" /> Turer (større og mørkere = flere)
                <span className="sk-legend__dot sk-legend__dot--venue" /> Bane eller hall
                <span className="sk-legend__dot sk-legend__dot--school" /> Skole
              </p>
            </section>

            <section className="sk-section">
              <div className="sk-section__head">
                <h2>Anlegg og skoler</h2>
                <div className="sk-tabs sk-tabs--small" role="tablist" aria-label="Filter">
                  {[['alle', 'Alle'], ['anlegg', 'Anlegg'], ['skole', 'Skoler']].map(([v, l]) => (
                    <button key={v} type="button" role="tab" aria-selected={placeFilter === v} className={placeFilter === v ? 'sk-tab sk-tab--on' : 'sk-tab'} onClick={() => setPlaceFilter(v)}>{l}</button>
                  ))}
                </div>
              </div>
              {shownPlaces.length === 0 ? (
                <p className="admin-list-empty">Ingen ankomster registrert her ennå.</p>
              ) : (
                <div className="sk-table-wrap">
                  <table className="sk-table sk-table--places">
                    <thead>
                      <tr><th scope="col">Sted</th><th scope="col">Ankomster</th><th scope="col">I skoletid</th><th scope="col">Leid herfra</th><th scope="col">Står typisk</th><th scope="col">Tur hit</th></tr>
                    </thead>
                    <tbody>
                      {(allPlaces ? shownPlaces : shownPlaces.slice(0, 15)).map((p) => (
                        <tr key={`${p.type}-${p.name}`}>
                          <th scope="row">{p.name}<span className="sk-type">{TYPE_LABEL[p.type] || p.type}</span></th>
                          <td>{nb(p.arrivals)}</td>
                          <td>{p.type === 'skole' ? nb(p.arrivals_school_hours) : '–'}</td>
                          <td>{nb(p.departures)}</td>
                          <td>{p.median_idle_s == null ? '–' : fmtMin(p.median_idle_s / 60)}</td>
                          <td>{fmtDist(p.median_dist_in_m)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shownPlaces.length > 15 && (
                    <button type="button" className="sk-more" onClick={() => setAllPlaces((v) => !v)}>
                      {allPlaces ? 'Vis topp 15' : `Vis alle ${shownPlaces.length}`}
                    </button>
                  )}
                </div>
              )}
            </section>

            <details className="sk-notes">
              <summary>Slik leses tallene</summary>
              <ul>
                <li><b>Utleie</b> er en sykkel som forsvinner fra Enturs oversikt mellom to henteringer (hvert 3. minutt). <b>Ankomst</b> er en sykkel som dukker opp igjen, innen 150 m fra stedet.</li>
                <li><b>Typisk tur</b> er medianen for turer der vi kan koble utleie og parkering til samme sykkel ({linkedShare == null ? '–' : `${linkedShare} %`} av utleiene). Avstand er luftlinje, så faktisk kjørt vei er lengre. Varighet er nøyaktig til omtrent 3 minutter.</li>
                <li>Operatørens egen flytting og lading holdes utenfor: {nb(data.trips.service)} flyttinger med batteribytte og {nb(data.restocked)} sykler satt ut i grupper.</li>
                <li><b>Står typisk</b> er hvor lenge en sykkel ble stående før den ble leid igjen. Kort tid betyr stor etterspørsel.</li>
                <li>Utleie krever 18 år, så tallene viser trafikken rundt anlegg og skoler, ikke barnas egne turer.</li>
                <li>Posisjoner lagres avrundet til ca. 30 m, uten sykkel-ID. Koblingen mellom utleie og parkering slettes etter 7 dager.</li>
              </ul>
            </details>
          </>
        )}
      </main>
    </>
  );
}
