import { beforeEach, expect, test, vi } from 'vitest';
import { loadSession, openSecureBackend, PENDING_REVOKE_KEY, saveSession, SESSION_STORAGE_KEY } from '../src/state/sessionStore';

const { available, removeLegacy, deviceGet, deviceSet, deviceRemove } = vi.hoisted(() => ({
  available: vi.fn(), removeLegacy: vi.fn(), deviceGet: vi.fn(), deviceSet: vi.fn(), deviceRemove: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: available, getItemAsync: deviceGet, setItemAsync: deviceSet, deleteItemAsync: deviceRemove,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { multiRemove: removeLegacy } }));

const session = { token: 'fixture-session', csrfToken: 'fixture-csrf', expiresAt: '', displayName: 'Client' };
beforeEach(() => { vi.resetAllMocks(); });

test('keeps credentials in memory only if the device keystore is unavailable', async () => {
  available.mockResolvedValue(false);
  const { backend, isSecure } = await openSecureBackend();
  expect(isSecure).toBe(false);
  await saveSession(backend, session);
  expect((await loadSession(backend)).session).toEqual(session);
  expect((await loadSession((await openSecureBackend()).backend)).session).toBeNull();
  expect(removeLegacy).toHaveBeenCalledWith([SESSION_STORAGE_KEY, PENDING_REVOKE_KEY]);
  expect(deviceSet).not.toHaveBeenCalled();
});

test('uses the device keystore even if cleanup of the old fallback failed', async () => {
  available.mockResolvedValue(true);
  removeLegacy.mockRejectedValue(new Error('Storage unavailable'));
  const { backend, isSecure } = await openSecureBackend();
  expect(isSecure).toBe(true);
  await saveSession(backend, session);
  expect(deviceSet).toHaveBeenCalledWith(SESSION_STORAGE_KEY, expect.stringContaining('fixture-session'));
});
