import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import { getMyTrips } from '../lib/myTrips';

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatKm(meters) {
  return ((Number(meters) || 0) / 1000).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function MineTurer() {
  const [trips, setTrips] = useState(null); // null = not yet read from localStorage

  useEffect(() => {
    setTrips(getMyTrips());
  }, []);

  const isLoading = trips === null;
  const isEmpty = trips !== null && trips.length === 0;
  const totalM = (trips || []).reduce((sum, entry) => sum + (Number(entry?.distanceM) || 0), 0);

  return (
    <>
      <Head>
        <title>Mine turer – Finns Fairway</title>
        <meta name="description" content="Se turer du har registrert fra denne enheten." />
        <meta name="robots" content="noindex" />
      </Head>
      <main className="page">
        <section className="hero-card my-reports-card">
          <Logo size="md" />
          <h1>Mine turer</h1>
          <p className="lede">
            Turer du har registrert fra denne enheten. Listen lagres kun i denne nettleseren — den er ikke knyttet til deg og forsvinner om du tømmer nettleserdata.
          </p>

          {isLoading && <p className="ui-small-text">Laster …</p>}

          {isEmpty && (
            <>
              <p className="my-reports-empty">Ingen turer registrert ennå. Registrer en tur i sykkel-appen for å se den her.</p>
              <Link className="big-button big-button--primary" href="/sykle">Registrer en tur</Link>
            </>
          )}

          {!isLoading && !isEmpty && (
            <>
              <div className="my-trips-total">
                <strong>{formatKm(totalM)} km</strong>
                <span>{trips.length === 1 ? '1 tur registrert' : `${trips.length} turer registrert`}</span>
              </div>
              <ul className="my-reports-list">
                {trips.map((entry, index) => {
                  const dateLabel = formatDate(entry.createdAt);
                  const modeLabel = entry.mode === 'gange' ? 'Gikk' : 'Syklet';
                  const routeLabel = entry.routeType === 'skole' ? 'Skolerute' : 'Fritidsrute';
                  return (
                    // eslint-disable-next-line react/no-array-index-key
                    <li className="my-reports-item" key={`${entry.createdAt || 'ukjent'}-${index}`}>
                      <div className="my-reports-item__head">
                        <span className="my-trips-badge">{modeLabel}</span>
                        {dateLabel && <span className="my-reports-item__date">{dateLabel}</span>}
                      </div>
                      <strong className="my-reports-item__title">{formatKm(entry.distanceM)} km</strong>
                      <p className="ui-small-text">
                        {routeLabel}
                        {entry.weatherBonus ? ' · Værhelt' : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <Link className="back-link" href="/">← Til forsiden</Link>
        </section>
      </main>
    </>
  );
}
