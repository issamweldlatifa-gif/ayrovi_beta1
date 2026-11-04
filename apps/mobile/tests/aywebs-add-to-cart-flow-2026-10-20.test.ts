/**
 * AYWEBs — parcours « Add to Cart » et contrat de réponse (20/10/2026).
 *
 *  • UNE capture puis UNE résolution : jamais une seconde lecture serveur quand la
 *    capture réussit, un seul repli quand elle échoue ou tarde ;
 *  • annulation (écran fermé, nouvel appui) : aucune requête lancée après ;
 *  • fiche incomplète ⇒ pas de feuille, et le message NOMME les champs manquants ;
 *  • réponse hors contrat ⇒ « format inattendu », jamais « lecture incomplète » ni
 *    « illisible » sans explication.
 */
import { describe, expect, it, vi } from 'vitest';

import { ApiError, userMessage } from '@/api/errors';
import { incompleteCaptureError, parseAyWebsResolvedProduct, type AyWebsResolveOutcome } from '@/api/aywebs';
import { resolveWithCaptureFallback } from '@/features/aywebs/captureFallback';
import { addToCartDecision, resolveAddToCart } from '@/features/aywebs/captureFlow';

const CAPTURE = { v: 1, priceCandidates: [{ text: '$109.00', source: 'dom' }] };
const networkError = () => new ApiError('network', 'offline');

function outcome(overrides: Partial<AyWebsResolveOutcome> & { verified?: boolean } = {}): AyWebsResolveOutcome {
  const verified = overrides.verified !== false;
  return {
    product: {
      productId: 'aywprd_1', storeId: 'amazon', storeName: 'Amazon', sourceUrl: '', sourceDomain: 'amazon.com',
      title: 'Tablette', brand: '', images: [], price: verified ? 109 : 0, currency: verified ? 'USD' : '',
      priceVerified: verified, currencyVerified: verified,
    } as unknown as AyWebsResolveOutcome['product'],
    capture: null,
    priceRejection: null,
    missing: verified ? [] : ['price', 'currency'],
    quoteToken: verified ? 'quote-1' : '',
    ...overrides,
  } as AyWebsResolveOutcome;
}

