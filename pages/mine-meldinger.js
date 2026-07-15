import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import { reportStatusMeta } from '../lib/reportStatusMeta';
import { getMyReports, removeMyReport } from '../lib/myReports';
import { QUEUE_CHANGED_EVENT, flushQueue, getPendingReports } from '../lib/offlineReportQueue';

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
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
      })
      .catch(() => setFetchState('error'));
  }, [entries]);

  const handleRemove = (id) => {
    removeMyReport(id);
    setEntries((current) => (current || []).filter((entry) => entry.id !== id));
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
                      {statusNode}
                      {dateLabel && <span className="my-reports-item__date">{dateLabel}</span>}
                    </div>
                    <strong className="my-reports-item__title">{category}</strong>
                    <div className="my-reports-item__actions">
                      <Link className="big-button big-button--secondary my-reports-item__open" href={`/sak/${encodeURIComponent(entry.id)}`}>
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
