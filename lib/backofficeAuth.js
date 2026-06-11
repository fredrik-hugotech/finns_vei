export function isBackofficeAuthorized(req) {
  const configuredSecret = process.env.BACKOFFICE_SECRET || process.env.DEBUG_SECRET;
  const providedSecret = req.query?.secret || req.headers?.['x-backoffice-secret'] || req.headers?.['x-debug-secret'];

  if (configuredSecret) return providedSecret === configuredSecret;
  return process.env.NODE_ENV !== 'production';
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
