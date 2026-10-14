import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPhotoRoomMemoryForTests, isolationCacheInput, isolationProvider, isPhotoRoomPng, isPhotoRoomSandboxKey, PHOTOROOM_SEGMENT_URL, removeBackgroundWithPhotoRoom, shouldPersistNegative } from '../src/services/photoroomIsolation';
import { isolateBuffer } from '../src/services/imageIsolation';
import { segmentBuffer } from '../src/services/segmentation';

const KEY = 'sb_test_key_do_not_log_123456';
const ENV = { AYROVI_ISOLATION_PROVIDER: 'photoroom', PHOTOROOM_API_KEY: KEY } as NodeJS.ProcessEnv;

async function pngBytes(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
}
async function jpegSource(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 80, b: 200 } } }).jpeg().toBuffer();
}

describe('isolation PhotoRoom (sandbox / dev)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { resetPhotoRoomMemoryForTests(); warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { warn.mockRestore(); vi.restoreAllMocks(); });

  it('reste en local sans clé, et ne prend PhotoRoom que si provider ET clé sont présents', () => {
    expect(isolationProvider({} as NodeJS.ProcessEnv)).toBe('local');
    expect(isolationProvider({ AYROVI_ISOLATION_PROVIDER: 'photoroom' } as NodeJS.ProcessEnv)).toBe('local');
    expect(isolationProvider({ AYROVI_ISOLATION_PROVIDER: 'photoroom', PHOTOROOM_API_KEY: '  ' } as NodeJS.ProcessEnv)).toBe('local');
    expect(isolationProvider(ENV)).toBe('photoroom');
  });

  it('refuse toute clé sandbox en production pour ne jamais publier le filigrane', () => {
    expect(isPhotoRoomSandboxKey(' sandbox_demo_key ')).toBe(true);
    expect(isPhotoRoomSandboxKey('SB_demo_key')).toBe(true);
    expect(isPhotoRoomSandboxKey('live_demo_key')).toBe(false);
    expect(isolationProvider({ ...ENV, NODE_ENV: 'production' })).toBe('local');
    expect(isolationProvider({ ...ENV, RENDER: 'true' })).toBe('local');
    expect(isolationProvider({ ...ENV, PHOTOROOM_API_KEY: 'sandbox_demo_key', NODE_ENV: 'production' })).toBe('local');
    expect(isolationProvider({ ...ENV, PHOTOROOM_API_KEY: 'live_demo_key', NODE_ENV: 'production' })).toBe('photoroom');
  });

  it('envoie la clé dans x-api-key vers sdk.photoroom.com et renvoie le PNG', async () => {
    const png = await pngBytes();
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } }));
    const out = await removeBackgroundWithPhotoRoom(await jpegSource(), { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out && isPhotoRoomPng(out)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PHOTOROOM_SEGMENT_URL);
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('image_file')).toBeTruthy();
  });

  it('refuse une réponse qui n’est pas un PNG', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 200 }));
    expect(await removeBackgroundWithPhotoRoom(await jpegSource(), { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
  });

  it('renvoie null sur statut HTTP d’erreur sans révéler la clé dans les journaux', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    expect(await removeBackgroundWithPhotoRoom(await jpegSource(), { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('401');
    expect(logged).not.toContain(KEY);
  });

  it('renvoie null sur erreur réseau ou délai', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError(`fetch failed ${KEY}`); });
    expect(await removeBackgroundWithPhotoRoom(await jpegSource(), { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });

  it('ne fait aucun appel réseau sans fournisseur PhotoRoom', async () => {
    const fetchImpl = vi.fn();
    expect(await removeBackgroundWithPhotoRoom(await jpegSource(), { env: {} as NodeJS.ProcessEnv, fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('isolateBuffer passe par PhotoRoom en mode photoroom, et le segmenteur local est coupé', async () => {
    const png = await pngBytes();
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(png), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    vi.stubEnv('AYROVI_ISOLATION_PROVIDER', 'photoroom');
    vi.stubEnv('PHOTOROOM_API_KEY', KEY);
    try {
      const result = await isolateBuffer(await jpegSource());
      expect(result.kind).toBe('segmented');
      expect(result.png && isPhotoRoomPng(result.png)).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(await segmentBuffer(await jpegSource())).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe('cache par fournisseur (anti-résultat local périmé)', () => {
  const URL = 'https://cdn.example.com/p/1.jpg';
  it('le mode local garde la clé historique (pas de recalcul du cache existant)', () => {
    expect(isolationCacheInput(URL, 'local')).toBe(URL);
  });
  it('le mode photoroom a une clé distincte', () => {
    expect(isolationCacheInput(URL, 'photoroom')).not.toBe(URL);
    expect(isolationCacheInput(URL, 'photoroom')).toBe(`photoroom|${URL}`);
  });
  it('un échec n’est pas persisté en mode photoroom, mais l’est en local', () => {
    expect(shouldPersistNegative('photoroom')).toBe(false);
    expect(shouldPersistNegative('local')).toBe(true);
  });
});

describe('anti-doublon PhotoRoom', () => {
  beforeEach(() => { resetPhotoRoomMemoryForTests(); });
  it('deux demandes simultanées pour la même image = un seul appel réseau', async () => {
    const png = await pngBytes();
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(png), { status: 200 }));
    const input = await jpegSource();
    const opts = { env: { AYROVI_ISOLATION_PROVIDER: 'photoroom', PHOTOROOM_API_KEY: 'k_dedupe_test_1' } as NodeJS.ProcessEnv, fetchImpl: fetchImpl as unknown as typeof fetch };
    const [a, b] = await Promise.all([removeBackgroundWithPhotoRoom(input, opts), removeBackgroundWithPhotoRoom(input, opts)]);
    expect(a && isPhotoRoomPng(a)).toBe(true);
    expect(b && isPhotoRoomPng(b)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await removeBackgroundWithPhotoRoom(input, opts);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('un échec n’est pas gardé : la demande suivante est retentée', async () => {
    const png = await pngBytes();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(png), { status: 200 }));
    const input = await jpegSource();
    const opts = { env: { AYROVI_ISOLATION_PROVIDER: 'photoroom', PHOTOROOM_API_KEY: 'k_dedupe_test_2' } as NodeJS.ProcessEnv, fetchImpl: fetchImpl as unknown as typeof fetch };
    expect(await removeBackgroundWithPhotoRoom(input, opts)).toBeNull();
    expect(await removeBackgroundWithPhotoRoom(input, opts)).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
