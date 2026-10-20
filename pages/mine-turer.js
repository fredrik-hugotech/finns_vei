import Head from 'next/head';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';
import { useEffect, useState } from 'react';
import { getMyTrips } from '../lib/myTrips';
import { TRIP_QUEUE_CHANGED_EVENT, flushTripQueue, getPendingTrips } from '../lib/offlineTripQueue';
import { MODE_ICON, MODE_PAST, normalizeMode } from '../lib/tripModes';

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function formatKm(meters) {
  return ((Number(meters) || 0) / 1000).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function MineTurer() {
  const [trips, setTrips] = useState(null); // null = not yet read from localStorage
  const [pendingTrips, setPendingTrips] = useState([]); // queued on this device, not sent yet

  useEffect(() => {
    setTrips(getMyTrips());
  }, []);

  // Same pattern as mine-meldinger.js's report queue: try to flush anything
  // left over from a dead-zone trip finish as soon as this page loads (if
  // already online) and again whenever the browser regains connectivity, and
  // re-read "Mine turer" once a queued trip actually sends so it moves from
  // "venter" into the confirmed list below.
  useEffect(() => {
    const refreshPending = () => setPendingTrips(getPendingTrips());
    refreshPending();

    const tryFlush = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushTripQueue().then(() => {
        refreshPending();
        setTrips(getMyTrips());
      }).catch(refreshPending);
    };

    tryFlush();
    window.addEventListener('online', tryFlush);
    window.addEventListener(TRIP_QUEUE_CHANGED_EVENT, refreshPending);
    return () => {
      window.removeEventListener('online', tryFlush);
      window.removeEventListener(TRIP_QUEUE_CHANGED_EVENT, refreshPending);
    };
  }, []);

  const isLoading = trips === null;
  const isEmpty = trips !== null && trips.length === 0 && pendingTrips.length === 0;
  // Drawn routes describe a regular way, not a ridden trip — not in the km total.
  const ridden = (trips || []).filter((entry) => entry?.source !== 'manuell');
  const totalM = ridden.reduce((sum, entry) => sum + (Number(entry?.distanceM) || 0), 0);

  return (
    <>
      <Head>
        <title>Mine turer – Finns Fairway</title>
        <meta name="description" content="Se turer du har registrert fra denne enheten." />
        <meta name="robots" content="noindex" />
      </Head>
      <main className="page sub">
        <PageHeader title="Mine turer" intro="Turene du har logget. Lista ligger bare på denne telefonen." />
        <section className="sub__body">

          {pendingTrips.length > 0 && (
            <ul className="my-reports-list my-reports-list--pending">
              {pendingTrips.map((entry) => {
                const km = formatKm(entry.payload?.distanceM);
                const modeLabel = MODE_PAST[normalizeMode(entry.payload?.mode)];
                return (
                  <li className="my-reports-item" key={entry.id}>
                    <div className="my-reports-item__head">
                      <span className="status-pill status-pill--ukjent">Venter på nett</span>
                    </div>
                    <strong className="my-reports-item__title">{km} km · {modeLabel}</strong>
                    <p className="ui-small-text">Lagret på telefonen. Sendes når du får dekning.</p>
                  </li>
                );
              })}
            </ul>
          )}

          {isLoading && <p className="ui-small-text">Laster …</p>}

          {isEmpty && (
            <p className="my-reports-empty">Ingen turer ennå. Trykk på pokalen på kartet og velg «Logg en tur» for å starte. Du trenger ikke være med i en konkurranse.</p>
          )}

          {!isLoading && trips.length > 0 && (
            <>
              <div className="my-trips-total">
                <strong>{formatKm(totalM)} km</strong>
                <span>{ridden.length === 1 ? '1 tur logget' : `${ridden.length} turer logget`}{trips.length > ridden.length ? ` · ${trips.length - ridden.length} tegnet rute${trips.length - ridden.length === 1 ? '' : 'r'}` : ''}</span>
              </div>
              <ul className="trip-rows">
                {trips.map((entry, index) => {
                  const dateLabel = formatDate(entry.createdAt);
                  const drawn = entry.source === 'manuell';
                  const m = normalizeMode(entry.mode);
                  const modeLabel = drawn ? `Tegnet ${{ sykkel: 'sykkelrute', sparkesykkel: 'sparkesykkelrute', gange: 'gårute' }[m]}` : MODE_PAST[m];
                  const routeLabel = entry.routeType === 'skole' ? 'Skolerute' : 'Fritidsrute';
                  return (
                    // eslint-disable-next-line react/no-array-index-key
                    <li className="trip-row" key={`${entry.createdAt || 'ukjent'}-${index}`}>
                      <span className="trip-row__icon" aria-hidden="true"><Icon name={drawn ? 'pencil' : MODE_ICON[normalizeMode(entry.mode)]} size={20} /></span>
                      <span className="trip-row__main">
                        <strong>{formatKm(entry.distanceM)} km</strong>
                        <span>{modeLabel} · {routeLabel}{entry.weatherBonus ? ' · Værhelt' : ''}</span>
                      </span>
                      {dateLabel && <span className="trip-row__date">{dateLabel}</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

        </section>
      </main>
    </>
  );
}
