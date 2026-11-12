/**
 * Compte — appareils connectés et confirmation de l'adresse (12/11/2026).
 * Contrat serveur : tests/customer-account-security-2026-11-12.test.ts (racine).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthContext, setAuthContext } from '../src/api/client';
import { API_BASE_URL, CLIENT_HEADER } from '../src/api/config';
import {
  confirmEmailVerification, fetchDeviceSessions, logoutOtherDevices, parseDeviceSessions,
  parseEmailVerificationChallenge, requestEmailVerification, revokeDeviceSession,
} from '../src/api/account';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const mockFetch = (body: unknown) => {
  const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => json(body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const last = (mock: ReturnType<typeof mockFetch>) => {
  const [url, init] = mock.mock.calls[mock.mock.calls.length - 1];
  return { url: String(url), init: (init ?? {}) as RequestInit };
};

beforeEach(() => {
  vi.unstubAllGlobals();
  resetAuthContext();
  setAuthContext({ clientHeader: CLIENT_HEADER, token: 'jeton-1', csrfToken: 'csrf-1' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('appareils connectés', () => {
  it('lecture défensive, appareil courant en tête', () => {
    const rows = parseDeviceSessions([
      { handle: 'h-2', current: false, platform: 'Android', client: 'Application ZAYROVI', ipMasked: '196.203.x.x', lastSeenAt: '2026-11-12T10:00:00Z' },
      { handle: 'h-1', current: true, platform: 'iPhone', client: 'Safari' },
      { current: true }, null, 'x',
    ]);
    expect(rows.map((row) => row.handle)).toEqual(['h-1', 'h-2']);
    expect(rows[1]).toMatchObject({ platform: 'Android', ipMasked: '196.203.x.x', current: false });
    expect(parseDeviceSessions({})).toEqual([]);
  });

  it('GET liste, DELETE un appareil, POST logout-all (autres seulement)', async () => {
    let fetchMock = mockFetch({ success: true, data: [{ handle: 'abc', current: true }] });
    expect(await fetchDeviceSessions()).toHaveLength(1);
    expect(last(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/sessions`);

    fetchMock = mockFetch({ success: true, data: { revoked: 1 } });
    await revokeDeviceSession('a/b');
    expect(last(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/sessions/a%2Fb`);
    expect(last(fetchMock).init.method).toBe('DELETE');

    fetchMock = mockFetch({ success: true, data: { revoked: 3, currentKept: true } });
    expect(await logoutOtherDevices()).toBe(3);
    expect(last(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/auth/logout-all`);
    expect(JSON.parse(String(last(fetchMock).init.body))).toEqual({ includeCurrent: false });
  });
});

describe('confirmation de l’adresse', () => {
  it('demande puis confirmation, code nettoyé', async () => {
    expect(parseEmailVerificationChallenge({ alreadyVerified: true })).toMatchObject({ alreadyVerified: true, challengeId: '' });
    let fetchMock = mockFetch({ success: true, data: { challengeId: 'everify_1', maskedEmail: 'c***@example.com', expiresInSeconds: 900 } });
    const sent = await requestEmailVerification('ar');
    expect(sent).toMatchObject({ challengeId: 'everify_1', maskedEmail: 'c***@example.com', expiresInSeconds: 900, developmentCode: '' });
    expect(last(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/email/verification/request`);

    fetchMock = mockFetch({ success: true, data: { emailVerified: true } });
    expect(await confirmEmailVerification('everify_1', '12 34 56', 'fr')).toBe(true);
    expect(JSON.parse(String(last(fetchMock).init.body))).toEqual({ challengeId: 'everify_1', code: '123456', locale: 'fr' });
  });
});

describe('écran Sécurité', () => {
  const screen = readFileSync(fileURLToPath(new URL('../app/account/security.tsx', import.meta.url)), 'utf8');
  it('liste les appareils et propose de fermer les autres', () => {
    expect(screen).toContain("queryKey: ['account', 'sessions']");
    expect(screen).toContain('testID="security-logout-others"');
    expect(screen).toContain('revokeDeviceSession(handle)');
  });
  it('carte de confirmation seulement si l’adresse existe et n’est pas confirmée', () => {
    expect(screen).toContain('!security.data.emailVerified && accountEmail');
    expect(screen).toContain('textContentType="oneTimeCode"');
  });
});
