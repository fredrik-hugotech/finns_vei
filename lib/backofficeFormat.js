// Small display-formatting helpers shared by the backoffice case list views
// (index.js dashboard, liste.js, hotteste.js), which each previously kept
// their own copy.

// "i dag", "i går", "5 dager siden"; older than a month shows the date.
export function timeAgo(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const days = Math.floor(diff / 86400000);
  if (days > 30) {
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString('nb-NO', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (days >= 2) return `${days} dager siden`;
  if (days === 1) return 'i går';
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours} ${hours === 1 ? 'time' : 'timer'} siden`;
  return `${Math.max(1, Math.floor(diff / 60000))} min siden`;
}

// Road owner in plain words ("Kommunal vei", "Fylkesvei", "Riksvei") from
// whatever NVDB gave us ("Kommune", "Fylkeskommune", "Statens vegvesen").
export function ownerName(owner) {
  const o = String(owner || '').toLowerCase();
  if (!o) return '';
  if (o.includes('fylke')) return 'Fylkesvei';
  if (o.includes('kommune')) return 'Kommunal vei';
  if (o.includes('stat') || o.includes('vegvesen')) return 'Riksvei';
  if (o.includes('privat')) return 'Privat vei';
  return owner;
}

export function ownerShort(owner, speed) {
  const s = speed ? `${speed} km/t` : '';
  return [ownerName(owner), s].filter(Boolean).join(' · ');
}

// A colleague's name from their e-mail: "kari.hansen@…" → "Kari Hansen".
export function staffName(email) {
  const local = String(email || '').split('@')[0];
  return local.split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// A non-ok, non-403 fetch response's real error message (and Retry-After on
// 429) is more useful to staff than a generic hardcoded string — several
// backoffice pages fire multiple fetches per load and can plausibly trip a
// route's rate limit with several tabs open.
export async function describeFetchError(res, fallback) {
  const body = await res.json().catch(() => null);
  const message = body?.error || fallback;
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    return retryAfter ? `${message} Prøv igjen om ca. ${retryAfter} sekunder.` : message;
  }
  return message;
}
