export type AiFeatureCapability = 'web-search';

/**
 * Provider-neutral feature gates owned at the AI Core boundary. The legacy
 * environment alias is read only here so existing deployments remain safe
 * while business services no longer depend on a provider name.
 */
export function isAiFeatureEnabled(capability: AiFeatureCapability): boolean {
  if (capability === 'web-search') {
    const configured = process.env.AYROVIX_AI_WEB_SEARCH
      ?? process.env.AYROVIX_ANTHROPIC_WEB_SEARCH;
    return configured !== 'false';
  }
  return false;
}
