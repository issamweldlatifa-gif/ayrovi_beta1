/**
 * POLITIQUE DE FOURNISSEURS (17/10/2026 — décision client) :
 *
 *   • **Recherche produit = SerpApi** (Google Shopping rend un prix actionnable).
 *   • **Kachf (lecture de fiche) = Bright Data** (aucune lecture directe).
 *   • **Anthropic ne fait PLUS de recherche** : le modèle COMPREND (vision,
 *     rédaction), il ne CHERCHE pas. Le repli « Web Search du modèle » est
 *     désactivé par défaut et ne repart que sur opt-in explicite du déploiement.
 *
 * Ces verrous existent pour qu'un réglage d'environnement ou un « petit repli
 * pratique » ne réintroduise pas une recherche facturée sans prix.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { isAiFeatureEnabled } from '../src/ai-core/config';
import { checkProviderSearchHealth } from '../src/ayrovix/services/search';

const source = (relative: string) => readFileSync(relative, 'utf8');

describe('recherche : SerpApi, pas Anthropic', () => {
  afterEach(() => {
    delete process.env.AYROVIX_AI_WEB_SEARCH;
    delete process.env.AYROVIX_ANTHROPIC_WEB_SEARCH;
  });

  it('la recherche Web du modèle est un opt-in strict : seul « true » l’allume', () => {
    delete process.env.AYROVIX_AI_WEB_SEARCH;
    delete process.env.AYROVIX_ANTHROPIC_WEB_SEARCH;
    expect(isAiFeatureEnabled('web-search')).toBe(false); // absent

    for (const value of ['false', '', '0', 'no', 'FALSE']) {
      process.env.AYROVIX_AI_WEB_SEARCH = value;
      expect(isAiFeatureEnabled('web-search'), `AYROVIX_AI_WEB_SEARCH=${value}`).toBe(false);
    }

    process.env.AYROVIX_AI_WEB_SEARCH = 'true';
    expect(isAiFeatureEnabled('web-search')).toBe(true);
  });

  it('l’ancien alias Anthropic est honoré, mais jamais activé par défaut', () => {
    delete process.env.AYROVIX_AI_WEB_SEARCH;
    process.env.AYROVIX_ANTHROPIC_WEB_SEARCH = 'true';
    expect(isAiFeatureEnabled('web-search')).toBe(true);
    process.env.AYROVIX_ANTHROPIC_WEB_SEARCH = 'false';
    expect(isAiFeatureEnabled('web-search')).toBe(false);
  });

  it('la santé administrateur annonce SerpApi et ne compte plus le modèle dans le budget', () => {
    delete process.env.AYROVIX_AI_WEB_SEARCH; // désactivé par défaut
    const health = checkProviderSearchHealth();
    // Sans clé SerpApi dans l'environnement de test : rien n'est configuré.
    expect(health.aiCoreConfigured).toBe(false);
    expect(health.maxUsesPerQuery).toBe(Number(health.serpApiConfigured));
    if (health.serpApiConfigured) expect(health.primary).toBe('serpapi-google-shopping');
  });

  it('la passerelle de recherche externe est SerpApi et rien d’autre', () => {
    const search = source('src/ayrovix/services/search.ts');
    expect(search).toMatch(/function externalWebSearchEnabled\(\): boolean \{\s*return serpApiShoppingEnabled\(\);/);
    // Le repli modèle reste câblé, mais derrière l'opt-in explicite.
    expect(search).toContain('if (!aiCoreWebSearchEnabled())');
    expect(search).toContain('serpApiShoppingSearch(');
  });
});

describe('kachf : Bright Data et rien d’autre', () => {
  it('le scraper ne lit plus aucune fiche en direct', () => {
    const scraper = source('src/scraper/scraper.ts');
    expect(scraper).toContain("provider: 'brightdata'");
    expect(scraper).toContain('fetchBrightDataHtml(');
    expect(scraper).not.toContain('r.jina.ai');
    // L'union des fournisseurs ne contient plus `direct` : sans Bright Data il
    // n'y a aucune lecture réseau du tout (BRIGHTDATA_NOT_CONFIGURED).
    expect(scraper).not.toMatch(/provider: '(?:[^']*\bdirect\b[^']*)'/);
    expect(scraper).toContain("failureCode: 'BRIGHTDATA_NOT_CONFIGURED'");
    // Le point d'entrée de lecture n'émet lui-même aucun appel réseau.
    const entry = scraper.slice(
      scraper.indexOf('private async scrapeWithHttp'),
      scraper.indexOf('private async readViaBrightData'),
    );
    expect(entry).toContain('readViaBrightData(');
    expect(entry).not.toContain('fetch(');
    expect(entry).not.toContain('fetchSafeRemote(');
  });

  it('la console d’administration montre le fournisseur de kachf', () => {
    const admin = source('src/admin/routes.ts');
    expect(admin).toContain("provider: 'brightdata'");
    expect(admin).toContain('brightDataReady()');
  });
});
