import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import useSheetDrag from '../hooks/useSheetDrag';
import { pickDistanceFact } from '../lib/distanceFacts';

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

const RANK_CLASS = ['comp-row__rank--gold', 'comp-row__rank--silver', 'comp-row__rank--bronze'];

export default function CompetitionSheet({ onClose, onPickStart, initialCompetitionId = null }) {
  const [view, setView] = useState('list'); // list | detail | log
  const [competitions, setCompetitions] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [club, setClub] = useState('');
  const [helmet, setHelmet] = useState(true);
  const [routeType, setRouteType] = useState('fritid');
  const [mode, setMode] = useState('sykkel'); // sykkel | gange
  const [isAdmin, setIsAdmin] = useState(false);
  const sheetDrag = useSheetDrag(onClose);
  const distanceFact = stats ? pickDistanceFact(stats.totals?.distanceM) : null;

  useEffect(() => {
    try { setIsAdmin(Boolean(window.localStorage.getItem('ff-admin-secret'))); } catch (_e) { /* ignore */ }
  }, []);

  const loadDetail = useCallback(async (id) => {
    setLoadingDetail(true);
    setError('');
    try {
      const response = await fetch(`/api/competitions/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error('Kunne ikke hente konkurransen');
      const data = await response.json();
      setStats(data);
      setView('detail');
    } catch (err) {
      setError(err.message || 'Noe gikk galt.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

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
    onPickStart?.({ competition: stats.competition, club, helmet, routeType, mode });
  };

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Konkurranser">
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" ref={sheetDrag.sheetRef}>
        <button type="button" className="sheet__handle" aria-label="Lukk" onClick={onClose} {...sheetDrag.dragHandlers} />
        <div className="sheet-scroll">
          {view === 'list' && (
            <>
              <div className="support-intro">
                <h2>Konkurranser</h2>
              </div>
              {isAdmin && (
                <a className="comp-admin-link" href="/backoffice/konkurranser">+ Opprett / administrer konkurranser</a>
              )}
              {competitions === null && <p className="comp-muted">Laster …</p>}
              {competitions && competitions.length === 0 && (
                <p className="comp-muted">Ingen aktive konkurranser akkurat nå. Kom tilbake snart!</p>
              )}
              <div className="comp-list">
                {(competitions || []).map((competition) => (
                  <button type="button" key={competition.id} className="comp-card" onClick={() => openDetail(competition)}>
                    <span className="comp-card__icon" aria-hidden="true"><Icon name="bike" size={22} /></span>
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
                <div><strong>{stats.totals.trips}</strong><span>turer</span></div>
                <div><strong>{formatKm(stats.totals.distanceM)}</strong><span>km totalt</span></div>
                <div><strong>{stats.totals.trips ? Math.round((stats.totals.helmetTrips / stats.totals.trips) * 100) : 0}%</strong><span>med hjelm</span></div>
              </div>
              {distanceFact && <p className="comp-fact-line">{distanceFact}</p>}
              {stats.weatherHero && (
                <p className="comp-weather-note">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14a5 5 0 0 1 1.4-9.8A6 6 0 0 1 17 6a4 4 0 0 1 1 7.9" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>
                  <span><b>Værhelt:</b> {stats.weatherHero.club} – flest turer i regn og snø. Avgjør ved likt antall.</span>
                </p>
              )}

              <div className="comp-board">
                <div className="comp-board__head">
                  <h3 className="comp-board__title">Stilling</h3>
                  <span className="comp-board__metric">Vinner: {stats.metric === 'distance' ? 'flest km' : 'flest turer'}</span>
                </div>
                {stats.leaderboard.length === 0 && <p className="comp-muted">Ingen turer logget ennå – bli den første!</p>}
                <ol className="comp-board__list">
                  {stats.leaderboard.map((row, index) => (
                    <li key={row.club} className={index === 0 && row.trips > 0 ? 'comp-row comp-row--lead' : 'comp-row'}>
                      <span className={`comp-row__rank ${row.trips > 0 ? (RANK_CLASS[index] || '') : ''}`}>{index + 1}</span>
                      <span className="comp-row__club">
                        {row.club}
                        {stats.weatherHero?.club === row.club && (
                          <span className="comp-row__hero" title={`Værhelt – ${row.bonusTrips} tur${row.bonusTrips === 1 ? '' : 'er'} i regn eller snø`}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14a5 5 0 0 1 1.4-9.8A6 6 0 0 1 17 6a4 4 0 0 1 1 7.9" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>
                            Værhelt
                          </span>
                        )}
                      </span>
                      <span className="comp-row__stats">
                        <span className="comp-row__helmet" title="Andel med hjelm"><Icon name="helmet" size={14} /> {row.helmetPct}%</span>
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
                <h2>Logg tur</h2>
              </div>

              <fieldset className="sheet-field">
                <legend>Sykler eller går du?</legend>
                <div className="segmented">
                  <button type="button" className={mode === 'sykkel' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setMode('sykkel'); }}><Icon name="bike" size={16} /> Sykle</button>
                  <button type="button" className={mode === 'gange' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setMode('gange'); }}><Icon name="activity" size={16} /> Gå</button>
                </div>
              </fieldset>

              <fieldset className="sheet-field">
                <legend>Hvor skal du?</legend>
                <div className="segmented">
                  <button type="button" className={routeType === 'fritid' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setRouteType('fritid'); }}><Icon name="activity" size={16} /> Fritid</button>
                  <button type="button" className={routeType === 'skole' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setRouteType('skole'); }}><Icon name="school" size={16} /> Skole</button>
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
                <span className="helmet-toggle__icon" aria-hidden="true"><Icon name="helmet" size={20} /></span>
                <span className="helmet-toggle__label">Jeg brukte hjelm</span>
                <span className="helmet-toggle__check" aria-hidden="true">{helmet ? <Icon name="check" size={18} /> : ''}</span>
              </button>

              {error && <div className="notice notice--error" role="status">{error}</div>}
            </>
          )}
        </div>

        {view === 'detail' && stats && (
          <div className="sheet-footer">
            <button className="big-button big-button--primary comp-action" type="button" onClick={startLog} disabled={loadingDetail}>
              <Icon name="bike" size={18} /> Logg tur
            </button>
          </div>
        )}
        {view === 'log' && stats && (
          <div className="sheet-footer">
            <button className="big-button big-button--primary comp-action" type="button" onClick={goPickStart}>
              <Icon name="bike" size={18} /> Start tur
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
