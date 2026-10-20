import { useState } from 'react';
import Icon from './Icon';
import TripWhoGate from './TripWhoGate';
import useSheetDrag from '../hooks/useSheetDrag';

function haptic(ms = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}

// "Logg tur" from the main map — its own choice next to "Meld fra", not
// something that lives inside a competition. Starts with "Hvem logger turen?"
// (components/TripWhoGate.js); an adult can also go on to draw a route. If a
// competition happens to be running, the trip can count in it, but nothing
// here requires one.
export default function TripSheet({ competitions = [], onClose, onPickStart }) {
  const [view, setView] = useState('who'); // who | log
  const [loggedBy, setLoggedBy] = useState('barn13');
  const [mode, setMode] = useState('sykkel');
  const [routeType, setRouteType] = useState('fritid');
  const [helmet, setHelmet] = useState(true);
  // One choice for "counts in": a competition + club pair, or none. '?' =
  // not chosen yet, so nobody ends up on the wrong club by default.
  const [countsIn, setCountsIn] = useState(competitions.length ? '?' : '');
  const [error, setError] = useState('');
  const sheetDrag = useSheetDrag(onClose);

  const countOptions = [];
  for (const c of competitions) {
    const clubs = [...(c.clubs || [])].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
    if (clubs.length) clubs.forEach((cl) => countOptions.push({ value: `${c.id}|${cl.name}`, label: competitions.length > 1 ? `${c.name} · ${cl.name}` : cl.name, group: c.name }));
    else countOptions.push({ value: `${c.id}|`, label: c.name });
  }
  const [compId, club] = countsIn && countsIn !== '?' ? countsIn.split('|') : ['', ''];
  const competition = competitions.find((c) => c.id === compId) || null;

  const pickWho = (choice) => {
    if (choice === 'voksen-tegn') { window.location.href = '/tegn-rute?voksen=1'; return; }
    setLoggedBy(choice === 'voksen-live' ? 'voksen' : 'barn13');
    setError('');
    setView('log');
  };

  const start = () => {
    if (countsIn === '?') { setError('Velg klubb, eller «Ingen konkurranse».'); return; }
    haptic(12);
    onPickStart?.({ competition, club: competition ? club : '', helmet, routeType, mode, loggedBy });
  };

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="Logg tur">
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" ref={sheetDrag.sheetRef}>
        <button type="button" className="sheet__handle" aria-label="Lukk" onClick={onClose} {...sheetDrag.dragHandlers} />
        <div className="sheet-scroll">
          {view === 'who' && <TripWhoGate variant="sheet" onPick={pickWho} />}

          {view === 'log' && (
            <>
              <button type="button" className="comp-back" onClick={() => setView('who')}><Icon name="chevronLeft" size={18} strokeWidth={2.2} />Tilbake</button>
              <div className="support-intro">
                <h2>Logg tur{loggedBy === 'voksen' && <span className="comp-voksen-note"><Icon name="user" size={14} />Voksen er med</span>}</h2>
              </div>

              <fieldset className="sheet-field">
                <legend>Hvordan?</legend>
                <div className="segmented">
                  <button type="button" className={mode === 'sykkel' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setMode('sykkel'); }}><Icon name="bike" size={16} /> Sykle</button>
                  <button type="button" className={mode === 'gange' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setMode('gange'); }}><Icon name="walk" size={16} /> Gå</button>
                </div>
              </fieldset>

              <fieldset className="sheet-field">
                <legend>Hvor skal {loggedBy === 'voksen' ? 'dere' : 'du'}?</legend>
                <div className="segmented">
                  <button type="button" className={routeType === 'fritid' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setRouteType('fritid'); }}><Icon name="ball" size={16} /> Trening og fritid</button>
                  <button type="button" className={routeType === 'skole' ? 'segmented__option segmented__option--active' : 'segmented__option'} onClick={() => { haptic(6); setRouteType('skole'); }}><Icon name="school" size={16} /> Skole</button>
                </div>
              </fieldset>

              {competitions.length > 0 && (
                <label className="sheet-field">
                  <span className="sheet-field__label">{competitions.length === 1 ? `Teller i ${competitions[0].name}` : 'Teller i konkurranse'}</span>
                  <select className="comp-select" value={countsIn} onChange={(e) => { setCountsIn(e.target.value); setError(''); }}>
                    <option value="?" disabled>{loggedBy === 'voksen' ? 'Velg barnets klubb …' : 'Velg klubben din …'}</option>
                    {countOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    <option value="">Ingen konkurranse</option>
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
                <span className="helmet-toggle__label">{loggedBy === 'voksen' ? 'Barnet bruker hjelm' : 'Jeg bruker hjelm'}</span>
                <span className="helmet-toggle__check" aria-hidden="true">{helmet ? <Icon name="check" size={18} /> : ''}</span>
              </button>

              {error && <div className="notice notice--error" role="status">{error}</div>}
            </>
          )}
        </div>

        {view === 'log' && (
          <div className="sheet-footer">
            <button className="big-button big-button--primary comp-action" type="button" onClick={start}>
              <Icon name="bike" size={18} /> Start tur
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
