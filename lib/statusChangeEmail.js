// Builds the opt-in "Følg saken" email: a short, single-case status-change
// notice, sent to a citizen who ticked "Send meg en e-post når status på
// saken endres" on the report form. Unlike lib/dailySummaryEmail.js (a list
// of many reports for staff), this is always exactly one case for one
// recipient — inline styles, same brand colours, same esc()/Norwegian-copy
// style, deliberately smaller.

import { reportStatusMeta } from './reportStatusMeta';

const GREEN = '#0d6b52';
const INK = '#14201c';
const MUTED = '#586a61';
const BORDER = '#e2e8e4';
const PAPER = '#f2f5f3';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildCaseStatusEmail({ report = {}, status = null, note = null, baseUrl = '' } = {}) {
  const meta = reportStatusMeta(status || report.status);
  const category = report.category || 'saken din';
  const caseUrl = baseUrl && report.id ? `${baseUrl}/sak/${encodeURIComponent(report.id)}` : '';
  const cleanNote = typeof note === 'string' ? note.trim() : '';

  const subject = `Finns Fairway – status oppdatert: ${meta.label}`;

  const html = `<!doctype html>
<html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${PAPER};padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;width:100%">
        <tr><td style="padding:0 0 16px 0">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${GREEN};border-radius:14px">
            <tr><td style="padding:20px 20px">
              <div style="color:#eef5f0;font-size:14px;font-weight:700;letter-spacing:.02em">FINNS FAIRWAY</div>
              <div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:6px">Status oppdatert på saken din</div>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:16px 16px">
          <div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${GREEN}">${esc(category)}</div>
          <div style="margin-top:6px;font-size:18px;font-weight:800;color:${INK}">Ny status: ${esc(meta.label)}</div>
          ${cleanNote ? `<div style="margin-top:12px;color:${INK};font-size:15px;line-height:1.5;background:${PAPER};border-radius:8px;padding:12px">${esc(cleanNote)}</div>` : ''}
          ${caseUrl ? `<div style="margin-top:16px"><a href="${caseUrl}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;font-size:14px">Se saken</a></div>` : ''}
        </td></tr>
        <tr><td style="padding:10px 4px 0 4px;color:${MUTED};font-size:12px;line-height:1.5">
          Du får denne e-posten fordi du krysset av for varsel om statusendring da du meldte fra om saken.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
