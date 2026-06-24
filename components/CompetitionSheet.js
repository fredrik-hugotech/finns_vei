import { useCallback, useEffect, useState } from 'react';

function haptic(ms = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}

function formatPeriod(competition) {
  const fmt = (value) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
    } catch (_error) {
      return value;
    }
  };
  const start = fmt(competition.starts_on);
  const end = fmt(competition.ends_on);
  if (start && end) return `${start} – ${end}`;
  if (end) return `Til ${end}`;
  if (start) return `Fra ${start}`;
  return null;
}

function formatKm(meters) {
  return ((Number(meters) || 0) / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 });
}

const TROPHY = ['🥇', '🥈', '🥉'];

export default function CompetitionSheet({ onClose, onShowTrips, onClearTrips, onPickStart, onViewOnMap, initialCompetitionId = null }) {
  const [view, setView] = useState('list'); // list | detail | log
  const [competitions, setCompetitions] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [club, setClub] = useState('');
  const [helmet, setHelmet] = useState(true);
  const [routeType, setRouteType] = useState('fritid');

  const loadDetail = useCallback(async (id) => {
    setLoadingDetail(true);
    setError('');
    try {
      const response = await fetch(`/api/competitions/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error('Kunne ikke hente konkurransen');
      const data = await response.json();
      setStats(data);
      setView('detail');
      onShowTrips?.(data.geojson, data.competition);
    } catch (err) {
      setError(err.message || 'Noe gikk galt.');
    } finally {
      setLoadingDetail(false);
    }
  }, [onShowTrips]);

  useEffect(() => {
    let active = true;
    fetch('/api/competitions')
      .then((response) => (response.ok ? response.json() : { competitions: [] }))
      .then((data) => { if (active) setCompetitions(data.competitions || []); })
      .catch(() => { if (active) setCompetitions([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (initialCompetitionId) loadDetail(initialCompetitionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompetitionId]);

  const openDetail = (competition) => {
    haptic(6);
    loadDetail(competition.id);
  };

  const backToList = () => {
    haptic(6);
    onClearTrips?.();
    setStats(null);
    setView('list');
  };

  const startLog = () => {
    haptic(8);
    setClub(stats?.competition?.clubs?.[0]?.name || '');
    setHelmet(true);
    setError('');
    setView('log');
  };

  const goPickStart = () => {
    if (!stats?.competition) return;
    if (stats.competition.clubs.length && !club) {
      setError('Velg klubben din.');
      return;
    }
    haptic(12);
    onPickStart?.({ competition: stats.competition, club, helmet, routeType });
  };

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Konkurranser">
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet">
        <button type="button" className="sheet__handle" aria-label="Lukk" onClick={onClose} />
        <div className="sheet-scroll">
          {view === 'list' && (
            <>
              <div className="support-intro">
                <h2>Konkurranser</h2>
                <p>Sykle til trening og fritidsaktiviteter – logg turen og hjelp klubben din til topps. Vi lagrer aldri nøyaktig hvor du bor.</p>
              </div>
              {competitions === null && <p className="comp-muted">Laster …</p>}
              {competitions && competitions.length === 0 && (
                <p className="comp-muted">Ingen aktive konkurranser akkurat nå. Kom tilbake snart!</p>
              )}
              <div className="comp-list">
                {(competitions || []).map((competition) => (
                  <button type="button" key={competition.id} className="comp-card" onClick={() => openDetail(competition)}>
                    <span className="comp-card__icon" aria-hidden="true">🚲</span>
                    <span className="comp-card__body">
                      <strong>{competition.name}</strong>
                      {formatPeriod(competition) && <span className="comp-card__period">{formatPeriod(competition)}</span>}
                      {competition.description && <span className="comp-card__desc">{competition.description}</span>}
                    </span>
                    <span className="comp-card__chev" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
              {error && <div className="notice notice--error" role="status">{error}</div>}
            </>
          )}

          {view === 'detail' && stats && (
            <>
              <button type="button" className="comp-back" onClick={backToList}>‹ Alle konkurranser</button>
              <div className="support-intro">
                <h2>{stats.competition.name}</h2>
                {formatPeriod(stats.competition) && <p className="comp-period-line">{formatPeriod(stats.competition)}</p>}
                {stats.competition.description && <p>{stats.competition.description}</p>}
              </div>

              <div className="comp-totals">
                <div><strong>{stats.totals.trips}</strong><span>sykkelturer</span></div>
                <div><strong>{formatKm(stats.totals.distanceM)}</strong><span>km totalt</span></div>
                <div><strong>{stats.totals.trips ? Math.round((stats.totals.helmetTrips / stats.totals.trips) * 100) : 0}%</strong><span>med hjelm</span></div>
              </div>

              <div className="comp-board">
                <div className="comp-board__head">
                  <h3 className="comp-board__title">Stilling</h3>
                  <span className="comp-board__metric">Vinner: {stats.metric === 'distance' ? 'flest km' : 'flest turer'}</span>
                </div>
                {stats.leaderboard.length === 0 && <p className="comp-muted">Ingen turer logget ennå – bli den første!</p>}
                <ol className="comp-board__list">
                  {stats.leaderboard.map((row, index) => (
                    <li key={row.club} className={index === 0 && row.trips > 0 ? 'comp-row comp-row--lead' : 'comp-row'}>
                      <span className="comp-row__rank">{TROPHY[index] || index + 1}</span>
                      <span className="comp-row__club">{row.club}</span>
                      <span className="comp-row__stats">
                        <span className="comp-row__helmet" title="Andel med hjelm">⛑ {row.helmetPct}%</span>
                        <span className={stats.metric === 'distance' ? 'comp-row__count comp-row__count--muted' : 'comp-row__count'}>{row.trips} turer</span>
                        <span className={stats.metric === 'distance' ? 'comp-row__count' : 'comp-row__count comp-row__count--muted'}>{formatKm(row.distanceM)} km</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {error && <div className="notice notice--error" role="status">{error}</div>}
            </>
          )}

          {view === 'log' && stats && (
            <>
              <button type="button" className="comp-back" onClick={() => setView('detail')}>‹ Tilbake</button>
              <div className="support-intro">
                <h2>Logg sykkeltur</h2>
                <p>Velg type rute, klubb og hjelm, og trykk start. Telefonen måler distanse og tid mens du sykler. Startstedet rundes av – ingen ser hvor du bor.</p>
              </div>

              <fieldset className="sheet-field">
                <legend>Hva sykler du til?</legend>
                <div className="segmented">
                  <button type="button" className={routeType === 'fritid' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setRouteType('fritid'); }}>⚽ Fritid</button>
                  <button type="button" className={routeType === 'skole' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setRouteType('skole'); }}>🏫 Skole</button>
                </div>
              </fieldset>

              {stats.competition.clubs.length > 0 && (
                <label className="sheet-field">
                  <span className="sheet-field__label">Klubben din</span>
                  <select className="comp-select" value={club} onChange={(event) => setClub(event.target.value)}>
                    <option value="">Velg klubb …</option>
                    {stats.competition.clubs.map((entry) => (
                      <option key={entry.name} value={entry.name}>{entry.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <button
                type="button"
                className={helmet ? 'helmet-toggle helmet-toggle--on' : 'helmet-toggle'}
                onClick={() => { haptic(6); setHelmet((value) => !value); }}
                aria-pressed={helmet}
              >
                <span className="helmet-toggle__icon" aria-hidden="true">⛑</span>
                <span className="helmet-toggle__label">Jeg brukte hjelm</span>
                <span className="helmet-toggle__check" aria-hidden="true">{helmet ? '✓' : ''}</span>
              </button>

              {error && <div className="notice notice--error" role="status">{error}</div>}
            </>
          )}
        </div>

        {view === 'detail' && stats && (
          <div className="sheet-footer sheet-footer--split">
            <button className="big-button big-button--secondary" type="button" onClick={() => { haptic(8); onViewOnMap?.(stats.competition); }}>
              Vis spor på kart 🗺️
            </button>
            <button className="big-button big-button--primary" type="button" onClick={startLog} disabled={loadingDetail}>
              Logg sykkeltur 🚴
            </button>
          </div>
        )}
        {view === 'log' && stats && (
          <div className="sheet-footer">
            <button className="big-button big-button--primary" type="button" onClick={goPickStart}>
              Start sykkeltur 🚴
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