describe('une capture, une résolution (pas de lecture serveur en double)', () => {
  it('capture réussie ⇒ une seule résolution, AVEC la capture', async () => {
    const resolve = vi.fn(async (capture: unknown) => ({ capture }));
    const result = await resolveWithCaptureFallback({ readCapture: async () => CAPTURE, resolve });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(CAPTURE);
    expect(result.capture).toBe(CAPTURE);
  });

  it('capture refusée côté serveur (objet reçu) ⇒ toujours UNE résolution : le serveur relit lui-même', async () => {
    const resolve = vi.fn(async () => 'ok');
    await resolveWithCaptureFallback({ readCapture: async () => ({ v: 1, rejected: true }), resolve });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('capture échouée ou délai dépassé ⇒ UNE résolution sans capture (le repli)', async () => {
    const resolve = vi.fn(async () => 'ok');
    const timeout = new ApiError('timeout', 'Capture : délai');
    await resolveWithCaptureFallback({ readCapture: async () => { throw timeout; }, resolve });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it('résolution avec capture coupée par le réseau ⇒ exactement une reprise sans capture', async () => {
    const resolve = vi.fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce('ok');
    const result = await resolveWithCaptureFallback({ readCapture: async () => CAPTURE, resolve });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve.mock.calls[1][0]).toBeUndefined();
    expect(result.outcome).toBe('ok');
  });

  it('erreur serveur (pas réseau) ⇒ aucune reprise : la décision reste celle du serveur', async () => {
    const resolve = vi.fn(async () => { throw new ApiError('http', 'x', { status: 422 }); });
    await expect(resolveWithCaptureFallback({ readCapture: async () => CAPTURE, resolve })).rejects.toBeInstanceOf(ApiError);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('annulation pendant la capture ⇒ aucune résolution, l’erreur est propagée', async () => {
    const controller = new AbortController();
    const resolve = vi.fn(async () => 'ok');
    const readCapture = async () => { controller.abort(); throw new ApiError('aborted', 'Requête interrompue.'); };
    await expect(resolveWithCaptureFallback({ readCapture, resolve, signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('annulation avant le départ ⇒ rien n’est lancé', async () => {
    const controller = new AbortController();
    controller.abort();
    const readCapture = vi.fn(async () => CAPTURE);
    const resolve = vi.fn(async () => 'ok');
    await expect(resolveWithCaptureFallback({ readCapture, resolve, signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' });
    expect(readCapture).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('les phases suivent la vraie séquence : lecture, puis résolution', async () => {
    const phases: string[] = [];
    await resolveWithCaptureFallback({
      readCapture: async () => CAPTURE,
      resolve: async () => 'ok',
      onPhase: (phase) => phases.push(phase),
    });
    expect(phases).toEqual(['reading', 'resolving']);
  });
});

describe('décision après résolution : feuille ou explication nommée', () => {
  it('fiche vérifiée (prix, devise, devis) ⇒ la feuille s’ouvre', () => {
    expect(addToCartDecision(outcome())).toEqual({ kind: 'sheet' });
  });

  it('champs manquants ⇒ pas de feuille, erreur CAPTURE_INCOMPLETE avec les champs nommés', () => {
    const decision = addToCartDecision(outcome({ verified: false }));
    expect(decision.kind).toBe('refused');
    if (decision.kind !== 'refused') return;
    expect(decision.error.code).toBe('CAPTURE_INCOMPLETE');
    expect(decision.error.missingFields).toEqual(['price', 'currency']);
    expect(userMessage(decision.error).fr).toContain('le prix et la devise');
    expect(userMessage(decision.error).fr).not.toMatch(/illisible/i);
  });

  it('parcours complet : résolution réussie ⇒ feuille, sans capture en double', async () => {
    const resolve = vi.fn(async () => outcome());
    const { decision, capture } = await resolveAddToCart({ readCapture: async () => CAPTURE, resolve });
    expect(decision.kind).toBe('sheet');
    expect(capture).toBe(CAPTURE);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('parcours complet : données manquantes ⇒ refus explicite, une seule résolution', async () => {
    const resolve = vi.fn(async () => outcome({ verified: false }));
    const { decision } = await resolveAddToCart({ readCapture: async () => CAPTURE, resolve });
    expect(decision.kind).toBe('refused');
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe('contrat de réponse : extraction incomplète ≠ format non conforme', () => {
  const PRODUCT = { product_id: 'aywprd_1', store_id: 'amazon', title: 'Tablette', availability: {} };

  it('201 sans données mais avec missing ⇒ CAPTURE_INCOMPLETE (et non un format illisible)', () => {
    const error = incompleteCaptureError({ success: true, missing: ['title', 'price'] });
    expect(error?.code).toBe('CAPTURE_INCOMPLETE');
    expect(error?.missingFields).toEqual(['title', 'price']);
  });

  it('fiche avec titre et champs manquants ⇒ pas d’erreur ici (la décision de l’écran la prend)', () => {
    expect(incompleteCaptureError({ success: true, missing: ['price'], data: PRODUCT })).toBeNull();
  });

  it('product_id absent ⇒ CONTRACT_MISMATCH nommé, pas une « lecture incomplète »', () => {
    let caught: unknown = null;
    try { parseAyWebsResolvedProduct({ ...PRODUCT, product_id: '' }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('CONTRACT_MISMATCH');
    expect((caught as ApiError).missingFields).toEqual(['product_id']);
    const message = userMessage(caught);
    expect(message.fr).toContain('product_id');
    expect(message.fr).toContain('format inattendu');
    expect(message.fr).not.toMatch(/illisible/i);
  });

  it('titre et identifiant absents ⇒ les deux champs sont nommés', () => {
    let caught: unknown = null;
    try { parseAyWebsResolvedProduct({ store_id: 'amazon' }); } catch (error) { caught = error; }
    expect((caught as ApiError).missingFields).toEqual(['product_id', 'title']);
  });

  it('fiche conforme ⇒ aucune erreur de contrat', () => {
    expect(parseAyWebsResolvedProduct(PRODUCT).title).toBe('Tablette');
  });
});
