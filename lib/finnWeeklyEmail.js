// HTML for Finn's weekly letter to staff (inline styles for email clients).
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildWeeklyEmail(doc, baseUrl) {
  const c = doc.content || {};
  const s = c.stats || {};
  const num = (label, value) => `<td style="padding:10px 12px;background:#f2f5f3;border-radius:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#14201c">${esc(value)}</div><div style="font-size:12px;color:#586a61">${esc(label)}</div></td>`;
  const focus = (c.focus || []).map((f, i) => `
    <tr><td style="padding:8px 0;border-top:1px solid #e2e8e4">
      <div style="font-weight:700;color:#14201c">${i + 1}. ${esc(f.title)}</div>
      <div style="color:#586a61;font-size:14px;margin-top:2px">${esc(f.why)}</div>
      ${baseUrl ? `<a href="${baseUrl}/backoffice/sak/${encodeURIComponent(f.case_id)}" style="color:#0d6b52;font-size:14px;font-weight:700;text-decoration:none">Åpne saken →</a>` : ''}
    </td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f2f5f3;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:24px 12px">
  <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e2e8e4">
    <tr><td style="padding:22px 24px 6px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#0d6b52">Ukesbrev fra Finn</div>
      <h1 style="margin:6px 0 8px;font-size:22px;line-height:1.3;color:#14201c">${esc(c.headline)}</h1>
      <p style="margin:0;color:#14201c;font-size:15px;line-height:1.55">${esc(c.summary)}</p>
    </td></tr>
    <tr><td style="padding:14px 24px"><table width="100%" cellpadding="0" cellspacing="6" role="presentation"><tr>
      ${num('nye denne uka', s.nye_i_perioden)}${num('åpne hastesaker', s.hastesaker_apne)}${num('raske gevinster', s.raske_gevinster_apne)}
    </tr></table></td></tr>
    <tr><td style="padding:4px 24px 8px"><div style="font-weight:800;color:#14201c;margin-bottom:4px">Ta disse først</div><table width="100%" cellpadding="0" cellspacing="0" role="presentation">${focus}</table></td></tr>
    ${c.tip ? `<tr><td style="padding:8px 24px 20px"><div style="background:#e8f3ef;border-radius:10px;padding:12px 14px;color:#0a5340;font-size:14px"><b>Finns råd:</b> ${esc(c.tip)}</div></td></tr>` : ''}
    ${baseUrl ? `<tr><td style="padding:0 24px 24px"><a href="${baseUrl}/backoffice/finn" style="display:inline-block;background:#0d6b52;color:#fff;padding:10px 16px;border-radius:999px;font-weight:700;text-decoration:none">Åpne Finn i backoffice</a></td></tr>` : ''}
  </table></td></tr></table></body></html>`;
  return { subject: `Finn: ${c.headline || 'ukesbrev'}`, html };
}
