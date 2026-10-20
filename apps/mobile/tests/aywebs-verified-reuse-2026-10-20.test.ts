/**
 * AYWEBs — fiche vérifiée au chargement, réutilisée à « Add » (20/10/2026).
 *  • même URL et moins de 10 min ⇒ la feuille s'ouvre sans appel serveur ;
 *  • 10 min ou plus ⇒ on relance la vérification (la facture serveur expire) ;
 *  • autre URL, ou rien de vérifié ⇒ jamais réutilisé.
 */
import { describe, expect, it } from 'vitest';

import { AYWEBS_VERIFIED_REUSE_MS, canReuseVerified } from '@/features/aywebs/captureFlow';

const URL_A = 'https://www.amazon.com/dp/B0000224VM';
const URL_B = 'https://www.amazon.com/dp/B00008I8YM';

describe('fiche vérifiée à l\'ouverture', () => {
  it('fenêtre = 10 minutes (validité de la facture serveur par défaut)', () => {
    expect(AYWEBS_VERIFIED_REUSE_MS).toBe(10 * 60_000);
  });

  it('même URL, vérifiée il y a 1 min ⇒ réutilisable', () => {
    const now = 1_000_000;
    expect(canReuseVerified({ url: URL_A, at: now - 60_000 }, URL_A, now)).toBe(true);
  });

  it('vérifiée il y a 10 min ou plus ⇒ pas réutilisable (relance)', () => {
    const now = 1_000_000;
    expect(canReuseVerified({ url: URL_A, at: now - AYWEBS_VERIFIED_REUSE_MS }, URL_A, now)).toBe(false);
    expect(canReuseVerified({ url: URL_A, at: now - AYWEBS_VERIFIED_REUSE_MS - 1 }, URL_A, now)).toBe(false);
  });

  it('autre URL ⇒ jamais réutilisé', () => {
    const now = 1_000_000;
    expect(canReuseVerified({ url: URL_B, at: now - 1_000 }, URL_A, now)).toBe(false);
  });

  it('rien de vérifié ⇒ pas réutilisable', () => {
    expect(canReuseVerified(null, URL_A, 1_000_000)).toBe(false);
    expect(canReuseVerified(undefined, URL_A, 1_000_000)).toBe(false);
  });

  it('horloge en retard (at dans le futur) ⇒ pas réutilisable', () => {
    const now = 1_000_000;
    expect(canReuseVerified({ url: URL_A, at: now + 5_000 }, URL_A, now)).toBe(false);
  });
});
