/**
 * Lens → navigateur AYWEBs (23/10/2026, décision du propriétaire).
 *
 * Ce que le client a dit, mot pour mot : la petite carte porte déjà le lien du
 * marchand ; l'appui doit ouvrir **cette page dans le navigateur intégré**, pas
 * une grande fiche. La grande fiche reste pour la vente INTERNE (catalogue).
 *
 * Ce fichier verrouille la décision (fonction pure) et le fait que l'écran
 * l'applique — un test de texte, parce que la route est choisie dans un
 * gestionnaire d'événement, pas dans un rendu.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { lensOpenDecision } from '@/features/lens/lensOpen';
import { productEntryTarget } from '@/features/aywebs/storeEntry';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.join(here, '..', relative), 'utf8');

describe('lensOpenDecision — vente externe = navigateur, vente interne = fiche', () => {
  it('une carte externe ouvre la page marchande dans le navigateur, à l’adresse exacte', () => {
    const url = 'https://www.zalando.fr/baskets-homme-12345678.html';
    const decision = lensOpenDecision({ kind: 'external', sourceUrl: url, source: 'Zalando' });
    expect(decision.screen).toBe('browser');
    if (decision.screen !== 'browser') return;
    expect(decision.target.pathname).toBe('/aywebs/browser');
    expect(decision.target.params.url).toBe(url);
    expect(decision.target.params.storeName).toBe('Zalando');
    /* Aucun droit de capture promis AVANT le verdict du serveur. */
    expect(decision.target.params.capture).toBe('0');
  });

  it('une carte du catalogue ZAYROVI garde la fiche interne', () => {
    expect(lensOpenDecision({ kind: 'catalog', sourceUrl: 'https://ayrovi.tn/p/123', source: 'Collection ZAYROVI' })
      .screen).toBe('product');
  });

  it('une adresse que le navigateur refuserait retombe sur la fiche (jamais un écran cassé)', () => {
    expect(lensOpenDecision({ kind: 'external', sourceUrl: 'http://exemple.tn/p/1', source: 'Boutique' }).screen)
      .toBe('product');
    expect(lensOpenDecision({ kind: 'external', sourceUrl: 'javascript:alert(1)', source: 'Boutique' }).screen)
      .toBe('product');
    expect(lensOpenDecision({ kind: 'external', sourceUrl: '', source: 'Boutique' }).screen).toBe('product');
  });
});

describe('productEntryTarget — entrée produit du navigateur', () => {
  it('accepte une fiche HTTPS et ne réécrit pas l’adresse', () => {
    const url = 'https://www.amazon.com/dp/B0ABC12345/ref=sr_1_1?th=1';
    expect(productEntryTarget(url, 'Amazon')).toEqual({
      pathname: '/aywebs/browser',
      params: { url, storeName: 'Amazon', capture: '0' },
    });
  });

  it('refuse http, les schémas inconnus et le vide', () => {
    expect(productEntryTarget('http://www.amazon.com/dp/B0ABC12345')).toBeNull();
    expect(productEntryTarget('market://details?id=com.amazon')).toBeNull();
    expect(productEntryTarget('   ')).toBeNull();
  });

  it('borne le nom de boutique sans toucher au lien', () => {
    const target = productEntryTarget('https://boutique.tn/p/9', 'x'.repeat(200));
    expect(target?.params.storeName).toHaveLength(80);
    expect(target?.params.url).toBe('https://boutique.tn/p/9');
  });
});

describe('l’écran Lens applique la décision', () => {
  const lens = read('app/lens.tsx');

  it('la carte passe par lensOpenDecision et pousse le navigateur', () => {
    expect(lens).toContain('lensOpenDecision(candidate)');
    expect(lens).toContain("router.push(decision.target)");
  });

  it('les correspondances visuelles suivent la même règle', () => {
    expect(lens).toContain('const decision = lensOpenDecision(candidate);');
  });
});
