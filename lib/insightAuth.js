import crypto from 'crypto';
import { getStaffFromRequest } from './staffAuth';
import { insightSessionValid } from './supabaseRest';

// Access to /innsikt: any logged-in staff member, or anyone holding the
// shared dashboard password (session cookie set after a correct password).
export const INSIGHT_COOKIE = 'ff_innsikt';
export const INSIGHT_DAYS = 30;
export const INSIGHT_PASSWORD_KEY = 'dashboard_password_hash';

function cookieValue(req, name) {
  const header = req.headers?.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function newInsightToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function setInsightCookie(res, token) {
  res.setHeader('Set-Cookie', `${INSIGHT_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${INSIGHT_DAYS * 86400}`);
}

export async function insightAccess(req) {
  const staff = await getStaffFromRequest(req);
  if (staff) return { ok: true, staff };
  try {
    if (await insightSessionValid(cookieValue(req, INSIGHT_COOKIE))) return { ok: true, staff: null };
  } catch (_e) { /* fall through */ }
  return { ok: false, staff: null };
}
