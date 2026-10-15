import { LOGO_PATHS, LOGO_VIEWBOX, SYMBOL_PATHS, SYMBOL_VIEWBOX } from '../lib/brandArtwork';

// The official Finns Fairway logo (or the symbol alone), drawn from the
// original artwork. Height is set by size; colour follows `currentColor`
// (brand green by default via .logo).
const SIZE_CLASS = { sm: 'logo--sm', md: 'logo--md', lg: 'logo--lg', xl: 'logo--xl' };

export default function Logo({ size = 'md', variant = 'full', className = '' }) {
  const symbol = variant === 'symbol';
  const classes = ['logo', symbol ? 'logo--symbol' : 'logo--full', SIZE_CLASS[size] || SIZE_CLASS.md, className].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      <svg viewBox={symbol ? SYMBOL_VIEWBOX : LOGO_VIEWBOX} role="img" aria-label="Finns Fairway" focusable="false">
        {(symbol ? SYMBOL_PATHS : LOGO_PATHS).map((d) => <path key={d.slice(0, 24)} d={d} fill="currentColor" />)}
      </svg>
    </span>
  );
}
