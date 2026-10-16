/**
 * Provider-neutral feature gates owned at the AI Core boundary.
 *
 * 17/10/2026 — décision client : **la recherche produit passe par SerpApi, le
 * kachf (lecture de fiche) par Bright Data.** La recherche Web pilotée par un
 * modèle (Anthropic Web Search) n'est PLUS un chemin de recherche : elle est
 * DÉSACTIVÉE PAR DÉFAUT et ne repart que si un déploiement la réclame
 * explicitement (`AYROVIX_AI_WEB_SEARCH=true`).
 *
 * Raisons : chaque recherche Web facturée consommait du crédit Anthropic pour
 * produire des liens sans prix, alors que SerpApi Google Shopping rend un prix
 * actionnable. Le modèle reste utilisé pour COMPRENDRE (vision, rédaction),
 * pas pour CHERCHER.
 */
export type AiFeatureCapability = 'web-search';

export function isAiFeatureEnabled(capability: AiFeatureCapability): boolean {
  if (capability === 'web-search') {
    const configured = process.env.AYROVIX_AI_WEB_SEARCH
      ?? process.env.AYROVIX_ANTHROPIC_WEB_SEARCH;
    // Opt-in strict : absent, vide ou « false » → désactivé. Seul « true » rallume.
    return configured === 'true';
  }
  return false;
}
