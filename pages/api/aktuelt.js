import { parseFeed, parseIcs } from '../../lib/feeds';

// "Aktuelt" data: latest news (RSS/Atom) + upcoming events (iCal). Both sources
// are optional and set via env so no code change is needed to wire them up:
//   NEWS_FEED_URL      e.g. https://finnsfairway.no/feed
//   CALENDAR_ICS_URL   e.g. a public Google Calendar .ics URL
// Missing/failing sources just return empty arrays — the page degrades to the
// bud tips.
const NEWS_FEED_URL = process.env.NEWS_FEED_URL || '';
const CALENDAR_ICS_URL = process.env.CALENDAR_ICS_URL || '';
const TTL_MS = 10 * 60 * 1000;

// Per-instance memo so repeated opens within a few minutes don't re-fetch.
// The Cache-Control header below does the real cross-user caching at the edge.
let cache = { at: 0, data: null };

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'FinnsFairway/1.0 (+https://finnsfairway.no)', Accept: '*/*' },
  });
  if (!response.ok) throw new Error(`Feed ${url} svarte ${response.status}`);
  return response.text();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

  if (cache.data && Date.now() - cache.at < TTL_MS) {
    return res.status(200).json(cache.data);
  }

  const data = {
    news: [],
    events: [],
    configured: Boolean(NEWS_FEED_URL || CALENDAR_ICS_URL),
  };

  await Promise.all([
    NEWS_FEED_URL
      ? fetchText(NEWS_FEED_URL).then((xml) => { data.news = parseFeed(xml, 6); }).catch((error) => console.error('news feed:', error?.message))
      : Promise.resolve(),
    CALENDAR_ICS_URL
      ? fetchText(CALENDAR_ICS_URL).then((ics) => { data.events = parseIcs(ics, 8); }).catch((error) => console.error('calendar feed:', error?.message))
      : Promise.resolve(),
  ]);

  cache = { at: Date.now(), data };
  return res.status(200).json(data);
}
