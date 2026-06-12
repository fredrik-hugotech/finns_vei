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
        <rect width="48" height="48" rx="13" fill="var(--color-primary-dark)" />
        <path
          d="M24 10.5c-5.2 0-9.4 4.1-9.4 9.2 0 6.6 8.3 16.4 9 17.2a0.6 0.6 0 0 0 0.9 0c0.7-0.8 9-10.6 9-17.2 0-5.1-4.2-9.2-9.5-9.2z"
          fill="var(--color-primary)"
        />
        <circle cx="24" cy="19.4" r="3.5" fill="var(--color-primary-dark)" />
      </svg>
      <span className="logo__word">
        Finns<span className="logo__word-accent">&nbsp;vei</span>
      </span>
    </span>
  );
}
