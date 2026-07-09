import crypto from 'crypto';
import { getStaffFromRequest } from './staffAuth';

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// A request is admin if it carries the shared secret (legacy/bootstrap) OR a
// valid staff session cookie (email/password login). Both keep working.
export async function isAdminRequest(req) {
  if (isBackofficeAuthorized(req)) return true;
  const staff = await getStaffFromRequest(req);
  return Boolean(staff);
}

export function isBackofficeAuthorized(req) {
  const configuredSecret = process.env.BACKOFFICE_SECRET || process.env.DEBUG_SECRET;
  const providedSecret = req.query?.secret || req.headers?.['x-backoffice-secret'] || req.headers?.['x-debug-secret'];

  if (configuredSecret) return timingSafeEqualStrings(providedSecret, configuredSecret);
  // Only permissive for local `next dev` — any other NODE_ENV value (including
  // unset, staging, preview, etc.) must default to deny when no secret is set.
  return process.env.NODE_ENV === 'development';
}

export function backofficeEnvStatus() {
  return {
    hasBackofficeSecret: Boolean(process.env.BACKOFFICE_SECRET),
    hasDebugSecret: Boolean(process.env.DEBUG_SECRET),
    backofficeAiEnabled: process.env.BACKOFFICE_AI_ENABLED === 'true',
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    backofficeAiModel: process.env.BACKOFFICE_AI_MODEL || 'gpt-5.2-mini',
    backofficeAiMaxComments: Number(process.env.BACKOFFICE_AI_MAX_COMMENTS || 8),
    hasBackofficeAiDailyLimit: Boolean(process.env.BACKOFFICE_AI_DAILY_LIMIT),
    backofficeAiRequireApproval: process.env.BACKOFFICE_AI_REQUIRE_APPROVAL !== 'false',
  };
}
