/**
 * COUPE-CIRCUIT PAR HÔTE (01/10/2026).
 *
 * Un marchand qui bloque nos lectures (403, bot-wall, timeout répété) ne doit
 * pas payer une sonde à chaque recherche : après quelques échecs consécutifs,
 * l'hôte est mis de côté pour une durée fixe. Rien n'est deviné — une fiche
 * dont l'hôte est au repos reste simplement telle quelle, sans badge inventé.
 *
 * État en mémoire, volontairement : une sonde par processus suffit à protéger
 * le fournisseur, et un redémarrage efface une panne déjà oubliée.
 */

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 10 * 60 * 1000;      // 10 min de repos après 3 échecs
/** Deux échecs espacés de plus d'une heure ne racontent pas la même panne. */
const FAILURE_WINDOW_MS = 60 * 60 * 1000;
const MAX_HOSTS = 500;                    // borne : pas de fuite mémoire

interface HostState { failures: number; openUntil: number; lastFailureAt: number; }

const hosts = new Map<string, HostState>();

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** L'hôte est-il reposé ? (faux = ne pas lancer de lecture) */
export function hostAllowsProbe(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const state = hosts.get(host);
  if (!state) return true;
  return state.openUntil <= Date.now();
}

/** Succès : le compteur retombe à zéro, l'hôte redevient sondable. */
export function recordProbeSuccess(url: string): void {
  const host = hostOf(url);
  if (!host) return;
  hosts.delete(host);
}

/**
 * Échec : au seuil atteint, l'hôte est mis au repos. Les échecs ESPACÉS ne
 * comptent pas — une panne passagère d'il y a une heure n'est pas une panne.
 */
export function recordProbeFailure(url: string): void {
  const host = hostOf(url);
  if (!host) return;
  const now = Date.now();
  const state = hosts.get(host);
  const recent = state ? now - state.lastFailureAt <= FAILURE_WINDOW_MS : false;
  const failures = recent ? state!.failures + 1 : 1;
  if (failures >= FAILURE_THRESHOLD) {
    if (hosts.size >= MAX_HOSTS) hosts.delete(hosts.keys().next().value as string);
    hosts.set(host, { failures, openUntil: now + COOLDOWN_MS, lastFailureAt: now });
    return;
  }
  if (hosts.size >= MAX_HOSTS) return;
  hosts.set(host, { failures, openUntil: 0, lastFailureAt: now });
}

/** Vue de test/diagnostic : quels hôtes sont au repos, et jusqu'à quand. */
export function probeCooldowns(): Array<{ host: string; openUntil: number }> {
  const now = Date.now();
  return [...hosts.entries()]
    .filter(([, state]) => state.openUntil > now)
    .map(([host, state]) => ({ host, openUntil: state.openUntil }));
}

/** Remise à zéro (tests uniquement). */
export function resetProbeState(): void {
  hosts.clear();
}
