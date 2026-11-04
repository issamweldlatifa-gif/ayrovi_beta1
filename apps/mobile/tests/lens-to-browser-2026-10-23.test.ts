/**
 * Lens → navigateur AYWEBs — règle du 28/10/2026 (elle durcit celle du 23/10).
 *
 * Ce que le client a dit : « بطاقات هذه مهما كان مدخل البحث — لينك ولا كلمة —
 * مسارها AYWEBs، وأي حاجة قديمة تمنع هذا تتحيّد كامل ».
 *
 * Conséquence : il n'existe plus QU'UNE destination. La grande fiche Lens
 * (repli du catalogue et des adresses refusées) est supprimée du parcours :
 * un appui de carte ouvre la page du marchand dans AYWEBs, ou n'ouvre rien.
 *
 * Le fichier verrouille la fonction pure ET le fait que l'écran l'applique —
 * un test de texte, parce que la route est choisie dans un gestionnaire
 * d'événement, pas dans un rendu.
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

describe('lensOpenDecision — une carte, une destination : AYWEBs', () => {
  it('une carte externe ouvre la page marchande dans AYWEBs, à l’adresse exacte', () => {
    const url = 'https://www.zalando.fr/baskets-homme-12345678.html';
    const decision = lensOpenDecision({ sourceUrl: url, source: 'Zalando' });
    expect(decision.screen).toBe('browser');
    if (decision.screen !== 'browser') return;
    expect(decision.target.pathname).toBe('/aywebs/browser');
    expect(decision.target.params.url).toBe(url);
    expect(decision.target.params.storeName).toBe('Zalando');
    /* Aucun droit de capture promis AVANT le verdict du serveur. */
    expect(decision.target.params.capture).toBe('0');
  });

  it('le DTO PRODUCT parsé garde l’URL et ses identifiants de variante jusqu’à AYWEBs', () => {
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

  it('le CATALOGUE ouvre AYWEBs aussi — plus de fiche interne', () => {
    const decision = lensOpenDecision({ sourceUrl: 'https://www.nike.com/fr/t/air-max-90', source: 'Collection ZAYROVI' });
    expect(decision.screen).toBe('browser');
    if (decision.screen === 'browser') {
      expect(decision.target.pathname).toBe('/aywebs/browser');
    }
  });

  it('une adresse http est PROMUE en https, jamais renvoyée vers une autre page', () => {
    const decision = lensOpenDecision({ sourceUrl: 'http://exemple.tn/p/1', source: 'Boutique' });
    expect(decision.screen).toBe('browser');
    if (decision.screen === 'browser') expect(decision.target.params.url).toBe('https://exemple.tn/p/1');
  });

  it('une adresse qui n’est pas une page web n’ouvre RIEN (jamais autre chose)', () => {
    expect(lensOpenDecision({ sourceUrl: 'javascript:alert(1)', source: 'Boutique' }).screen).toBe('blocked');
    expect(lensOpenDecision({ sourceUrl: '', source: 'Boutique' }).screen).toBe('blocked');
    expect(lensOpenDecision({ sourceUrl: 'market://details?id=com.amazon', source: 'Boutique' }).screen).toBe('blocked');
  });

  it('déplie une redirection Google vers la vraie fiche marchande et bloque Google Shopping', () => {
    const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Fwww.zalando.fr%2Fbaskets-123.html&sa=U';
    const unwrapped = lensOpenDecision({ sourceUrl: wrapped, source: 'Zalando' });
    expect(unwrapped.screen).toBe('browser');
    if (unwrapped.screen === 'browser') {
      expect(unwrapped.target.params.url).toBe('https://www.zalando.fr/baskets-123.html');
    }
    expect(lensOpenDecision({ sourceUrl: 'https://www.google.com/shopping/product/12345?gl=fr', source: 'Google' }).screen)
      .toBe('blocked');
  });

  it('le type de décision ne connaît plus d’écran « fiche »', () => {
    const source = read('src/features/lens/lensOpen.ts');
    expect(source.includes("screen: 'product'")).toBe(false);
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

  it('promue http en https, refuse les schémas inconnus et le vide', () => {
    expect(productEntryTarget('http://www.amazon.com/dp/B0ABC12345')?.params.url)
      .toBe('https://www.amazon.com/dp/B0ABC12345');
    expect(productEntryTarget('market://details?id=com.amazon')).toBeNull();
    expect(productEntryTarget('   ')).toBeNull();
  });

  it('borne le nom de boutique sans toucher au lien', () => {
    const target = productEntryTarget('https://boutique.tn/p/9', 'x'.repeat(200));
    expect(target?.params.storeName).toHaveLength(80);
    expect(target?.params.url).toBe('https://boutique.tn/p/9');
  });
});

describe('l’écran Lens applique la règle, et a perdu l’ancien chemin', () => {
  const lens = read('app/lens.tsx');

  it('la carte passe par lensOpenDecision et pousse le navigateur', () => {
    expect(lens).toContain('lensOpenDecision(candidate)');
    expect(lens).toContain('router.push(decision.target)');
  });

  it('les correspondances visuelles suivent la même règle', () => {
    expect(lens).toContain('const decision = lensOpenDecision({');
  });

  it('plus de fiche Lens : ni étape « product », ni vue produit, ni enrichissement', () => {
    expect(lens.includes("kind: 'product'")).toBe(false);
    expect(lens.includes('LensProductView')).toBe(false);
    expect(lens.includes('openProduct')).toBe(false);
    expect(lens.includes('mergeLensProduct')).toBe(false);
  });
});
