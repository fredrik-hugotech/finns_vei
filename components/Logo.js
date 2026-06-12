const SIZE_CLASS = {
  sm: 'logo--sm',
  md: 'logo--md',
  lg: 'logo--lg',
};

export default function Logo({ size = 'md', className = '' }) {
  const classes = ['logo', SIZE_CLASS[size] || SIZE_CLASS.md, className].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      <svg className="logo__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="32" cy="16" r="7.4" fill="none" stroke="var(--color-primary)" strokeWidth="4.2" />
        <circle cx="16" cy="32" r="8" fill="var(--color-primary)" />
        <circle cx="32" cy="32" r="8" fill="var(--color-primary)" />
      </svg>
      <span className="logo__word">
        <span className="logo__word-top">Finns</span>
        <span className="logo__word-bottom">Fairway</span>
      </span>
    </span>
  );
}
