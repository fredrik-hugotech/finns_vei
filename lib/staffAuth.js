import crypto from 'crypto';
import { getStaffSession, deleteStaffSession } from './supabaseRest';

// Self-contained staff accounts: scrypt password hashing + random session tokens
// stored in Supabase, delivered as an httpOnly cookie. No external auth service,
// no new dependency. The shared BACKOFFICE_SECRET keeps working in parallel.

const COOKIE = 'ff_staff';
export const SESSION_DAYS = 30;

// Fixed, non-secret dummy hash in the same "scrypt$salt$hash" shape as a real
// stored password. Used to run an equivalent-cost verifyPassword() call on
// the "no such account" login path, so that path takes about as long as the
// "wrong password" path and doesn't leak account existence via timing.
export const DUMMY_PASSWORD_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, saltHex, hashHex] = String(stored || '').split('$');
    if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_e) {
    return false;
  }
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
}

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i <= 0) return;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Malformed percent-encoding in a cookie value — skip it rather than
      // letting decodeURIComponent's URIError propagate into a 500.
    }
  });
  return out;
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function sessionTokenFromRequest(req) {
  return parseCookies(req)[COOKIE] || null;
}

// Returns { id, email, name, role } for a valid, active session — or null.
export async function getStaffFromRequest(req) {
  const token = sessionTokenFromRequest(req);
  if (!token) return null;
  try {
    const session = await getStaffSession(token);
    if (!session || !session.staff_id) return null;
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      // Opportunistic cleanup: this row is already invalid, so removing it here
      // (rather than only on explicit logout) keeps staff_sessions from growing
      // unbounded with dead rows. Best-effort — never blocks the auth check.
      deleteStaffSession(token).catch(() => {});
      return null;
    }
    const staff = session.staff;
    if (!staff || staff.active === false) return null;
    return { id: staff.id, email: staff.email, name: staff.name || null, role: staff.role || 'staff' };
  } catch (_e) {
    return null;
  }
}
