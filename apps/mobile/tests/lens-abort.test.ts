import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeBarcode, analyzeCode, analyzeText } from '../src/api/lens';

const CASES: Array<{
  name: string;
  path: string;
  run: (signal: AbortSignal) => Promise<unknown>;
}> = [
  { name: 'lien / QR', path: '/api/ayrovix/analyze-code', run: (signal) => analyzeCode('https://shop.example/p/1', signal) },
  { name: 'code-barres', path: '/api/ayrovix/analyze-barcode', run: (signal) => analyzeBarcode('6191234567890', signal) },
  { name: 'nom', path: '/api/ayrovix/analyze-text', run: (signal) => analyzeText('sac noir', signal) },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('annulation des recherches Lens sans image', () => {
  for (const row of CASES) {
    it(`propage AbortSignal jusqu’au fetch — ${row.name}`, async () => {
      const fetchSpy = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new Error('aborted before fetch'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new Error('aborted during fetch')), { once: true });
      }));
      vi.stubGlobal('fetch', fetchSpy);
      const controller = new AbortController();

      const pending = row.run(controller.signal);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain(row.path);
      expect(init.signal?.aborted).toBe(false);

      controller.abort();

      await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
      expect(init.signal?.aborted).toBe(true);
    });
  }
});
