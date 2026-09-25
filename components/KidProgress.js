// Kid-facing progress widgets: level bar, streak, weekly challenge and the
// badge ("merke") grid. Everything is derived from lib/kidsProgress.js.

const ICONS = {
  bike: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="M15 6h-3l-4 8h6l2-4 2 7" /><path d="M9 14 5.5 17" /></svg>,
  five: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5H9l-.8 6c1-.8 2-1.2 3.2-1.2a4 4 0 1 1-3.6 5.8" /></svg>,
  ten: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7l2-1.5V19" /><rect x="11" y="5" width="8" height="14" rx="4" /></svg>,
  helmet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 14a9 9 0 0 1 18 0v2H3z" /><path d="M3 16h18l-2 3H5z" /><path d="M12 5v9" /></svg>,
  rain: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14a5 5 0 0 1 1.4-9.8A6 6 0 0 1 17 6a4 4 0 0 1 1 7.9" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>,
  school: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 20V10l9-6 9 6v10z" /><path d="M9 20v-6h6v6" /><path d="M12 4v3" /></svg>,
  route: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8 17c4 0 2-8 6-8s2 6 4 6" /></svg>,
  flame: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 1-6 1-9z" /></svg>,
  star: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>,
  medal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="14" r="5.5" /><path d="M8.5 9.5 6 3h4l2 4 2-4h4l-2.5 6.5" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>,
};

export function BadgeIcon({ icon }) {
  return ICONS[icon] || ICONS.star;
}

export function LevelBar({ progress, compact = false }) {
  if (!progress) return null;
  const { level, streak, thisWeek, weeklyGoal } = progress;
  return (
    <div className={compact ? 'kp kp--compact' : 'kp'}>
      <div className="kp__row">
        <span className="kp__level">{level.name}</span>
        <span className="kp__meta">{level.next ? `${level.tripsToNext} ${level.tripsToNext === 1 ? 'tur' : 'turer'} til ${level.next}` : 'Høyeste nivå!'}</span>
      </div>
      <div className="kp__bar" role="progressbar" aria-valuenow={level.percent} aria-valuemin="0" aria-valuemax="100">
        <span style={{ width: `${level.percent}%` }} />
      </div>
      <div className="kp__chips">
        <span className={streak > 0 ? 'kp__chip kp__chip--hot' : 'kp__chip'}>
          <BadgeIcon icon="flame" />
          {streak > 0 ? `${streak} ${streak === 1 ? 'dag' : 'dager'} på rad` : 'Start en rekke i dag'}
        </span>
        <span className={thisWeek >= weeklyGoal ? 'kp__chip kp__chip--done' : 'kp__chip'}>
          <BadgeIcon icon="star" />
          Ukas utfordring {Math.min(thisWeek, weeklyGoal)}/{weeklyGoal}
        </span>
      </div>
    </div>
  );
}

export function BadgeGrid({ progress, highlight = [] }) {
  if (!progress) return null;
  const hot = new Set(highlight.map((b) => b.id));
  return (
    <ul className="kb">
      {progress.badges.map((b) => (
        <li key={b.id} className={`kb__item${b.earned ? ' kb__item--earned' : ''}${hot.has(b.id) ? ' kb__item--new' : ''}`} title={b.how}>
          <span className="kb__icon"><BadgeIcon icon={b.icon} /></span>
          <span className="kb__name">{b.name}</span>
          <span className="kb__how">{b.how}</span>
        </li>
      ))}
    </ul>
  );
}
