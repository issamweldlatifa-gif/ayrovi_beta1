/**
 * Compte et session de l'APPLICATION (phase P2).
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *   1. l'application se déclare comme client mobile (`x-ayrovi-client`) — sans
 *      cette déclaration, le serveur répond un cookie que l'application ne peut
 *      pas lire, et la connexion est perdue à la fermeture ;
 *   2. le jeton va dans le trousseau, jamais dans les préférences, et il est
 *      étiqueté par la version qui l'a obtenu ;
 *   3. le CSRF n'est présenté QUE sur les écritures — un GET ne doit pas porter
 *      un jeton qui n'a rien à y faire ;
 *   4. les réponses du serveur sont relues strictement : une forme inattendue
 *      est une erreur visible, pas un écran à moitié peint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  authHeaders, getAuthContext, resetAuthContext, setAuthContext, apiSend, setCsrfRefresher,
} from '../src/api/client';
import { CLIENT_HEADER, CLIENT_VERSION, API_BASE_URL } from '../src/api/config';
import {
  emailLogin, emailRegister, fetchMe, fetchOrders, fetchOverview, logout, parseAccount,
  parseAuthConfig, parseEmailCodeChallenge, parseOtpChallenge, parseOverview, parseRecentOrder, parseSessionIssue,
  requestOtp, verifyOtp,
} from '../src/api/account';
import { authMessage, authMessageForCode } from '../src/api/authMessages';
import { translate } from '../src/i18n/keys';
import { ApiError } from '../src/api/errors';
import {
  clearSession, isExpired, loadSession, memoryBackend, parseStoredSession, saveSession,
  serializeSession, SESSION_STORAGE_KEY,
} from '../src/state/sessionStore';

/* ── Doubles ───────────────────────────────────────────────────────────────── */

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const respond = (handler: Handler) =>
  vi.fn(async (url: unknown, init: unknown) => handler(String(url), (init ?? {}) as RequestInit));

const lastCall = (fetchMock: ReturnType<typeof respond>) => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit, headers: (init as RequestInit).headers as Record<string, string> };
};

beforeEach(() => {
  vi.unstubAllGlobals();
  resetAuthContext();
  setAuthContext({ clientHeader: CLIENT_HEADER });
  setCsrfRefresher(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); setCsrfRefresher(null); });

/* ── 1. Déclaration du client et en-têtes ──────────────────────────────────── */

