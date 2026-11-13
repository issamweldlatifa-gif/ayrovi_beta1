/**
 * Jeton de session invité (13/11) : au premier lancement, plusieurs écrans
 * demandent l'identifiant en même temps. Ils doivent TOUS recevoir le même,
 * sinon le panier se construit sur une session et l'écran voisin en lit une autre.
 */
const mockStore = new Map<string, string>();
let mockUuid = 0;
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => new Promise((resolve) => setTimeout(() => resolve(mockStore.get(key) ?? null), 5)),
    setItem: (key: string, value: string) => new Promise<void>((resolve) => setTimeout(() => { mockStore.set(key, value); resolve(); }, 5)),
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}`,
}));

beforeEach(() => {
  mockStore.clear();
  mockUuid = 0;
  jest.resetModules();
});

it('appels simultanés au premier lancement : un seul identifiant, généré une seule fois', async () => {
  const { getSessionId, SESSION_KEY } = require('@/session/session');
  const ids = await Promise.all([getSessionId(), getSessionId(), getSessionId()]);
  expect(new Set(ids).size).toBe(1);
  expect(mockUuid).toBe(1);
  expect(mockStore.get(SESSION_KEY)).toBe(ids[0]);
  expect(await getSessionId()).toBe(ids[0]);
  expect(mockUuid).toBe(1);
});

it('un identifiant déjà stocké est relu tel quel', async () => {
  const first = require('@/session/session');
  const id = await first.getSessionId();
  jest.resetModules();
  const second = require('@/session/session');
  expect(await Promise.all([second.getSessionId(), second.getSessionId()])).toEqual([id, id]);
  expect(mockUuid).toBe(1);
});
