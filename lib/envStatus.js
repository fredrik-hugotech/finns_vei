import { nvdbEnvStatus } from './nvdb';
import { trelloEnvStatus } from './trello';
import { backofficeEnvStatus } from './backofficeAuth';

export function serverEnvStatus() {
  return {
    hasNextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasMapboxToken: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
    ...trelloEnvStatus(),
    ...nvdbEnvStatus(),
    hasDebugSecret: Boolean(process.env.DEBUG_SECRET),
    ...backofficeEnvStatus(),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

export function isDebugAuthorized(req) {
  const configuredSecret = process.env.DEBUG_SECRET;
  const providedSecret = req.query?.secret || req.headers?.['x-debug-secret'];

  if (configuredSecret) return providedSecret === configuredSecret;
  // Only permissive for local `next dev` — any other NODE_ENV value (including
  // unset, staging, preview, etc.) must default to deny when no secret is set.
  return process.env.NODE_ENV === 'development';
}
