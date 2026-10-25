/**
 * Lens → navigateur AYWEBs (règle unique, durcie le 25/10/2026).
 *
 * Ce que le client a imposé : QUELLE QUE SOIT l'entrée (texte, lien, image,
 * photo, QR), toute carte résultat ouvre la page marchande DANS le navigateur
 * intégré AYWEBs. Il est interdit qu'une carte emmène vers une autre fiche
 * interne : la décision ne peut plus jamais valoir `product`. Une carte sans
 * lien marchand ouvrable est `blocked` (aucune navigation, message honnête).
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
import { parseCandidate } from '@/api/lens';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.join(here, '..', relative), 'utf8');

describe('lensOpenDecision — toute carte ouvre AYWEBs, jamais une autre fiche', () => {
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

  it('le DTO PRODUCT parsé garde l’URL et ses identifiants de variante jusqu’à AYWEBS', () => {
    const url = 'https://www.temu.com/goods.html?goods_id=123456789&sku_id=98765';
    const card = parseCandidate({
      id: 'lens-product', kind: 'external', title: 'Produit', source: 'TEMU', sourceUrl: url,
      productPageType: 'PRODUCT', productLinkStatus: 'VERIFIED', priceVerificationStatus: 'PENDING_MANUAL',
    });
    const decision = lensOpenDecision(card);
    expect(decision.screen).toBe('browser');
    if (decision.screen === 'browser') expect(decision.target.params.url).toBe(url);
    expect(card.priceVerificationStatus).toBe('PENDING_MANUAL');
  });

  it('une carte CATALOGUE pourvue d’un lien marchand ouvre aussi le navigateur (plus de fiche interne)', () => {
    const url = 'https://www.shein.com/Robe-ete-p-1234567.html';
    const decision = lensOpenDecision({ kind: 'catalog', sourceUrl: url, source: 'SHEIN' });
    expect(decision.screen).toBe('browser');
    if (decision.screen === 'browser') expect(decision.target.params.url).toBe(url);
  });

  it('la décision ne peut plus jamais renvoyer vers une fiche interne', () => {
    const cases = [
      { kind: 'catalog' as const, sourceUrl: 'https://amazon.fr/dp/B0ABC', source: 'Amazon' },
      { kind: 'external' as const, sourceUrl: 'https://amazon.fr/dp/B0ABC', source: 'Amazon' },
    ];
    for (const candidate of cases) {
      expect(lensOpenDecision(candidate).screen).not.toBe('product');
    }
  });

  it('une adresse que le navigateur refuserait est bloquée, jamais renvoyée vers un autre écran', () => {
    const blocked = [
      { kind: 'external' as const, sourceUrl: 'http://exemple.tn/p/1', source: 'Boutique' },
      { kind: 'external' as const, sourceUrl: 'javascript:alert(1)', source: 'Boutique' },
      { kind: 'catalog' as const, sourceUrl: '', source: 'Collection ZAYROVI' },
    ];
    for (const candidate of blocked) {
      const decision = lensOpenDecision(candidate);
      expect(decision.screen).toBe('blocked');
      if (decision.screen === 'blocked') expect(decision.reason).toBe('NO_MERCHANT_URL');
    }
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

describe('l’écran Lens applique la règle unique', () => {
  const lens = read('app/lens.tsx');

  it('la carte passe par lensOpenDecision et pousse le navigateur', () => {
    expect(lens).toContain('lensOpenDecision(candidate)');
    expect(lens).toContain("router.push(decision.target)");
  });

  it('les correspondances visuelles suivent la même règle', () => {
    expect(lens).toContain('const decision = lensOpenDecision(candidate);');
  });

  it('aucune carte ne route plus vers la grande fiche interne', () => {
    expect(lens).not.toContain("setStage({ kind: 'product'");
    expect(lens).not.toContain('LensProductView');
  });

  it('un lien non ouvrable affiche un message honnête au lieu de naviguer', () => {
    expect(lens).toContain("showTip('lens.openUnavailable')");
  });
});
