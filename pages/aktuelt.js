import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import BudTip from '../components/BudTip';

function fmtNewsDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function eventParts(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: '', month: '', time: '' };
  const hasTime = !(date.getHours() === 0 && date.getMinutes() === 0);
  return {
    day: date.toLocaleDateString('nb-NO', { day: 'numeric' }),
    month: date.toLocaleDateString('nb-NO', { month: 'short' }).replace('.', ''),
    time: hasTime ? date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '',
  };
}

export default function Aktuelt() {
  const [data, setData] = useState(null); // null = loading

  useEffect(() => {
    fetch('/api/aktuelt')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d || { news: [], events: [], configured: false }))
      .catch(() => setData({ news: [], events: [], configured: false }));
  }, []);

  const loading = data === null;
  const news = data?.news || [];
  const events = data?.events || [];
  const nothing = !loading && events.length === 0 && news.length === 0;

  return (
    <>
      <Head>
        <title>Aktuelt – Finns Fairway</title>
        <meta name="description" content="Siste nytt, arrangementer og trygg ferdsel fra Finns Fairway." />
      </Head>
      <main className="page">
        <section className="hero-card aktuelt-card">
          <Logo size="md" />
          <h1>Aktuelt</h1>

          {loading && <p className="ui-small-text">Laster …</p>}

          {!loading && (
            <>
              {events.length > 0 && (
                <div className="aktuelt-section">
                  <h2 className="aktuelt-h2">Kommende</h2>
                  <ul className="aktuelt-list">
                    {events.map((event, index) => {
                      const parts = eventParts(event.start);
                      return (
                        // eslint-disable-next-line react/no-array-index-key
                        <li className="aktuelt-event" key={`${event.start}-${index}`}>
                          <span className="aktuelt-event__date">
                            <strong>{parts.day}</strong>
                            <span>{parts.month}</span>
                          </span>
                          <span className="aktuelt-event__body">
                            <strong>{event.summary}</strong>
                            {(parts.time || event.location) && (
                              <span className="aktuelt-event__meta">
                                {[parts.time, event.location].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {news.length > 0 && (
                <div className="aktuelt-section">
                  <h2 className="aktuelt-h2">Siste nytt</h2>
                  <ul className="aktuelt-list">
                    {news.map((item, index) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <li className="aktuelt-news" key={`${item.link || item.title}-${index}`}>
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noopener noreferrer">
                            <strong>{item.title}</strong>
                            {item.summary && <span className="aktuelt-news__sum">{item.summary}</span>}
                            {item.date && <span className="aktuelt-news__date">{fmtNewsDate(item.date)}</span>}
                          </a>
                        ) : (
                          <>
                            <strong>{item.title}</strong>
                            {item.summary && <span className="aktuelt-news__sum">{item.summary}</span>}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {nothing && (
                <p className="my-reports-empty">
                  {data?.configured
                    ? 'Ingen oppdateringer akkurat nå.'
                    : 'Siste nytt og arrangementer fra finnsfairway.no dukker opp her.'}
                </p>
              )}

              <div className="aktuelt-section">
                <BudTip audience="all" />
              </div>
            </>
          )}

          <Link className="back-link" href="/">← Til forsiden</Link>
        </section>
      </main>
    </>
  );
}
