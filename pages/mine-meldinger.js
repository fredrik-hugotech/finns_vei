import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import { reportStatusMeta } from '../lib/reportStatusMeta';
import { getMyReports, removeMyReport, getReportLastSeenAt, markReportSeen } from '../lib/myReports';
import { QUEUE_CHANGED_EVENT, flushQueue, getPendingReports } from '../lib/offlineReportQueue';

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A report can be updated either through its workflow status or through a
// public note/reply — take whichever happened most recently.
function latestUpdateAt(live) {
  if (!live) return null;
  const candidates = [live.status_updated_at, live.public_status_updated_at].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.reduce((latest, iso) => {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return latest;
    if (!latest || time > new Date(latest).getTime()) return iso;
    return latest;
  }, null);
}

export default function MineMeldinger() {
  const [entries, setEntries] = useState(null); // null = not yet read from localStorage
  const [liveById, setLiveById] = useState({});
  const [pendingReports, setPendingReports] = useState([]); // queued on this device, not sent yet

  useEffect(() => {
    // A queued report can flush automatically (e.g. the 'online' listener
    // below, or another tab/page) while this page stays mounted — re-read the
    // confirmed-reports list too, not just the pending count, so a report
    // that just sent doesn't appear to vanish until a manual reload.
    const refreshPending = () => {
      setPendingReports(getPendingReports());
      setEntries(getMyReports());
    };

    const tryFlush = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushQueue().then(refreshPending).catch(refreshPending);
    };

    tryFlush();
    window.addEventListener('online', tryFlush);
    window.addEventListener(QUEUE_CHANGED_EVENT, refreshPending);
    return () => {
      window.removeEventListener('online', tryFlush);
      window.removeEventListener(QUEUE_CHANGED_EVENT, refreshPending);
    };
  }, []);
  // 'idle' while nothing to fetch yet, 'loading', 'ok' (server responded with
  // at least one match), 'empty' (server responded but found none of our ids —
  // ambiguous: could be missing Supabase config, could be all deleted), 'error'.
  const [fetchState, setFetchState] = useState('idle');

  useEffect(() => {
    setEntries(getMyReports());
  }, []);

  useEffect(() => {
    if (!entries || !entries.length) return;
    setFetchState('loading');
    const ids = entries.map((entry) => entry.id).join(',');
    fetch(`/api/my-reports-status?ids=${encodeURIComponent(ids)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('request_failed'))))
      .then((data) => {
        const reports = Array.isArray(data?.reports) ? data.reports : [];
        const map = {};
        reports.forEach((report) => { if (report?.id) map[report.id] = report; });
        setLiveById(map);
        setFetchState(reports.length ? 'ok' : 'empty');
        // Reports with no recorded "last seen" timestamp yet (existing
        // trackers from before this feature shipped, or a report that was
        // just submitted) get a baseline set to now, so the "new update"
        // badge only ever reflects changes going forward — never a stale or
        // incorrect badge on a first-ever view.
        reports.forEach((report) => {
          if (report?.id && getReportLastSeenAt(report.id) === null) {
            markReportSeen(report.id);
          }
        });
      })
      .catch(() => setFetchState('error'));
  }, [entries]);

  const handleRemove = (id) => {
    removeMyReport(id);
    setEntries((current) => (current || []).filter((entry) => entry.id !== id));
  };

  // Clear the "new update" badge as the reporter actually opens the report's
  // own detail page — matches the interaction point where they'd notice the
  // update, not just where it happened to render in the list.
  const handleOpen = (id) => {
    markReportSeen(id);
  };

  const isEmpty = entries !== null && entries.length === 0;
  const isLoadingList = entries === null;

  return (
    <>
      <Head>
        <title>Mine meldinger – Finns Fairway</title>
        <meta name="description" content="Se meldinger du har sendt inn fra denne enheten." />
        <meta name="robots" content="noindex" />
      </Head>
      <main className="page">
        <section className="hero-card my-reports-card">
          <Logo size="md" />
          <h1>Mine meldinger</h1>
          <p className="lede">
            Meldinger du har sendt fra denne enheten. Listen lagres kun i denne nettleseren — den er ikke knyttet til deg og forsvinner om du tømmer nettleserdata.
          </p>

          {pendingReports.length > 0 && (
            <ul className="my-reports-list my-reports-list--pending">
              {pendingReports.map((entry) => (
                <li className="my-reports-item" key={entry.id}>
                  <div className="my-reports-item__head">
                    <span className="status-pill status-pill--ukjent">Venter på nett</span>
                  </div>
                  <strong className="my-reports-item__title">{entry.payload?.category || 'Melding'}</strong>
                  <p className="ui-small-text">Lagret på enheten – sendes automatisk når du får dekning igjen.</p>
                </li>
              ))}
            </ul>
          )}

          {isLoadingList && <p className="ui-small-text">Laster …</p>}

          {isEmpty && pendingReports.length === 0 && (
            <>
              <p className="my-reports-empty">Du har ikke meldt fra om noe fra denne enheten ennå.</p>
              <Link className="big-button big-button--primary" href="/">Meld fra</Link>
            </>
          )}

          {!isLoadingList && !isEmpty && (
            <ul className="my-reports-list">
              {entries.map((entry) => {
                const live = liveById[entry.id];
                const category = live?.category || entry.category || 'Melding';
                const dateLabel = formatDate(entry.createdAt);

                // Only compare against a recorded last-seen timestamp — a
                // report we have never recorded a "seen" moment for (see the
                // backfill above) must never show an update badge.
                const updatedAt = latestUpdateAt(live);
                const lastSeenAt = getReportLastSeenAt(entry.id);
                const hasNewUpdate = Boolean(
                  updatedAt && lastSeenAt && new Date(updatedAt).getTime() > new Date(lastSeenAt).getTime()
                );

                let statusNode;
                if (live) {
                  const meta = reportStatusMeta(live.status);
                  statusNode = (
                    <span
                      className={`status-pill status-pill--${meta.key}`}
                      dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }}
                    />
                  );
                } else if (fetchState === 'ok') {
                  // The server answered and knows about other ids in this list,
                  // but not this one — be transparent instead of hiding it.
                  statusNode = <span className="my-reports-item__note">Ikke funnet</span>;
                } else if (fetchState === 'loading' || fetchState === 'idle') {
                  statusNode = <span className="my-reports-item__note">Henter status …</span>;
                } else {
                  // 'empty' (e.g. Supabase not configured) or 'error' — we cannot
                  // tell if the report still exists, so don't claim it's gone.
                  statusNode = <span className="my-reports-item__note">Status ukjent</span>;
                }

                return (
                  <li className="my-reports-item" key={entry.id}>
                    <div className="my-reports-item__head">
                      <span className="my-reports-item__head-left">
                        {statusNode}
                        {hasNewUpdate && (
                          <span className="my-reports-item__update-badge" role="status">
                            <span className="my-reports-item__update-dot" aria-hidden="true" />
                            Ny oppdatering
                          </span>
                        )}
                      </span>
                      {dateLabel && <span className="my-reports-item__date">{dateLabel}</span>}
                    </div>
                    <strong className="my-reports-item__title">{category}</strong>
                    <div className="my-reports-item__actions">
                      <Link
                        className="big-button big-button--secondary my-reports-item__open"
                        href={`/sak/${encodeURIComponent(entry.id)}`}
                        onClick={() => handleOpen(entry.id)}
                      >
                        Se saken
                      </Link>
                      <button
                        type="button"
                        className="my-reports-item__remove"
                        onClick={() => handleRemove(entry.id)}
                        aria-label={`Fjern «${category}» fra listen på denne enheten. Dette sletter ikke selve meldingen.`}
                      >
                        Fjern
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Link className="back-link" href="/">← Til forsiden</Link>
        </section>
      </main>
    </>
  );
}
