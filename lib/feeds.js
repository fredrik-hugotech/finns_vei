// Tiny, dependency-free parsers for the "Aktuelt" section: an RSS/Atom news
// feed and an iCalendar (.ics) event feed. Deliberately lenient — they pull
// the few fields we show and skip anything malformed rather than throwing.

function stripTags(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function firstTag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

// RSS <item> or Atom <entry> → { title, link, date (ISO|null), summary }.
export function parseFeed(xml, limit = 6) {
  const text = String(xml || '');
  const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  const blocks = text.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  const items = [];

  for (const block of blocks) {
    const title = decodeEntities(stripTags(firstTag(block, 'title')));
    if (!title) continue;

    let link = '';
    if (isAtom) {
      const alt = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || block.match(/<link[^>]*href="([^"]+)"/i);
      link = alt ? alt[1] : '';
    } else {
      link = decodeEntities(stripTags(firstTag(block, 'link')));
    }

    const rawDate = firstTag(block, isAtom ? 'updated' : 'pubDate')
      || firstTag(block, 'published')
      || firstTag(block, 'dc:date');
    const parsed = rawDate ? new Date(decodeEntities(stripTags(rawDate))) : null;
    const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;

    const summary = decodeEntities(stripTags(firstTag(block, isAtom ? 'summary' : 'description'))).slice(0, 220);

    items.push({ title, link: link.trim(), date, summary });
    if (items.length >= limit) break;
  }
  return items;
}

// RFC5545 line unfolding: a CRLF/LF followed by a space or tab is a continuation.
function unfold(text) {
  return String(text || '').replace(/\r?\n[ \t]/g, '');
}

function icsUnescape(value) {
  return String(value || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function icsValue(block, name) {
  const match = block.match(new RegExp(`(?:^|\\n)${name}(?:;[^:\\n]*)?:([^\\n\\r]*)`, 'i'));
  return match ? match[1].trim() : '';
}

function parseIcsDate(value) {
  const match = String(value || '').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!match) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = match;
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// iCalendar VEVENTs → upcoming { summary, start (ISO), location }, sorted.
export function parseIcs(text, limit = 8, nowMs = Date.now()) {
  const blocks = unfold(text).match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || [];
  const events = [];
  const cutoff = nowMs - 12 * 60 * 60 * 1000; // keep events from earlier today

  for (const block of blocks) {
    const summary = icsUnescape(icsValue(block, 'SUMMARY'));
    const start = parseIcsDate(icsValue(block, 'DTSTART'));
    if (!summary || !start || start.getTime() < cutoff) continue;
    events.push({ summary, start: start.toISOString(), location: icsUnescape(icsValue(block, 'LOCATION')) });
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events.slice(0, limit);
}
