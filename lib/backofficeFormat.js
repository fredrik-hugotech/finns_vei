// Small display-formatting helpers shared by the backoffice case list views
// (index.js dashboard, liste.js, hotteste.js), which each previously kept
// their own copy.

export function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} d siden`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours} t siden`;
  return `${Math.max(1, Math.floor(diff / 60000))} min siden`;
}

export function ownerShort(owner, speed) {
  const map = { kommune: 'Kommunal', fylke: 'Fylkesvei', stat: 'Riksvei', privat: 'Privat' };
  const o = map[String(owner || '').toLowerCase()];
  const s = speed ? `${speed} km/t` : '';
  return [o, s].filter(Boolean).join(' · ');
}
