/**
 * « Add to Cart » — la capture WebView est un accélérateur, pas une condition.
 * Quatre cas, un par décision de `resolveWithCaptureFallback`.
 */
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/errors';
import { resolveWithCaptureFallback, resolveWithParallelCapture } from '@/features/aywebs/captureFallback';

const CAPTURE = { used: true, fingerprint: 'fp-1' };

describe('resolveWithCaptureFallback', () => {
  it('capture réussie : résolution AVEC la capture, une seule fois', async () => {
    const readCapture = vi.fn(async () => CAPTURE);
    const resolve = vi.fn(async (capture: unknown) => ({ seen: capture }));

    const result = await resolveWithCaptureFallback({ readCapture, resolve });

    expect(result).toEqual({ outcome: { seen: CAPTURE }, capture: CAPTURE });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('capture impossible (page muette, script absent) : on résout SANS capture, l\'ajout continue', async () => {
    const readCapture = vi.fn(async () => {
      throw new ApiError('timeout', 'Capture : la page n’a rien renvoyé dans le délai.');
    });
    const resolve = vi.fn(async (capture: unknown) => ({ seen: capture }));

    const result = await resolveWithCaptureFallback({ readCapture, resolve });

    expect(result).toEqual({ outcome: { seen: undefined }, capture: undefined });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it('résolution AVEC capture coupée par le réseau : une reprise SANS capture', async () => {
    const readCapture = vi.fn(async () => CAPTURE);
    const resolve = vi.fn(async (capture: unknown) => {
      if (capture !== undefined) throw new ApiError('network', 'Réseau injoignable : /product/resolve');
      return { seen: 'without-capture' };
    });

    const result = await resolveWithCaptureFallback({ readCapture, resolve });

    expect(result).toEqual({ outcome: { seen: 'without-capture' }, capture: undefined });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenNthCalledWith(1, CAPTURE);
    expect(resolve).toHaveBeenNthCalledWith(2, undefined);
  });

  it('timeout serveur : pas de reprise (le serveur est lent, 30 s de plus n\'aident pas)', async () => {
    const readCapture = vi.fn(async () => CAPTURE);
    const failure = new ApiError('timeout', 'Délai dépassé');
    const resolve = vi.fn(async () => { throw failure; });

    await expect(resolveWithCaptureFallback({ readCapture, resolve })).rejects.toBe(failure);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('annulation (écran fermé) pendant la capture : on propage, rien ne relance', async () => {
    const failure = new ApiError('aborted', 'Requête annulée');
    const readCapture = vi.fn(async () => { throw failure; });
    const resolve = vi.fn(async () => ({}));

    await expect(resolveWithCaptureFallback({ readCapture, resolve })).rejects.toBe(failure);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('pas de capture permise : aucune lecture, résolution directe', async () => {
    const resolve = vi.fn(async (capture: unknown) => ({ seen: capture }));

    const result = await resolveWithCaptureFallback({ resolve });

    expect(result).toEqual({ outcome: { seen: undefined }, capture: undefined });
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe('resolveWithParallelCapture — lecture serveur lancée avant la fin de la capture', () => {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('la lecture serveur part AVANT que la capture soit finie (pas de série)', async () => {
    const order: string[] = [];
    const readCapture = vi.fn(async () => { await delay(20); order.push('capture-done'); return CAPTURE; });
    const resolve = vi.fn(async (capture: unknown) => {
      order.push(capture === undefined ? 'server-started' : 'resolved-with-capture');
      return { seen: capture };
    });

    await resolveWithParallelCapture({ readCapture, resolve });

    expect(order[0]).toBe('server-started');
    expect(resolve.mock.calls[0][0]).toBeUndefined();
  });

  it('capture réussie : résultat AVEC capture, et la phase le dit', async () => {
    const onPhase = vi.fn();
    const resolve = vi.fn(async (capture: unknown) => ({ seen: capture }));

    const result = await resolveWithParallelCapture({ readCapture: async () => CAPTURE, resolve, onPhase });

    expect(result.capture).toEqual(CAPTURE);
    expect(result.outcome).toEqual({ seen: CAPTURE });
    expect(onPhase).toHaveBeenCalledWith('capture-ok');
    expect(onPhase).not.toHaveBeenCalledWith('server-only');
  });

  it('capture échouée : on attend la lecture serveur déjà en route, sans capture', async () => {
    const onPhase = vi.fn();
    const readCapture = vi.fn(async () => { throw new ApiError('timeout', 'page muette'); });
    const resolve = vi.fn(async (capture: unknown) => ({ seen: capture ?? 'server' }));

    const result = await resolveWithParallelCapture({ readCapture, resolve, onPhase });

    expect(result).toEqual({ outcome: { seen: 'server' }, capture: undefined });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(onPhase).toHaveBeenLastCalledWith('server-only');
  });

  it('capture réussie mais résolution coupée par le réseau : repli sur la lecture serveur', async () => {
    const resolve = vi.fn(async (capture: unknown) => {
      if (capture !== undefined) throw new ApiError('network', 'réseau coupé');
      return { seen: 'server' };
    });

    const result = await resolveWithParallelCapture({ readCapture: async () => CAPTURE, resolve });

    expect(result).toEqual({ outcome: { seen: 'server' }, capture: undefined });
  });

  it('pas de capture permise : résolution serveur seule', async () => {
    const resolve = vi.fn(async () => ({ seen: 'server' }));
    const result = await resolveWithParallelCapture({ resolve });
    expect(result).toEqual({ outcome: { seen: 'server' }, capture: undefined });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('annulation (écran fermé) : propagée, sans relance', async () => {
    const readCapture = vi.fn(async () => { throw new ApiError('aborted', 'annulé'); });
    const resolve = vi.fn(async () => ({ seen: 'server' }));

    await expect(resolveWithParallelCapture({ readCapture, resolve })).rejects.toBeInstanceOf(ApiError);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('erreur serveur métier pendant la lecture parallèle : propagée telle quelle', async () => {
    const resolve = vi.fn(async () => { throw new ApiError('http', 'produit introuvable', { status: 404 }); });
    await expect(resolveWithParallelCapture({ resolve })).rejects.toBeInstanceOf(ApiError);
  });
});

