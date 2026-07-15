// Builds the daily "nye saker"-summary email: subject + a tidy, self-contained
// HTML body (inline styles, since email clients ignore <style>/external CSS).

const GREEN = '#0d6b52';
const GREEN_DARK = '#0a5340';
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

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    return '';
  }
}

function reporterLabel(type) {
  return type === 'voksen' ? 'Voksen' : 'Barn';
}

function contactLine(report) {
  if (report.reporter_type !== 'voksen') return '';
  const parts = [report.contact_name, report.contact_email, report.contact_phone].filter(Boolean).map(esc);
  return parts.length ? `<div style="margin-top:6px;color:${MUTED};font-size:13px">Kontakt: ${parts.join(' · ')}</div>` : '';
}

function reportCard(report, baseUrl) {
  const publicUrl = baseUrl ? `${baseUrl}/sak/${encodeURIComponent(report.id)}` : '';
  const adminUrl = baseUrl ? `${baseUrl}/backoffice/sak/${encodeURIComponent(report.id)}` : '';
  const lat = Number(report.lat);
  const lng = Number(report.lng);
  const mapUrl = Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat.toFixed(5)},${lng.toFixed(5)}`
    : '';

  const links = [
    adminUrl ? `<a href="${adminUrl}" style="color:${GREEN};font-weight:700;text-decoration:none">Åpne i backoffice</a>` : '',
    publicUrl ? `<a href="${publicUrl}" style="color:${GREEN};text-decoration:none">Se saken</a>` : '',
    mapUrl ? `<a href="${mapUrl}" style="color:${GREEN};text-decoration:none">Kart</a>` : '',
  ].filter(Boolean).join('<span style="color:#c7d0ca"> &nbsp;·&nbsp; </span>');

  return `
    <tr>
      <td style="padding:0 0 12px 0">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px">
          <tr><td style="padding:14px 16px">
            <div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${GREEN}">${esc(report.category || 'Sak')}</div>
            <div style="margin-top:4px;font-size:16px;line-height:1.4;color:${INK}">${esc(report.description || '(ingen beskrivelse)')}</div>
            <div style="margin-top:8px;color:${MUTED};font-size:13px">${reporterLabel(report.reporter_type)} · ${esc(fmtTime(report.created_at))}${report.status ? ` · ${esc(report.status)}` : ''}</div>
            ${contactLine(report)}
            ${links ? `<div style="margin-top:10px;font-size:14px">${links}</div>` : ''}
          </td></tr>
        </table>
      </td>
    </tr>`;
}

export function buildDailySummaryEmail({ reports = [], baseUrl = '', dateLabel = '', windowHours = 24 } = {}) {
  const count = reports.length;
  const subject = count === 0
    ? `Finns Fairway – ingen nye saker siste ${windowHours} timer`
    : `Finns Fairway – ${count} ${count === 1 ? 'ny sak' : 'nye saker'} siste ${windowHours} timer`;

  const heading = count === 0
    ? 'Ingen nye saker det siste døgnet.'
    : `${count} ${count === 1 ? 'ny sak' : 'nye saker'} det siste døgnet`;

  const cards = reports.map((report) => reportCard(report, baseUrl)).join('');
  const listUrl = baseUrl ? `${baseUrl}/backoffice/liste` : '';

  const html = `<!doctype html>
<html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${PAPER};padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%">
        <tr><td style="padding:0 0 16px 0">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${GREEN};border-radius:14px">
            <tr><td style="padding:22px 20px">
              <div style="color:#eef5f0;font-size:14px;font-weight:700;letter-spacing:.02em">FINNS FAIRWAY</div>
              <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:6px">${esc(heading)}</div>
              ${dateLabel ? `<div style="color:#cfe3d9;font-size:13px;margin-top:4px">${esc(dateLabel)}</div>` : ''}
            </td></tr>
          </table>
        </td></tr>
        ${count === 0
          ? `<tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:20px;color:${MUTED};font-size:15px">Det kom ingen nye meldinger inn det siste døgnet. Vi sender en ny oppsummering i morgen.</td></tr>`
          : cards}
        <tr><td style="padding:8px 4px 0 4px;color:${MUTED};font-size:13px;line-height:1.5">
          ${listUrl ? `Se alle saker i <a href="${listUrl}" style="color:${GREEN};font-weight:700;text-decoration:none">backoffice</a>.<br>` : ''}
          Dette er en automatisk daglig oppsummering fra Finns Fairway. Meldinger fra barn er anonyme.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
