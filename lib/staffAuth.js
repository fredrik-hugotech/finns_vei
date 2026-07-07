import crypto from 'crypto';
import { getStaffById, getStaffSession } from './supabaseRest';

// Self-contained staff accounts: scrypt password hashing + random session tokens
// stored in Supabase, delivered as an httpOnly cookie. No external auth service,
// no new dependency. The shared BACKOFFICE_SECRET keeps working in parallel.

const COOKIE = 'ff_staff';
export const SESSION_DAYS = 30;

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
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
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
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;
    const staff = await getStaffById(session.staff_id);
    if (!staff || staff.active === false) return null;
    return { id: staff.id, email: staff.email, name: staff.name || null, role: staff.role || 'staff' };
  } catch (_e) {
    return null;
  }
}
