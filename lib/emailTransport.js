// Shared Resend transport for the two email notifications this app sends
// (the daily new-reports digest, lib/dailySummaryEmail.js; and the instant
// per-report email, buildNewReportEmail in the same file) — one place that
// knows how to actually send, so both stay consistent and neither
// hand-rolls its own fetch-to-Resend call.
//
// Env:
//   RESEND_API_KEY       Resend API key
//   SUMMARY_EMAIL_FROM   verified sender, e.g. "Finns Fairway <varsel@finnsfairway.no>"
//   SUMMARY_EMAIL_TO     recipient (default post@finnsfairway.no)
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.SUMMARY_EMAIL_FROM || '';
const TO = process.env.SUMMARY_EMAIL_TO || 'post@finnsfairway.no';

export function emailTransportConfigured() {
  return Boolean(RESEND_API_KEY && FROM);
}

// Returns { sent: false, reason } instead of throwing when transport isn't
// configured — that's an expected, silent no-op state (matches how the
// daily digest already behaved before this was extracted), not an error.
// A configured send that actually fails against Resend still throws, so
// callers can log/handle that distinctly.
export async function sendNotificationEmail({ subject, html }) {
  if (!emailTransportConfigured()) {
    return { sent: false, reason: 'email not configured' };
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${body.slice(0, 200)}`);
  }
  const result = await response.json().catch(() => ({}));
  return { sent: true, to: TO, result };
}