describe('en-têtes d’authentification', () => {
  it('déclare toujours le type de client, même visiteur', () => {
    const headers = authHeaders('GET');
    expect(headers['x-ayrovi-client']).toBe('mobile/2.0.0');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-csrf-token']).toBeUndefined();
  });

  it('accepte exactement la forme attendue par le serveur', () => {
    // Le serveur (`sessionExchange.ts`) refuse tout le reste et retombe sur le
    // cookie du web : cette expression doit rester vraie.
    expect(/^mobile\/\d+(\.\d+)*$/.test(CLIENT_HEADER)).toBe(true);
    expect(CLIENT_HEADER).toBe(`mobile/${CLIENT_VERSION}`);
  });

  it('la version déclarée est celle du manifeste', () => {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../app.json', import.meta.url)), 'utf8'));
    // Deux sources de version = un jour une application qui déclare 2.0.0 et
    // s'annonce 2.1.0 en magasin. Le test les tient ensemble.
    expect(CLIENT_VERSION).toBe(manifest.expo.version);
  });

  it('présente le jeton en Bearer et le CSRF uniquement sur les écritures', () => {
    setAuthContext({ token: 'jeton-abc', csrfToken: 'csrf-xyz' });
    expect(authHeaders('GET').Authorization).toBe('Bearer jeton-abc');
    expect(authHeaders('GET')['x-csrf-token']).toBeUndefined();
    expect(authHeaders('POST')['x-csrf-token']).toBe('csrf-xyz');
    expect(authHeaders('DELETE')['x-csrf-token']).toBe('csrf-xyz');
  });

  it('la déconnexion efface le jeton mais garde la déclaration', () => {
    setAuthContext({ token: 'jeton-abc', csrfToken: 'csrf-xyz' });
    resetAuthContext();
    expect(getAuthContext().token).toBe('');
    expect(getAuthContext().csrfToken).toBe('');
    // Sans cela, la connexion suivante ne recevrait plus de jeton : le bug le
    // plus coûteux du contrat, et le plus difficile à voir.
    expect(getAuthContext().clientHeader).toBe(CLIENT_HEADER);
  });

  it('rejoue une écriture après un CSRF périmé, une seule fois', async () => {
    setAuthContext({ token: 'jeton-1', csrfToken: 'vieux-csrf' });
    let refreshCount = 0;
    setCsrfRefresher(async () => { refreshCount += 1; setAuthContext({ csrfToken: 'csrf-neuf' }); return true; });
    const seen: string[] = [];
    const fetchMock = respond((_url, init) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      seen.push(headers['x-csrf-token'] ?? '');
      // Le serveur a fait tourner son jeton : le premier essai est refusé.
      return headers['x-csrf-token'] === 'csrf-neuf'
        ? json({ success: true, data: { ok: true } })
        : json({ success: false, code: 'INVALID_CSRF', error: 'Session de sécurité invalide.' }, 403);
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiSend('PUT', '/api/customer/account/preferences', { body: { darkMode: false } });
    expect(seen).toEqual(['vieux-csrf', 'csrf-neuf']);
    expect(refreshCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue pas une écriture quand le CSRF ne peut pas être renouvelé', async () => {
    setAuthContext({ token: 'jeton-1', csrfToken: 'vieux-csrf' });
    setCsrfRefresher(async () => false);
    const fetchMock = respond(() => json({ success: false, code: 'INVALID_CSRF', error: 'Session de sécurité invalide.' }, 403));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiSend('PUT', '/api/customer/account/preferences', { body: {} }))
      .rejects.toMatchObject({ code: 'INVALID_CSRF' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue jamais un refus qui n’est pas un CSRF périmé', async () => {
    setAuthContext({ token: 'jeton-1', csrfToken: 'csrf-1' });
    let refresherCalled = false;
    setCsrfRefresher(async () => { refresherCalled = true; return true; });
    const fetchMock = respond(() => json({ success: false, code: 'AUTH_REQUIRED', error: 'Non authentifié.' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiSend('PUT', '/api/customer/account/profile', { body: {} }))
      .rejects.toMatchObject({ status: 401 });
    expect(refresherCalled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne pose le Content-Type que lorsqu’il y a un corps', async () => {
    const fetchMock = respond(() => json({ success: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    // Déconnexion : aucun corps à envoyer, donc aucun type de contenu annoncé.
    await apiSend('POST', '/api/customer/auth/logout');
    expect(lastCall(fetchMock).headers['Content-Type']).toBeUndefined();
    expect(lastCall(fetchMock).init.body).toBeUndefined();

    await apiSend('POST', '/api/customer/auth/otp/request', { body: { phone: '20123456' } });
    expect(lastCall(fetchMock).headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({ phone: '20123456' });
  });
});

/* ── 2. Trousseau ──────────────────────────────────────────────────────────── */

const validStored = {
  token: 'jeton-abc', csrfToken: 'csrf-xyz', expiresAt: '2026-12-01T00:00:00.000Z', displayName: 'Amine',
};

describe('trousseau de session', () => {
  it('écrit puis relit une session complète', async () => {
    const backend = memoryBackend();
    await saveSession(backend, validStored);
    const loaded = await loadSession(backend);
    expect(loaded.session).toEqual(validStored);
    expect(loaded.storageError).toBe('');
    // Le contenu rangé porte la déclaration du client qui l'a obtenu.
    expect(JSON.parse(backend.values.get(SESSION_STORAGE_KEY)!).client).toBe(CLIENT_HEADER);
  });

  it('efface la session à la déconnexion', async () => {
    const backend = memoryBackend();
    await saveSession(backend, validStored);
    await clearSession(backend);
    expect((await loadSession(backend)).session).toBeNull();
  });

  it('refuse un contenu corrompu ou sans jeton', () => {
    expect(parseStoredSession('pas du json')).toBeNull();
    expect(parseStoredSession('null')).toBeNull();
    expect(parseStoredSession('{"token":"   "}')).toBeNull();
    expect(parseStoredSession(null)).toBeNull();
  });

  it('invalide une session obtenue par une AUTRE version du client', () => {
    // Le serveur a pu durcir son contrat entre deux versions : on ne réutilise
    // pas un jeton étiqueté par une version qu'on ne connaît pas.
    const foreign = JSON.stringify({ ...validStored, client: 'mobile/0.9.0' });
    expect(parseStoredSession(foreign)).toBeNull();
  });

  it('accepte une session de la version courante et un jeton sans étiquette', () => {
    expect(parseStoredSession(serializeSession(validStored))?.token).toBe('jeton-abc');
    expect(parseStoredSession(JSON.stringify(validStored))?.token).toBe('jeton-abc');
  });

  it('signale une erreur de lecture sans bloquer l’application', async () => {
    const backend = {
      get: async () => { throw new Error('Keychain indisponible'); },
      set: async () => {}, remove: async () => {},
    };
    const loaded = await loadSession(backend);
    expect(loaded.session).toBeNull();
    expect(loaded.storageError).toContain('Keychain');
  });

  it('détecte une session périmée sans appeler le serveur', () => {
    expect(isExpired({ ...validStored, expiresAt: '2020-01-01T00:00:00.000Z' })).toBe(true);
    expect(isExpired({ ...validStored, expiresAt: '2030-01-01T00:00:00.000Z' })).toBe(false);
    // Pas de date annoncée : on ne décide pas à la place du serveur.
    expect(isExpired({ ...validStored, expiresAt: '' })).toBe(false);
  });
});

/* ── 3. Lecture stricte des réponses ───────────────────────────────────────── */

describe('lecture des réponses du serveur', () => {
  it('lit un compte complet', () => {
    const account = parseAccount({
      id: 42, displayName: 'Amine', email: 'a@b.tn', phone: '+21620123456', avatarUrl: '',
      emailVerified: false, phoneVerified: 1, status: 'ACTIVE', locale: 'fr-TN', marketingOptIn: false,
    });
    expect(account.id).toBe('42');
    expect(account.phoneVerified).toBe(true);
    expect(account.emailVerified).toBe(false);
  });

  it('refuse un compte sans identifiant', () => {
    expect(() => parseAccount({ displayName: 'Amine' })).toThrow(/identifiant/);
    expect(() => parseAccount(null)).toThrow(/illisible/);
  });

  it('lit les capacités du serveur et considère le reste comme éteint', () => {
    const config = parseAuthConfig({ phoneOtp: { enabled: true }, email: { enabled: true } });
    expect(config).toEqual({ phoneOtp: true, email: true, google: false, facebook: false, apple: false, passwordReset: false, emailCode: false, googleNative: false });
    expect(parseAuthConfig(undefined).phoneOtp).toBe(false);
    expect(parseAuthConfig({ emailCode: { enabled: true } }).emailCode).toBe(true);
  });

  it('lit le défi e-mail : identifiant obligatoire, adresse masquée, délai de 10 min par défaut', () => {
    const challenge = parseEmailCodeChallenge({ challengeId: 'ecode_1', maskedEmail: 'ah***@gm***.com' });
    expect(challenge).toEqual({ challengeId: 'ecode_1', maskedEmail: 'ah***@gm***.com', expiresInSeconds: 600, developmentCode: '' });
    expect(() => parseEmailCodeChallenge({ maskedEmail: 'x' })).toThrow(/identifiant manquant/);
    expect(() => parseEmailCodeChallenge(null)).toThrow(/illisible/);
  });

  it('ne considère pas une session sans jeton comme valide', () => {
    const issue = parseSessionIssue({ account: { id: 1 }, csrfToken: 'c' });
    expect(issue.sessionToken).toBe('');
    expect(issue.expiresAt).toBe('');
  });

  it('préfère la date d’expiration mobile et retombe sur expiresAt', () => {
    const withMobile = parseSessionIssue({
      account: { id: 1 }, csrfToken: 'c', session_token: 't',
      session_expires_at: '2026-12-01T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z',
    });
    expect(withMobile.expiresAt).toBe('2026-12-01T00:00:00.000Z');
    const withoutMobile = parseSessionIssue({ account: { id: 1 }, expiresAt: '2026-11-01T00:00:00.000Z' });
    expect(withoutMobile.expiresAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('refuse un défi SMS sans identifiant', () => {
    expect(() => parseOtpChallenge({ maskedPhone: '+216 ** *** 56' })).toThrow(/identifiant/);
    const challenge = parseOtpChallenge({ challengeId: 'otp_1', maskedPhone: 'x', developmentCode: '123456' });
    expect(challenge.expiresInSeconds).toBe(300);
    expect(challenge.developmentCode).toBe('123456');
  });

  it('ignore une commande illisible au lieu de la moitié d’une ligne', () => {
    expect(parseRecentOrder({ order_number: 'AYR-1' })).toBeNull();
    expect(parseRecentOrder({ id: 'o1', total_tnd: '12.5', item_count: 2 })?.totalTnd).toBe(12.5);
  });

  it('lit la synthèse de compte avec des compteurs à zéro par défaut', () => {
    const overview = parseOverview({ account: { id: 7 }, counts: { orders: 3 }, recentOrders: [{ id: 'o1' }, { nonsense: true }] });
    expect(overview.counts.orders).toBe(3);
    expect(overview.counts.favorites).toBe(0);
    expect(overview.recentOrders).toHaveLength(1);
  });
});

/* ── 4. Appels réseau ──────────────────────────────────────────────────────── */

describe('appels du compte', () => {
  it('demande un code SMS et expose le défi', async () => {
    const fetchMock = respond(() => json({
      success: true,
      data: { challengeId: 'otp_1', maskedPhone: '+216 20 ** *** 56', expiresInSeconds: 300, developmentCode: '654321' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const challenge = await requestOtp('20 123 456');
    expect(challenge.challengeId).toBe('otp_1');
    expect(challenge.developmentCode).toBe('654321');
    const call = lastCall(fetchMock);
    expect(call.url).toBe(`${API_BASE_URL}/api/customer/auth/otp/request`);
    expect(call.headers['x-ayrovi-client']).toBe(CLIENT_HEADER);
    expect(JSON.parse(String(call.init.body))).toEqual({ phone: '20 123 456' });
  });

  it('valide le code et récupère le jeton mobile', async () => {
    const fetchMock = respond(() => json({
      success: true,
      data: {
        account: { id: 1, displayName: 'Amine', phone: '+21620123456' },
        csrfToken: 'csrf-1',
        session_token: 'jeton-1',
        session_expires_at: '2026-12-01T00:00:00.000Z',
        linkedHistoricalOrders: 2,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const issue = await verifyOtp('otp_1', '654321');
    expect(issue.sessionToken).toBe('jeton-1');
    expect(issue.csrfToken).toBe('csrf-1');
    expect(issue.linkedHistoricalOrders).toBe(2);
    expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({ challengeId: 'otp_1', code: '654321' });
  });

  it('crée un compte avec la langue de l’appareil et l’acceptation des conditions', async () => {
    const fetchMock = respond(() => json({ success: true, data: { account: { id: 9 }, csrfToken: 'c', session_token: 't' } }));
    vi.stubGlobal('fetch', fetchMock);

    await emailRegister({ displayName: 'Amine', email: 'a@b.tn', password: 'MotDePasse2026!', locale: 'ar', marketingOptIn: true });
    const body = JSON.parse(String(lastCall(fetchMock).init.body));
    expect(body).toMatchObject({ locale: 'ar', termsAccepted: true, marketingOptIn: true });
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/auth/email/register`);
  });

  it('connecte par e-mail', async () => {
    const fetchMock = respond(() => json({ success: true, data: { account: { id: 1 }, csrfToken: 'c', session_token: 't' } }));
    vi.stubGlobal('fetch', fetchMock);
    const issue = await emailLogin('a@b.tn', 'MotDePasse2026!');
    expect(issue.account.id).toBe('1');
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/auth/email/login`);
  });

  it('traite un 401 de /auth/me comme « pas connecté », pas comme une panne', async () => {
    vi.stubGlobal('fetch', respond(() => json({ success: false, code: 'AUTH_REQUIRED', error: 'Non authentifié.' }, 401)));
    expect(await fetchMe()).toBeNull();
  });

  it('ne confond pas une panne serveur avec une session absente', async () => {
    // Sinon l'application effacerait un jeton valide parce que le réseau a hoqueté.
    vi.stubGlobal('fetch', respond(() => json({ success: false, code: 'INTERNAL_ERROR', error: 'boom' }, 500)));
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network request failed'); }));
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'network' });
  });

  it('envoie le CSRF en se déconnectant', async () => {
    const fetchMock = respond(() => json({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    setAuthContext({ token: 'jeton-1', csrfToken: 'csrf-1' });

    await logout();
    const call = lastCall(fetchMock);
    expect(call.url).toBe(`${API_BASE_URL}/api/customer/auth/logout`);
    expect(call.headers['x-csrf-token']).toBe('csrf-1');
    expect(call.headers.Authorization).toBe('Bearer jeton-1');
  });

  it('lit la synthèse et la liste des commandes', async () => {
    vi.stubGlobal('fetch', respond((url) => json({
      success: true,
      data: url.includes('/overview')
        ? { account: { id: 1 }, counts: { orders: 2 }, totalSpent: 199.5, recentOrders: [] }
        : [{ id: 'o1', order_number: 'AYR-1', status: 'CONFIRMED', total_tnd: 99.5, item_count: 1 }],
    })));
    expect((await fetchOverview()).totalSpent).toBe(199.5);
    expect((await fetchOrders())[0].orderNumber).toBe('AYR-1');
  });
});

/* ── 5. Messages d'erreur ──────────────────────────────────────────────────── */

describe('messages d’erreur', () => {
  it('traduit les codes du serveur en clés de dictionnaire', () => {
    expect(authMessage(new ApiError('http', 'x', { status: 400, code: 'OTP_INVALID' }))).toEqual({ key: 'auth.error.otpInvalid' });
    expect(authMessage(new ApiError('http', 'x', { status: 409, code: 'EMAIL_TAKEN' }))).toEqual({ key: 'auth.error.emailTaken' });
    expect(authMessage(new ApiError('http', 'x', { status: 429, code: 'RATE_LIMITED' }))).toEqual({ key: 'auth.error.rateLimited' });
  });

  it('utilise le contexte de l’écran quand le serveur ne code pas son refus', () => {
    expect(authMessage(new ApiError('http', 'Numéro invalide', { status: 400 }), 'auth.error.phone'))
      .toEqual({ key: 'auth.error.phone' });
    // Sans contexte, on ne devine pas : message réseau générique.
    expect(authMessage(new ApiError('http', 'Refus', { status: 400 }))).toHaveProperty('fr');
  });

  it('خادم قديم (بلا `session_token`) ⇒ السبب بالحرف، موش «فشل الطلب»', () => {
    // هذا اللي يصير مع خادم ما يعرفش `x-ayrovi-client`: يرجّع كوكي للمتصفّح
    // وما يرجّعش توكِن للتطبيق. المستعمل لازم يقرا السبب والعلاج.
    const oldServer = new ApiError('malformed', 'session_token absent', { code: 'SESSION_NOT_ISSUED' });
    expect(authMessageForCode('SESSION_NOT_ISSUED')).toBe('auth.error.noSession');
    expect(authMessage(oldServer)).toEqual({ key: 'auth.error.noSession' });

    const message = translate('ar', 'auth.error.noSession');
    expect(message).toContain('الخادم');
    expect(message).toContain('يتحدّث');
  });

  it('parle de réseau quand le serveur n’a rien répondu', () => {
    const message = authMessage(new ApiError('network', 'offline'));
    expect(message).toHaveProperty('ar');
    expect((message as { fr: string }).fr).toMatch(/connexion/i);
  });

  it('حالة الجلسة ما ترمي خطأً عاماً بلا كود (السبب يضيع)', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/state/session.tsx', import.meta.url)), 'utf8');
    expect(source).toContain("code: 'SESSION_NOT_ISSUED'");
    expect(source).not.toContain("new Error('Le serveur n’a pas ouvert de session");
  });
});
