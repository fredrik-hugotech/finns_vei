import { getReportsSince, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { buildDailySummaryEmail } from '../../../lib/dailySummaryEmail';
import { siteBaseUrl } from '../../../lib/reportWorkflow';

// Daily digest of new reports, emailed to the team. Triggered by a Vercel cron
// (see vercel.json). Until Slack is set up this is the notification channel.
// Env:
//   CRON_SECRET          protects the endpoint (Vercel sends it as a Bearer token)
//   RESEND_API_KEY       Resend API key (email transport)
//   SUMMARY_EMAIL_FROM   verified sender, e.g. "Finns Fairway <varsel@finnsfairway.no>"
//   SUMMARY_EMAIL_TO     recipient (default post@finnsfairway.no)
//   SUMMARY_WINDOW_HOURS lookback window (default 24)
//   SUMMARY_SEND_EMPTY   set to "1" to also send on days with no new cases
const WINDOW_HOURS = Number(process.env.SUMMARY_WINDOW_HOURS || 24);
const TO = process.env.SUMMARY_EMAIL_TO || 'post@finnsfairway.no';
const FROM = process.env.SUMMARY_EMAIL_FROM || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

function log(event, details = {}) {
  console.log(JSON.stringify({ scope: 'cron/daily-summary', event, ...details }));
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (e.g. local/dev)
  const header = req.headers.authorization || '';
  if (header === `Bearer ${secret}`) return true;
  // Manual trigger fallback: ?key=<secret>
  return req.query?.key === secret;
}

async function sendEmail({ subject, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json().catch(() => ({}));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  }
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!hasSupabaseConfig()) return res.status(200).json({ ok: true, skipped: 'no supabase config' });

  try {
    const sinceIso = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const reports = await getReportsSince(sinceIso);

    const dateLabel = new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
    const { subject, html } = buildDailySummaryEmail({
      reports,
      baseUrl: siteBaseUrl(),
      dateLabel: `Oppsummering ${dateLabel}`,
      windowHours: WINDOW_HOURS,
    });

    const sendEmpty = process.env.SUMMARY_SEND_EMPTY === '1';
    if (reports.length === 0 && !sendEmpty) {
      log('no_reports_skip');
      return res.status(200).json({ ok: true, count: 0, sent: false });
    }

    // Not configured to actually send yet — build succeeded, just no transport.
    if (!RESEND_API_KEY || !FROM) {
      log('email_not_configured', { count: reports.length, hasKey: Boolean(RESEND_API_KEY), hasFrom: Boolean(FROM) });
      return res.status(200).json({ ok: true, count: reports.length, sent: false, reason: 'email not configured' });
    }

    await sendEmail({ subject, html });
    log('sent', { count: reports.length, to: TO });
    return res.status(200).json({ ok: true, count: reports.length, sent: true });
  } catch (error) {
    log('failed', { message: String(error?.message || '').slice(0, 240) });
    return res.status(500).json({ error: 'Kunne ikke sende oppsummering' });
  }
}
