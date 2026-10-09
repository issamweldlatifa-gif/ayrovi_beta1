import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiUrl, mediaUrl, DEFAULT_TIMEOUT_MS } from '../src/api/client';
import { failureFrom, parseRetryAfter, unwrap } from '../src/api/envelope';
import { ApiError, isApiError, userMessage } from '../src/api/errors';
import { API_BASE_URL } from '../src/api/config';
import {
  parseHeroContent, parseHeroVisual, parseNavigation,
} from '../src/api/public';

/* ── Doubles de `fetch` ────────────────────────────────────────────────────── */

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** `fetch` qui répond toujours — et qui refuse d'être appelé en double. */
const respond = (handler: Handler) => vi.fn(async (url: unknown, init: unknown) =>
  handler(String(url), (init ?? {}) as RequestInit));

/** `fetch` qui ne répond jamais et n'échoue que si on l'annule. */
const hangUntilAborted = () => vi.fn((_url: unknown, init: unknown) => new Promise<Response>((_resolve, reject) => {
  const signal = (init as RequestInit)?.signal as AbortSignal | undefined;
  const abort = () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    reject(error);
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort);
}));

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

/* ── URLs ──────────────────────────────────────────────────────────────────── */

describe('construction des URLs', () => {
  it('rend un chemin relatif absolu sur l’origine de l’API', () => {
    expect(apiUrl('/api/public/hero-content')).toBe(`${API_BASE_URL}/api/public/hero-content`);
    expect(apiUrl('api/public/x')).toBe(`${API_BASE_URL}/api/public/x`);
  });

  it('laisse une URL absolue intacte — aucun double préfixe', () => {
    expect(apiUrl('https://example.test/x')).toBe('https://example.test/x');
  });

  it('résout les médias renvoyés relatifs par le serveur', () => {
    // Sans cela, React Native affiche une image vide sans aucune erreur.
    expect(mediaUrl('/media/hero-default.jpg')).toBe(`${API_BASE_URL}/media/hero-default.jpg`);
    expect(mediaUrl('media/hero-default.jpg')).toBe(`${API_BASE_URL}/media/hero-default.jpg`);
    expect(mediaUrl('https://cdn.test/a.png')).toBe('https://cdn.test/a.png');
    expect(mediaUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(mediaUrl(null)).toBe('');
    expect(mediaUrl('  ')).toBe('');
  });
});

/* ── Enveloppe du serveur ──────────────────────────────────────────────────── */

describe('enveloppe { success, data }', () => {
  it('extrait les données d’une réponse valide', () => {
    expect(unwrap<{ id: number }>({ success: true, data: { id: 7 } })).toEqual({ id: 7 });
  });

  it('accepte une absence de données : le contrat dit « rien à servir »', () => {
    expect(unwrap({ success: true })).toBeUndefined();
    expect(unwrap({ success: true, data: null })).toBeNull();
  });

  it('refuse un 200 dont le corps n’est pas l’enveloppe attendue', () => {
    // « Succès » ne veut pas dire « compris » : une page HTML de passerelle
    // ne doit jamais être prise pour des données.
    for (const payload of [null, '<html>', 42, { ok: true }]) {
      expect(() => unwrap(payload)).toThrow(ApiError);
    }
    try { unwrap({ ok: true }); } catch (error) {
      expect((error as ApiError).kind).toBe('malformed');
      expect((error as ApiError).code).toBe('');
    }
  });

  it('remonte le code d’erreur du serveur', () => {
    try {
      unwrap({ success: false, code: 'INVALID_URL', error: 'Lien refusé.' });
      throw new Error('aurait dû échouer');
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      expect((error as ApiError).kind).toBe('http');
      expect((error as ApiError).code).toBe('INVALID_URL');
      expect((error as ApiError).message).toBe('Lien refusé.');
    }
  });
});

describe('Retry-After', () => {
  it('lit des secondes', () => {
    expect(parseRetryAfter('45')).toBe(45_000);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('lit une date HTTP', () => {
    const now = Date.parse('2026-10-07T10:00:00Z');
    expect(parseRetryAfter('Wed, 07 Oct 2026 10:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfter('Wed, 07 Oct 2026 09:59:00 GMT', now)).toBe(0);
  });

  it('ignore une valeur illisible', () => {
    expect(parseRetryAfter(null)).toBe(0);
    expect(parseRetryAfter('bientôt')).toBe(0);
  });
});

/* ── Transport ─────────────────────────────────────────────────────────────── */

describe('apiGet', () => {
  it('renvoie les données et l’heure serveur', async () => {
    vi.stubGlobal('fetch', respond(() => json({
      success: true, data: { text: 'ok' }, serverTime: '2026-10-07T10:00:00.000Z',
    })));
    const result = await apiGet<{ text: string }>('/api/public/x');
    expect(result.data).toEqual({ text: 'ok' });
    expect(result.serverTime).toBe('2026-10-07T10:00:00.000Z');
  });

  it('envoie un en-tête Accept JSON sur un GET', async () => {
    const fetchMock = respond(() => json({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await apiGet('/api/public/x');
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).headers).toMatchObject({ Accept: 'application/json' });
  });

  it('transforme un 429 en erreur exploitable, avec le délai d’attente', async () => {
    vi.stubGlobal('fetch', respond(() => json(
      { success: false, code: 'RATE_LIMITED', error: 'Trop de tentatives.' },
      429,
      { 'Retry-After': '30' },
    )));
    try {
      await apiGet('/api/public/x');
      throw new Error('aurait dû échouer');
    } catch (error) {
      expect((error as ApiError).status).toBe(429);
      expect((error as ApiError).code).toBe('RATE_LIMITED');
      expect((error as ApiError).retryAfterMs).toBe(30_000);
    }
  });

  it('transforme une 500 en erreur serveur, sans fuite de HTML', async () => {
    vi.stubGlobal('fetch', respond(() => new Response('<html>Bad Gateway</html>', { status: 502 })));
    try {
      await apiGet('/api/public/x');
      throw new Error('aurait dû échouer');
    } catch (error) {
      expect((error as ApiError).status).toBe(502);
      expect((error as ApiError).message).toBe('HTTP 502');
    }
  });

  it('signale une coupure réseau comme telle (mode hors-ligne)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network request failed'); }));
    try {
      await apiGet('/api/public/x');
      throw new Error('aurait dû échouer');
    } catch (error) {
      expect((error as ApiError).kind).toBe('network');
      expect((error as ApiError).isOffline).toBe(true);
      expect(userMessage(error).ar).toContain('اتصال');
    }
  });

  it('distingue l’annulation demandée par l’écran', async () => {
    vi.stubGlobal('fetch', hangUntilAborted());
    const controller = new AbortController();
    const pending = apiGet('/api/public/x', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('abandonne au bout de la durée limite, et pas avant', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangUntilAborted());
    const pending = apiGet('/api/public/x', { timeoutMs: 500 });
    pending.catch(() => {}); // évite un rejet non géré avant l'assertion
    await vi.advanceTimersByTimeAsync(499);
    let settled = false;
    pending.catch(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('utilise une durée limite par défaut raisonnable', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('failureFrom', () => {
  it('garde le message du serveur quand il existe', () => {
    const error = failureFrom(503, { success: false, code: 'MAINTENANCE', error: 'Service en maintenance.' }, 1_000);
    expect(error.message).toBe('Service en maintenance.');
    expect(error.code).toBe('MAINTENANCE');
    expect(error.retryAfterMs).toBe(1_000);
  });

  it('reste lisible sur un corps vide', () => {
    expect(failureFrom(500, null).message).toBe('HTTP 500');
  });
});

/* ── Analyse des charges utiles ────────────────────────────────────────────── */

describe('lecture du contenu public', () => {
  it('lit le contenu du hero et considère `enabled` absent comme actif', () => {
    const content = parseHeroContent({
      eyebrow: 'Nouveau', title: 'Titre\nà deux lignes', highlight: 'deux',
      description: 'Texte', ctaLabel: 'Découvrir', ctaUrl: '/arrivage',
    });
    expect(content).toMatchObject({ eyebrow: 'Nouveau', highlight: 'deux', ctaUrl: '/arrivage', enabled: true });
    expect(parseHeroContent({ enabled: false })).toMatchObject({ enabled: false });
    expect(parseHeroContent(null)).toBeNull();
    expect(parseHeroContent('texte')).toBeNull();
  });

  it('refuse un visuel sans image et filtre les tailles illisibles', () => {
    expect(parseHeroVisual({ imageUrl: '' })).toBeNull();
    expect(parseHeroVisual(null)).toBeNull();
    const visual = parseHeroVisual({
      imageUrl: '/media/hero-default.jpg', imageWidth: 1600, imageHeight: 900,
      srcset: [{ url: '/media/hero-default_640.webp', width: 640 }, { url: '' }, 'nope'],
      altText: 'Hero', focalX: 0.4, focalY: 9,
    });
    expect(visual).toMatchObject({
      imageUrl: '/media/hero-default.jpg', imageWidth: 1600, imageHeight: 900,
      srcset: [{ url: '/media/hero-default_640.webp', width: 640 }],
      focalX: 0.4, isDefault: false,
    });
  });

  it('ne garde que les liens de navigation utilisables, dans l’ordre', () => {
    const links = parseNavigation([
      { id: 2, destination: 'b', href: '/arrivage', labelFr: 'Arrivage', order: 20 },
      { id: 1, destination: 'a', href: '/nouveautes', labelFr: 'Nouveautés', labelAr: 'الجديد', order: 10 },
      { id: 3, destination: 'c', href: 'https://ailleurs.test', labelFr: 'Externe', order: 30 },
      { id: 4, destination: 'd', href: '/sans-libelle', order: 40 },
      { id: 5, destination: 'e', href: '/arabe', labelAr: 'عربي', order: 50 },
      null,
    ]);
    expect(links.map((link) => link.href)).toEqual(['/nouveautes', '/arrivage', '/arabe']);
    expect(links[0]).toMatchObject({ labelFr: 'Nouveautés', labelAr: 'الجديد' });
    // Sans libellé français, l'arabe sert des deux côtés plutôt que rien.
    expect(links[2]).toMatchObject({ labelFr: 'عربي', labelAr: 'عربي' });
  });

});
