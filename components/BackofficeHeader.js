import Link from 'next/link';

// Shared top bar for backoffice document pages: back to dashboard + logout.
export default function BackofficeHeader({ title, back = '/backoffice' }) {
  const logout = async () => {
    try { await fetch('/api/staff/logout', { method: 'POST' }); } catch (_e) { /* ignore */ }
    try { window.localStorage.removeItem('ff-admin-secret'); } catch (_e) { /* ignore */ }
    window.location.href = '/backoffice';
  };
  return (
    <header className="bo-header">
      <Link className="bo-header__back" href={back}>‹ Dashbord</Link>
      <span className="bo-header__title">{title}</span>
      <button type="button" className="bo-header__logout" onClick={logout}>Logg ut</button>
    </header>
  );
}
