import { nvdbEnvStatus } from './nvdb';
import { trelloEnvStatus } from './trello';

export function serverEnvStatus() {
  return {
    hasNextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasMapboxToken: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
    ...trelloEnvStatus(),
    ...nvdbEnvStatus(),
    hasDebugSecret: Boolean(process.env.DEBUG_SECRET),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

export function isDebugAuthorized(req) {
  const configuredSecret = process.env.DEBUG_SECRET;
  const providedSecret = req.query?.secret || req.headers?.['x-debug-secret'];

  if (configuredSecret) return providedSecret === configuredSecret;
  return process.env.NODE_ENV !== 'production';
}
