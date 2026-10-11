/**
 * SONIM — historique des discussions.
 *
 * Deux règles, et elles commandent tout le fichier :
 *
 * 1. **Le titre vient de la première question, jamais inventé.** Un historique
 *    titré « Nouvelle discussion » pour tout le monde est un historique inutile ;
 *    un titre résumé par une formule toute faite (« Votre question sur… »)
 *    serait un mensonge de plus. On coupe la vraie phrase.
 *
 * 2. **Le tri et la coupe sont des fonctions pures**, testables sans appareil ni
 *    AsyncStorage : le stockage n'est qu'un paramètre. Ce qui mérite un test,
 *    c'est la décision (« garder les N plus récentes »), pas l'écriture.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SonimMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface SonimThread {
  /** Identifiant de conversation — le même que celui envoyé au serveur. */
  id: string;
  title: string;
  updatedAt: number;
  messages: SonimMessage[];
}

/** Une clé versionnée : changer de format ne doit jamais relire l'ancien. */
export const SONIM_HISTORY_KEY = 'ayrovi.sonim.history.v1';

/** Plafond de conservation. Au-delà, les PLUS ANCIENNES sortent. */
export const SONIM_HISTORY_LIMIT = 30;

/**
 * Titre tiré du premier message de la personne.
 *
 * `''` quand il n'y a rien à dire : l'appelant affiche alors une formulation
 * neutre, au lieu d'un titre fabriqué.
 */
export function sonimTitle(messages: SonimMessage[]): string {
  const first = messages.find((message) => message.role === 'user' && message.text.trim().length > 0);
  if (!first) return '';
  const flat = first.text.replace(/\s+/g, ' ').trim();
  // On coupe sur un espace pour ne pas tronquer un mot en plein milieu.
  if (flat.length <= 48) return flat;
  const cut = flat.slice(0, 48);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Les plus récentes d'abord, plafonnées à `max`. N'altère pas l'entrée. */
export function pruneSonimThreads(threads: SonimThread[], max = SONIM_HISTORY_LIMIT): SonimThread[] {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : SONIM_HISTORY_LIMIT;
  return [...threads]
    .filter((thread) => Boolean(thread?.id))
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
    .slice(0, limit);
}

/**
 * Inscrit (ou remet à jour) une conversation.
 *
 * Le remplacement se fait PAR IDENTIFIANT : reprendre une ancienne discussion
 * puis continuer à écrire dedans ne doit pas créer un doublon.
 */
export function upsertSonimThread(threads: SonimThread[], thread: SonimThread, max = SONIM_HISTORY_LIMIT): SonimThread[] {
  const others = threads.filter((item) => item.id !== thread.id);
  return pruneSonimThreads([thread, ...others], max);
}

/** Le minimum de stockage dont on a besoin — injectable, donc testable. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null | undefined>;
  setItem(key: string, value: string): Promise<unknown> | unknown;
}

/**
 * Lecture tolérante : un historique illisible n'est pas une panne, c'est un
 * historique vide. Faire échouer l'ouverture de l'écran parce qu'un JSON
 * ancien traîne serait disproportionné.
 */
export async function loadSonimThreads(
  store: KeyValueStore = AsyncStorage,
  key = SONIM_HISTORY_KEY,
): Promise<SonimThread[]> {
  try {
    const raw = await store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneSonimThreads(
      parsed.filter((item): item is SonimThread => {
        const thread = item as SonimThread | null;
        return Boolean(thread && typeof thread.id === 'string' && Array.isArray(thread.messages));
      }),
    );
  } catch {
    return [];
  }
}

export async function saveSonimThreads(
  threads: SonimThread[],
  store: KeyValueStore = AsyncStorage,
  key = SONIM_HISTORY_KEY,
): Promise<void> {
  try {
    await store.setItem(key, JSON.stringify(pruneSonimThreads(threads)));
  } catch {
    // Historique non persistant : la discussion en cours ne dépend pas de lui,
    // on continue sans rien signaler plutôt que d'interrompre une réponse.
  }
}
