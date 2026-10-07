/**
 * P2.3 — récupération de mot de passe, photo de profil, fournisseurs.
 *
 * Ce que ces tests tiennent :
 *   1. la demande de réinitialisation ne prétend RIEN : un 202 est un accusé de
 *      réception, et un 503 doit remonter avec son code pour que l'écran dise
 *      la vérité au lieu d'annoncer un lien qui n'arrivera jamais ;
 *   2. le code de remise des fournisseurs respecte le format exigé par le
 *      serveur (32 à 128 caractères `[A-Za-z0-9_-]`) — un format hors contrat
 *      ferait échouer la connexion après le consentement de l'utilisateur ;
 *   3. l'attente (`pollHandoff`) distingue « pas encore » de « jamais » : elle
 *      s'acharne sur HANDOFF_PENDING, mais s'arrête net sur un refus réel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: async (count: number) => Uint8Array.from({ length: count }, (_, i) => (i * 37 + 11) % 256),
}));

import { resetAuthContext, setAuthContext } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { API_BASE_URL, CLIENT_HEADER } from '../src/api/config';
import { deleteAvatar, requestPasswordReset, uploadAvatar } from '../src/api/account';
import {
  base64FromBytes, claimHandoff, googleNativeLogin, isHandoffPending, newHandoffCode, pollHandoff,
  providerStartPath, providerStartUrl,
} from '../src/api/providers';
import { authMessage, authMessageForCode } from '../src/api/authMessages';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const respond = (handler: (url: string, init: RequestInit) => Response) =>
  vi.fn(async (url: unknown, init: unknown) => handler(String(url), (init ?? {}) as RequestInit));

const lastCall = (mock: ReturnType<typeof respond>) => {
  const [url, init] = mock.mock.calls[mock.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit, headers: (init as RequestInit).headers as Record<string, string> };
};

/** Même forme que celle produite par la couche réseau (kind/status/code). */
const httpError = (status: number, code: string) =>
  new ApiError('http', `${status} ${code}`, { status, code });

const accountRow = {
  id: 'account_1', displayName: 'Amine', email: 'amine@ayrovi.tn', phone: '+21620123456',
  avatarUrl: 'data:image/jpeg;base64,AAA', emailVerified: true, phoneVerified: true,
  status: 'ACTIVE', locale: 'fr', marketingOptIn: true,
};

