// Where a visitor came from (the referring website and utm_* tags on the link),
// so staff can see which channels bring reports — e.g. Facebook vs. a local
// newspaper. Only the host name and campaign tags are kept, in this browser,
// for 30 days; nothing about the person. Sent along with a report.
const KEY = 'ff-kilde';
const DAYS = 30;

function clean(v, max = 60) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9._\-æøå ]/g, '').trim().slice(0, max) || null;
}

export function captureVisitSource() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const p = url.searchParams;
    let host = '';
    try {
      const ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
      if (ref && ref !== window.location.hostname.replace(/^www\./, '')) host = ref;
    } catch (_e) { /* ignore */ }
    if (!host && p.has('fbclid')) host = 'facebook.com';
    if (!host && p.has('gclid')) host = 'google.com';
    const utm = { s: clean(p.get('utm_source')), m: clean(p.get('utm_medium')), c: clean(p.get('utm_campaign'), 80) };
    if (!host && !utm.s && !utm.c) return; // a direct visit keeps an earlier source
    window.localStorage.setItem(KEY, JSON.stringify({ host: clean(host, 80), ...utm, at: Date.now() }));
  } catch (_e) { /* storage blocked: no source */ }
}

export function visitSourceFields() {
  let v = null;
  try { v = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (_e) { v = null; }
  if (!v || Date.now() - Number(v.at || 0) > DAYS * 864e5) return { source_host: 'direkte' };
  return {
    source_host: v.host || (v.s ? '' : 'direkte'),
    source_utm_source: v.s || '',
    source_utm_medium: v.m || '',
    source_utm_campaign: v.c || '',
  };
}

// Groups a report's source into a channel name for Innsikt.
export function sourceChannel(r) {
  const h = String(r.source_host || '').toLowerCase();
  const s = String(r.source_utm_source || '').toLowerCase();
  const any = `${h} ${s}`;
  if (!h && !s) return null; // before measuring started
  if (/facebook|fb\b|messenger/.test(any)) return 'Facebook';
  if (/instagram/.test(any)) return 'Instagram';
  if (/linkedin|lnkd/.test(any)) return 'LinkedIn';
  if (/snapchat/.test(any)) return 'Snapchat';
  if (/tiktok/.test(any)) return 'TikTok';
  if (/(^|\s)t\.co|twitter|x\.com/.test(any)) return 'X/Twitter';
  if (/google|bing|duckduckgo|kvasir|yahoo/.test(any)) return 'Søk (Google o.l.)';
  if (/finnsfairway/.test(any)) return 'finnsfairway.no';
  if (/mail|outlook|gmail|nyhetsbrev|epost|e-post/.test(any)) return 'E-post';
  if (/qr|plakat|skilt/.test(any)) return 'QR/plakat';
  if (h === 'direkte' && !s) return 'Direkte (lenke, app eller skrevet inn)';
  return h && h !== 'direkte' ? h : s;
}
