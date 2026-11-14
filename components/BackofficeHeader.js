import Link from 'next/link';
import { useRouter } from 'next/router';
import Logo from './Logo';

// The most used staff pages. On larger screens they sit in the top bar; on
// phones the bar shows back + title and the dashboard links to the rest.
const NAV = [
  { href: '/backoffice', label: 'Oversikt' },
  { href: '/backoffice/liste', label: 'Saker', match: ['/backoffice/liste', '/backoffice/sak', '/backoffice/hotteste', '/backoffice/gjentakende-steder'] },
  { href: '/backoffice/prioritering', label: 'Prioritering' },
  { href: '/', label: 'Kart' },
  { href: '/backoffice/statistikk', label: 'Statistikk' },
  { href: '/backoffice/sparkesykler', label: 'Sparkesykler' },
  { href: '/backoffice/tetthet', label: 'Sykkelspor' },
  { href: '/backoffice/konkurranser', label: 'Konkurranser' },
];

function isActive(item, path) {
  if (item.href === '/backoffice') return path === '/backoffice';
  return (item.match || [item.href]).some((m) => path === m || path.startsWith(`${m}/`));
}

// Shared top bar for the backoffice: brand + navigation on larger screens,
// back link + page title on phones, and logout.
export default function BackofficeHeader({ title, back = '/backoffice', backLabel = 'Oversikt' }) {
  const router = useRouter();
  const path = router?.pathname?.replace('/[id]', '') || '';
  const logout = async () => {
    try { await fetch('/api/staff/logout', { method: 'POST' }); } catch (_e) { /* ignore */ }
    try { window.localStorage.removeItem('ff-admin-secret'); } catch (_e) { /* ignore */ }
    window.location.href = '/backoffice';
  };
  const atHome = path === '/backoffice';
  return (
    <header className="bo-header">
      <Link className="bo-header__brand" href="/backoffice" aria-label="Finnsvei backoffice – oversikt">
        <Logo size="sm" variant="symbol" />
        <span className="bo-header__brandtext">Finnsvei</span>
      </Link>
      {!atHome && <Link className="bo-header__back" href={back}>‹ {backLabel}</Link>}
      <span className="bo-header__title">{title}</span>
      <nav className="bo-header__nav" aria-label="Backoffice">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item, path) ? 'bo-header__link bo-header__link--on' : 'bo-header__link'}
            aria-current={isActive(item, path) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <button type="button" className="bo-header__logout" onClick={logout}>Logg ut</button>
    </header>
  );
}