beforeEach(() => {
  vi.unstubAllGlobals();
  resetAuthContext();
  setAuthContext({ clientHeader: CLIENT_HEADER, token: 'jeton-1', csrfToken: 'csrf-1' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/* ── Récupération de mot de passe ───────────────────────────────────────────── */

describe('mot de passe oublié', () => {
  it('envoie l’adresse et la langue, et accepte un 202 comme un accusé de réception', async () => {
    const fetchMock = respond(() => json({ success: true, data: { status: 'accepted', retryAfterSeconds: 60 } }, 202));
    vi.stubGlobal('fetch', fetchMock);

    await requestPasswordReset('  Amine@Ayrovi.tn ', 'ar');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/api/customer/auth/password/request`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'Amine@Ayrovi.tn', locale: 'ar' });
  });

  it('remonte le code RESET_UNAVAILABLE quand le serveur ne peut pas envoyer', async () => {
    vi.stubGlobal('fetch', respond(() => json({ success: false, code: 'RESET_UNAVAILABLE' }, 503)));
    await expect(requestPasswordReset('amine@ayrovi.tn', 'fr')).rejects.toMatchObject({ code: 'RESET_UNAVAILABLE', status: 503 });
  });
});

/* ── Photo de profil ────────────────────────────────────────────────────────── */

describe('photo de profil', () => {
  it('envoie un multipart SANS Content-Type manuel et adopte le compte relu', async () => {
    const fetchMock = respond(() => json({ success: true, data: accountRow }));
    vi.stubGlobal('fetch', fetchMock);

    const account = await uploadAvatar({ uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });

    const { url, init, headers } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/api/customer/account/avatar`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    // Le navigateur (ou React Native) doit poser lui-même le séparateur : un
    // Content-Type écrit à la main donne un corps que le serveur ne lit pas.
    expect(headers['Content-Type']).toBeUndefined();
    expect(account.avatarUrl).toBe('data:image/jpeg;base64,AAA');
  });

  it('joint un vrai File quand le sélecteur en fournit un (web)', async () => {
    const fetchMock = respond(() => json({ success: true, data: accountRow }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadAvatar({ uri: 'blob:preview', blob: new Blob(['abc'], { type: 'image/png' }) });

    const body = (lastCall(fetchMock).init.body as FormData).get('avatar');
    expect(body).toBeInstanceOf(Blob);
  });

  it('supprime la photo avec DELETE', async () => {
    const fetchMock = respond(() => json({ success: true, data: { ...accountRow, avatarUrl: '' } }));
    vi.stubGlobal('fetch', fetchMock);

    const account = await deleteAvatar();

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/api/customer/account/avatar`);
    expect(init.method).toBe('DELETE');
    expect(account.avatarUrl).toBe('');
  });
});

/* ── Fournisseurs ───────────────────────────────────────────────────────────── */

describe('fournisseurs', () => {
  it('produit un code de remise au format exigé par le serveur', async () => {
    const code = await newHandoffCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(code).toHaveLength(43); // 32 octets en base64url, sans remplissage
  });

  it('encode en base64 sans dépendre du navigateur', () => {
    expect(base64FromBytes(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe('TWFu');
    expect(base64FromBytes(new Uint8Array([0x66]))).toBe('Zg==');
    expect(base64FromBytes(new Uint8Array([0x66, 0x6f]))).toBe('Zm8=');
  });

  it('construit l’URL de départ avec le code de remise', () => {
    expect(providerStartPath('google', { handoff: 'abc' }))
      .toBe('/api/customer/auth/google/start?nativeHandoff=abc');
    expect(providerStartPath('apple', { handoff: 'abc', cartSessionId: 'cart_9' }))
      .toBe('/api/customer/auth/apple/start?nativeHandoff=abc&cartSessionId=cart_9');
    expect(providerStartUrl('facebook', 'abc')).toBe(`${API_BASE_URL}/api/customer/auth/facebook/start?nativeHandoff=abc`);
  });

  it('réclame la session avec le code et lit la forme exacte du serveur', async () => {
    const fetchMock = respond(() => json({
      success: true,
      data: { account: accountRow, csrfToken: 'csrf-2', expiresAt: '2026-11-01T00:00:00.000Z', native_session_token: 'sess-2' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const issue = await claimHandoff('code-remise');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/api/customer/auth/native/claim`);
    expect(JSON.parse(String(init.body))).toEqual({ handoff: 'code-remise' });
    expect(issue.sessionToken).toBe('sess-2');
    expect(issue.account.id).toBe('account_1');
  });

  it('transmet le jeton d’identité Google sans rien en déduire', async () => {
    const fetchMock = respond(() => json({
      success: true,
      data: { account: accountRow, csrfToken: 'csrf-2', native_session_token: 'sess-3' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await googleNativeLogin('a.b.c');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/api/customer/auth/google/native`);
    expect(JSON.parse(String(init.body))).toEqual({ idToken: 'a.b.c' });
  });

  it('reconnaît l’attente sans la confondre avec un refus', () => {
    expect(isHandoffPending(httpError(404, 'HANDOFF_PENDING'))).toBe(true);
    expect(isHandoffPending(httpError(400, 'HANDOFF_INVALID'))).toBe(false);
    expect(isHandoffPending(new Error('réseau'))).toBe(false);
  });
});

/* ── Attente de la session ──────────────────────────────────────────────────── */

describe('attente de la session', () => {
  const pending = () => { throw httpError(404, 'HANDOFF_PENDING'); };

  it('s’acharne tant que le serveur dit « pas encore », puis renvoie la session', async () => {
    let calls = 0;
    const claim = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw httpError(404, 'HANDOFF_PENDING');
      return { sessionToken: 'sess-9', account: { id: 'account_1' } } as never;
    });
    const sleep = vi.fn(async () => {});

    const issue = await pollHandoff('code', { claim, sleep, attempts: 5, delayMs: 10 });

    expect(claim).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(issue?.sessionToken).toBe('sess-9');
  });

  it('renvoie null après le délai : une attente sans suite n’est pas une erreur', async () => {
    const claim = vi.fn(async () => pending() as never);
    const issue = await pollHandoff('code', { claim, sleep: async () => {}, attempts: 4, delayMs: 1 });
    expect(issue).toBeNull();
    expect(claim).toHaveBeenCalledTimes(4);
  });

  it('s’arrête net sur un refus réel', async () => {
    const failure = httpError(400, 'HANDOFF_INVALID');
    const claim = vi.fn(async () => { throw failure; });
    await expect(pollHandoff('code', { claim, sleep: async () => {} })).rejects.toBe(failure);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('respecte l’annulation demandée par l’utilisateur', async () => {
    let cancelled = false;
    const claim = vi.fn(async () => {
      cancelled = true;
      throw httpError(404, 'HANDOFF_PENDING');
    });
    const issue = await pollHandoff('code', {
      claim, sleep: async () => {}, attempts: 10, shouldStop: () => cancelled,
    });
    expect(issue).toBeNull();
    expect(claim).toHaveBeenCalledTimes(1);
  });
});

/* ── Traduction des refus de photo ──────────────────────────────────────────── */

describe('refus de photo traduits', () => {
  it('distingue « trop lourde » de « mal formée »', () => {
    // 413 et 400 portent le même code : seul le STATUT dit lequel des deux.
    expect(authMessageForCode('AVATAR_UPLOAD_INVALID', 413)).toBe('profile.photoTooBig');
    expect(authMessageForCode('AVATAR_UPLOAD_INVALID', 400)).toBe('profile.photoFormat');
    expect(authMessageForCode('AVATAR_FORMAT_INVALID', 400)).toBe('profile.photoFormat');
    expect(authMessageForCode('AVATAR_INVALID', 400)).toBe('profile.photoUnreadable');
    expect(authMessageForCode('AVATAR_REQUIRED', 400)).toBe('profile.photoFailed');
  });

  it('traduit une erreur HTTP réelle en clé, jamais en texte brut', () => {
    const tooBig = new ApiError('http', 'Photo invalide.', { status: 413, code: 'AVATAR_UPLOAD_INVALID' });
    expect(authMessage(tooBig)).toEqual({ key: 'profile.photoTooBig' });
  });
});
