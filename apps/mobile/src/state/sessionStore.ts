/**
 * Trousseau de session — où vit le jeton entre deux lancements.
 *
 * Règle du projet (PLAN.md §5) : un jeton de session ne va JAMAIS dans
 * AsyncStorage — c'est un fichier en clair, lisible par toute sauvegarde
 * automatique du système. Il va dans le trousseau de l'appareil
 * (`expo-secure-store` : Keychain sur iOS, Keystore sur Android).
 *
 * Trois situations réelles à couvrir sans mentir :
 *   1. appareil normal   → SecureStore, lecture/écriture réelles ;
 *   2. aperçu web (dev)  → SecureStore n'existe pas ; on le DIT (`isSecure:
 *      false`) et on range dans AsyncStorage, uniquement parce qu'un aperçu de
 *      développement ne contient aucune donnée client réelle ;
 *   3. stockage HS       → on ne bloque pas la connexion en cours ; la session
 *      vit en mémoire jusqu'à la fermeture, et l'appelant sait pourquoi.
 *
 * Le module est écrit pour être testé sans moteur React Native : le support est
 * injecté (`backend`).
 */
import { CLIENT_HEADER } from '@/api/config';

export interface StoredSession {
  /** Jeton de session remis par le serveur (`session_token`). */
  token: string;
  /** Jeton CSRF à présenter sur les écritures. */
  csrfToken: string;
  /** Date ISO annoncée par le serveur (chaîne vide si non annoncée). */
  expiresAt: string;
  /** Nom affiché — pour peindre l'écran Compte avant le retour du réseau. */
  displayName: string;
}

export const SESSION_STORAGE_KEY = 'ayrovi.session.v1';

/** Ce que le trousseau doit savoir faire. `null` = lecture demandée, rien stocké. */
export interface SecureBackend {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export interface LoadedSession {
  session: StoredSession | null;
  /**
   * `false` quand le jeton est rangé ailleurs que dans le trousseau (aperçu web)
   * ou nulle part (stockage indisponible) : l'interface peut le signaler.
   */
  isSecure: boolean;
  /** Horodatage de la dernière écriture, si le backend en fournit un. */
  storageError: string;
}

const emptySession = (): StoredSession => ({ token: '', csrfToken: '', expiresAt: '', displayName: '' });

/** Relit un objet stocké sans jamais faire confiance à sa forme. */
export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // Contenu corrompu : on repart d'un visiteur, jamais d'un jeton à moitié lu.
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const row = parsed as Record<string, unknown>;
  const token = typeof row.token === 'string' ? row.token.trim() : '';
  if (!token) return null;
  // Le jeton vient de nous : il doit être étiqueté pour la version de client qui
  // l'a obtenu. Une déclaration changée invalide la session (le serveur a pu
  // durcir son contrat entre deux versions).
  const version = typeof row.client === 'string' ? row.client : '';
  if (version && version !== CLIENT_HEADER) return null;
  return {
    token,
    csrfToken: typeof row.csrfToken === 'string' ? row.csrfToken : '',
    expiresAt: typeof row.expiresAt === 'string' ? row.expiresAt : '',
    displayName: typeof row.displayName === 'string' ? row.displayName : '',
  };
}

export function serializeSession(session: StoredSession): string {
  return JSON.stringify({ ...session, client: CLIENT_HEADER });
}

/** Vrai si la date annoncée est passée — inutile d'aller au serveur pour ça. */
export function isExpired(session: StoredSession, now = Date.now()): boolean {
  if (!session.expiresAt) return false;
  const at = Date.parse(session.expiresAt);
  return Number.isFinite(at) && at <= now;
}

export async function saveSession(backend: SecureBackend, session: StoredSession): Promise<void> {
  await backend.set(SESSION_STORAGE_KEY, serializeSession(session));
}

export async function loadSession(backend: SecureBackend): Promise<LoadedSession> {
  try {
    const session = parseStoredSession(await backend.get(SESSION_STORAGE_KEY));
    return { session, isSecure: true, storageError: '' };
  } catch (error) {
    return { session: null, isSecure: true, storageError: String((error as Error)?.message || error) };
  }
}

export async function clearSession(backend: SecureBackend): Promise<void> {
  try {
    await backend.remove(SESSION_STORAGE_KEY);
  } catch {
    // Un effacement qui échoue ne doit pas empêcher la déconnexion : la session
    // est de toute façon révoquée côté serveur, et le contexte en mémoire vidé.
  }
}

/**
 * Trousseau réel de l'appareil. Les imports sont faits ICI, dans une fonction
 * chargée à la demande : la couche de session reste testable en Node et un
 * aperçu web ne casse pas au chargement du module.
 */
export async function openSecureBackend(): Promise<{ backend: SecureBackend; isSecure: boolean }> {
  try {
    const SecureStore = await import('expo-secure-store');
    const available = await SecureStore.isAvailableAsync();
    if (available) {
      return {
        isSecure: true,
        backend: {
          get: (key) => SecureStore.getItemAsync(key),
          set: (key, value) => SecureStore.setItemAsync(key, value),
          remove: (key) => SecureStore.deleteItemAsync(key),
        },
      };
    }
  } catch {
    // SecureStore absent (aperçu web) : on continue vers le repli.
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return {
    // Repli assumé : l'aperçu web n'a pas de trousseau. Il n'est jamais livré
    // comme application — `isSecure: false` remonte jusqu'à l'écran Compte.
    isSecure: false,
    backend: {
      get: (key) => AsyncStorage.getItem(key),
      set: (key, value) => AsyncStorage.setItem(key, value),
      remove: (key) => AsyncStorage.removeItem(key),
    },
  };
}

/** Trousseau en mémoire — pour les tests et le cas « stockage indisponible ». */
export function memoryBackend(initial: Record<string, string> = {}): SecureBackend & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
}
