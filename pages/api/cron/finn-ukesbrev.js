import { aiConfigured } from '../../../lib/aiAssist';
import { generateBrief } from '../../../lib/finnJobs';
import { buildWeeklyEmail } from '../../../lib/finnWeeklyEmail';
import { emailTransportConfigured, sendNotificationEmail } from '../../../lib/emailTransport';
import { siteBaseUrl } from '../../../lib/reportWorkflow';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { timingSafeEqualStrings } from '../../../lib/timingSafeEqualStrings';
import { hasSupabaseConfig } from '../../../lib/supabaseRest';

// Finn's weekly letter to staff (Monday morning, see vercel.json). Same
// recipient as the daily digest (SUMMARY_EMAIL_TO). Staff can also send it
// from /backoffice/finn.
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  const rl = checkRequestRateLimit(req, 'cron-finn-ukesbrev', 10, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' });
  const secret = process.env.CRON_SECRET;
  const cronOk = secret && timingSafeEqualStrings(req.headers.authorization || '', `Bearer ${secret}`);
  if (!cronOk && !(await isAdminRequest(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (!hasSupabaseConfig()) return res.status(200).json({ ok: true, skipped: 'no supabase' });
  if (!aiConfigured()) return res.status(200).json({ ok: false, reason: 'ANTHROPIC_API_KEY mangler' });
  try {
    const doc = await generateBrief({ period: 'uke', by: cronOk ? 'cron' : 'stab' });
    if (!emailTransportConfigured()) return res.status(200).json({ ok: true, sent: false, reason: 'E-post er ikke satt opp (RESEND_API_KEY/SUMMARY_EMAIL_FROM)', doc });
    const { subject, html } = buildWeeklyEmail(doc, siteBaseUrl());
    const result = await sendNotificationEmail({ subject, html });
    return res.status(200).json({ ok: true, sent: true, to: result.to, doc });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'cron/finn-ukesbrev', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Kunne ikke lage ukesbrev' });
  }
}
