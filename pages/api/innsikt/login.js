import { verifyPassword, DUMMY_PASSWORD_HASH } from '../../../lib/staffAuth';
import { INSIGHT_DAYS, INSIGHT_PASSWORD_KEY, newInsightToken, setInsightCookie } from '../../../lib/insightAuth';
import { createInsightSession, getInsightSetting, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Shared password for the Finns.Fairway insight dashboard. Rate limited like
// staff login: guessing is slow, a correct password gives a 30-day session.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end(); }
  const rl = checkRequestRateLimit(req, 'innsikt-login', 8, 10 * 60 * 1000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Ikke tilgjengelig' });
  const password = String(req.body?.password || '');
  const stored = await getInsightSetting(INSIGHT_PASSWORD_KEY).catch(() => null);
  // Same work whether or not a password is set, so timing reveals nothing.
  const ok = verifyPassword(password, stored || DUMMY_PASSWORD_HASH) && Boolean(stored);
  if (!ok) return res.status(401).json({ error: 'Feil passord.' });
  const token = newInsightToken();
  await createInsightSession(token, new Date(Date.now() + INSIGHT_DAYS * 86400000).toISOString());
  setInsightCookie(res, token);
  return res.status(200).json({ ok: true });
}
