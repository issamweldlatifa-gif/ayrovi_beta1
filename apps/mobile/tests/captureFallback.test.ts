/**
 * « Add to Cart » — la capture WebView est un accélérateur, pas une condition.
 * Quatre cas, un par décision de `resolveWithCaptureFallback`.
 */
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/errors';
import { resolveWithCaptureFallback } from '@/features/aywebs/captureFallback';

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
