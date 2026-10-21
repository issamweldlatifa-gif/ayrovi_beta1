/**
 * AYWEBs — bouton « Add to Cart » : sans minuteur (20/10/2026).
 *
 *  • page lue à temps ⇒ UNE résolution serveur AVEC la lecture, puis la feuille ;
 *  • page pas encore lue ⇒ le bouton attend (aucun délai), jusqu'au succès ou à l'annulation ;
 *  • délai explicite (API) ⇒ refus `CAPTURE_INCOMPLETE` qui nomme titre et prix, sans repli serveur ;
 *  • lecture en erreur ⇒ même refus immédiat ;
 *  • annulation (écran fermé, nouvel appui) ⇒ on propage, rien n'est ouvert ;
 *  • sans délai, l'ancien chemin (repli serveur) reste inchangé.
 */
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/errors';
import type { AyWebsResolveOutcome } from '@/api/aywebs';
import { AYWEBS_PREFETCH_MAX_AGE_MS, canReusePrefetch, resolveAddToCart } from '@/features/aywebs/captureFlow';

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

describe('pas de minuteur sur le bouton « Add »', () => {
  it('page lue après 60 s ⇒ on attend, puis UNE résolution AVEC la lecture', async () => {
    vi.useFakeTimers();
    try {
      let finish: (value: unknown) => void = () => undefined;
      const resolve = vi.fn(async () => verifiedOutcome());
      const pending = resolveAddToCart({
        readCapture: () => new Promise<unknown>((r) => { finish = r; }),
        resolve,
        waitForCapture: true,
      });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(resolve).not.toHaveBeenCalled();
      finish(CAPTURE);
      const result = await pending;
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(CAPTURE);
      expect(result.decision.kind).toBe('sheet');
    } finally {
      vi.useRealTimers();
    }
  });

  it('page qui ne répond pas ⇒ aucun refus automatique ; annulation ⇒ on propage, rien n\'est ouvert', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const resolve = vi.fn(async () => verifiedOutcome());
      let settled = false;
      const pending = resolveAddToCart({
        readCapture: () => new Promise<unknown>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new ApiError('aborted', 'Requête interrompue.')));
        }),
        resolve,
        signal: controller.signal,
        waitForCapture: true,
      });
      pending.then(() => { settled = true; }, () => { settled = true; });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(settled).toBe(false);
      expect(resolve).not.toHaveBeenCalled();
      controller.abort();
      await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
      expect(resolve).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lecture en erreur ⇒ refus immédiat, sans lecture serveur de repli', async () => {
    const resolve = vi.fn(async () => verifiedOutcome());
    const result = await resolveAddToCart({
      readCapture: async () => { throw new ApiError('http', 'script'); },
      resolve,
      waitForCapture: true,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(result.decision.kind).toBe('refused');
    if (result.decision.kind === 'refused') expect(result.decision.error.code).toBe('CAPTURE_INCOMPLETE');
  });

  it('un délai explicite reste honoré (API inchangée) ⇒ refus CAPTURE_INCOMPLETE et arrêt de la lecture', async () => {
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
      expect(onBudgetExceeded).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sans délai ni attente explicite, le repli serveur reste disponible (ancien chemin)', async () => {
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
    expect(canReusePrefetch({ url: URL_A, at: NOW, status: 'reading' }, URL_A, NOW)).toBe(true);
  });

  it('lecture en cours périmée ⇒ jamais réutilisée indéfiniment', () => {
    expect(canReusePrefetch({ url: URL_A, at: NOW - AYWEBS_PREFETCH_MAX_AGE_MS, status: 'reading' }, URL_A, NOW)).toBe(false);
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
