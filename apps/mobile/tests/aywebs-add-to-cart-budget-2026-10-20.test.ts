/**
 * AYWEBs — bouton « Add to Cart » : délai de 7 secondes (20/10/2026).
 *
 *  • page lue à temps ⇒ UNE résolution serveur AVEC la lecture, puis la feuille ;
 *  • page non lue à temps ⇒ refus `CAPTURE_INCOMPLETE` qui nomme titre et prix,
 *    SANS aucune lecture serveur de repli, et la lecture en cours est arrêtée ;
 *  • lecture en erreur ⇒ même refus immédiat ;
 *  • annulation (écran fermé, nouvel appui) ⇒ on propage, rien n'est ouvert ;
 *  • sans délai, l'ancien chemin (repli serveur) reste inchangé.
 */
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/errors';
import type { AyWebsResolveOutcome } from '@/api/aywebs';
import { AYWEBS_ADD_TO_CART_BUDGET_MS, AYWEBS_PREFETCH_MAX_AGE_MS, canReusePrefetch, resolveAddToCart } from '@/features/aywebs/captureFlow';

const CAPTURE = { v: 1, priceCandidates: [{ text: '$109.00', source: 'dom' }] };

function verifiedOutcome(): AyWebsResolveOutcome {
  return {
    product: {
      productId: 'aywprd_1', storeId: 'amazon', storeName: 'Amazon', sourceUrl: '', sourceDomain: 'amazon.com',
      title: 'Tablette', brand: '', images: [], price: 109, currency: 'USD',
      priceVerified: true, currencyVerified: true,
    } as unknown as AyWebsResolveOutcome['product'],
    capture: null,
    priceRejection: null,
    missing: [],
    quoteToken: 'quote-1',
  } as AyWebsResolveOutcome;
}

describe('délai de 7 secondes', () => {
  it('le délai retenu est 7 000 ms', () => {
    expect(AYWEBS_ADD_TO_CART_BUDGET_MS).toBe(7_000);
  });

  it('page lue à temps ⇒ une résolution AVEC la lecture, puis la feuille', async () => {
    const resolve = vi.fn(async () => verifiedOutcome());
    const result = await resolveAddToCart({
      readCapture: async () => CAPTURE,
      resolve,
      budgetMs: 1_000,
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(CAPTURE);
    expect(result.decision.kind).toBe('sheet');
    expect(result.outcome).toBeDefined();
  });

  it('page qui ne répond pas ⇒ refus immédiat, sans lecture serveur, et arrêt de la lecture', async () => {
    vi.useFakeTimers();
    try {
      const resolve = vi.fn(async () => verifiedOutcome());
      const onBudgetExceeded = vi.fn();
      const pending = resolveAddToCart({
        readCapture: () => new Promise<unknown>(() => undefined),
        resolve,
        budgetMs: 7_000,
        onBudgetExceeded,
      });
      await vi.advanceTimersByTimeAsync(7_000);
      const result = await pending;
      expect(result.decision.kind).toBe('refused');
      if (result.decision.kind === 'refused') {
        expect(result.decision.error.code).toBe('CAPTURE_INCOMPLETE');
        expect(result.decision.error.missingFields).toEqual(['title', 'price']);
      }
      expect(resolve).not.toHaveBeenCalled();
      expect(result.outcome).toBeUndefined();
      expect(onBudgetExceeded).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lecture en erreur ⇒ refus immédiat, sans lecture serveur de repli', async () => {
    const resolve = vi.fn(async () => verifiedOutcome());
    const result = await resolveAddToCart({
      readCapture: async () => { throw new ApiError('http', 'script'); },
      resolve,
      budgetMs: 7_000,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(result.decision.kind).toBe('refused');
    if (result.decision.kind === 'refused') expect(result.decision.error.code).toBe('CAPTURE_INCOMPLETE');
  });

  it('annulation pendant la lecture ⇒ on propage, rien n\'est ouvert', async () => {
    const controller = new AbortController();
    const resolve = vi.fn(async () => verifiedOutcome());
    const pending = resolveAddToCart({
      readCapture: () => new Promise<unknown>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new ApiError('aborted', 'Requête interrompue.')));
      }),
      resolve,
      signal: controller.signal,
      budgetMs: 7_000,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('sans délai, le repli serveur reste disponible (ancien chemin)', async () => {
    const resolve = vi.fn(async (capture: unknown) => {
      if (capture === undefined) return verifiedOutcome();
      throw new ApiError('network', 'offline');
    });
    const result = await resolveAddToCart({ readCapture: async () => CAPTURE, resolve });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(result.decision.kind).toBe('sheet');
  });
});

describe('lecture à l\'ouverture de la page (réutilisée au clic)', () => {
  const URL_A = 'https://www.amazon.com/dp/B0GYM3V9H5';
  const URL_B = 'https://www.amazon.com/dp/B0OTHER001';
  const NOW = 1_000_000;

  it('lecture en cours pour cette page ⇒ on attend la même (pas de seconde lecture)', () => {
    expect(canReusePrefetch({ url: URL_A, at: 0, status: 'reading' }, URL_A, NOW)).toBe(true);
  });

  it('lecture terminée il y a peu ⇒ réutilisée', () => {
    expect(canReusePrefetch({ url: URL_A, at: NOW - 5_000, status: 'ok' }, URL_A, NOW)).toBe(true);
  });

  it('lecture trop ancienne ⇒ relecture au clic', () => {
    expect(canReusePrefetch({ url: URL_A, at: NOW - AYWEBS_PREFETCH_MAX_AGE_MS - 1, status: 'ok' }, URL_A, NOW)).toBe(false);
  });

  it('lecture échouée ⇒ relecture au clic', () => {
    expect(canReusePrefetch({ url: URL_A, at: NOW, status: 'failed' }, URL_A, NOW)).toBe(false);
  });

  it('lecture d\'une autre page ⇒ jamais réutilisée', () => {
    expect(canReusePrefetch({ url: URL_B, at: NOW, status: 'ok' }, URL_A, NOW)).toBe(false);
  });

  it('aucune lecture ⇒ relecture au clic', () => {
    expect(canReusePrefetch(null, URL_A, NOW)).toBe(false);
  });
});
