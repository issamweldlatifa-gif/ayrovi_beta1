/**
 * SCRAPER — COURSE DE SONDES PARALLÈLES (05/10/2026).
 *
 * Pourquoi ce module : la lecture d'une fiche marchande essayait ses sources
 * UNE PAR UNE (mobile → bureau → lecteur → rendu payant). Sur une fiche où la
 * première sonde échoue — cas mesuré d'Amazon qui sert une coquille aux IP de
 * centre de données — le client attendait la somme des budgets : 7 s + 6 s +
 * 18 s + 18 s ≈ 49 s, et « plus de vingt secondes » avant de voir un produit
 * chiffré. Or ces sondes sont INDÉPENDANTES : rien n'oblige à attendre la
 * première pour lancer la seconde.
 *
 * Contrat de cette course :
 *  • toutes les sondes partent ensemble (une sonde peut être différée d'un
 *    `delayMs` : on ne dépense pas un appel externe si une sonde rapide gagne) ;
 *  • la PREMIÈRE sonde qui remplit `isWinner` gagne ; les autres sont annulées
 *    immédiatement (aucune socket laissée ouverte, aucun budget gaspillé) ;
 *  • un budget global borne l'attente : passé ce délai, les sondes en cours sont
 *    annulées et l'appelant reçoit l'état réel (gagnant ou meilleur repli) ;
 *  • un résultat non gagnant mais exploitable est conservé comme repli, dans
 *    l'ordre de priorité des sondes — jamais inventé ;
 *  • les échecs sont conservés avec leur code : l'appelant garde la trace qu'il
 *    exposait déjà (`DIRECT_HTTP_403`, `RENDER_TIMEOUT`, …).
 *
 * Aucune décision métier ici : ce module ne dit pas quel prix est vrai, il dit
 * seulement quelle sonde a répondu en premier.
 */

export interface ProbeAttempt<T> {
  /** Identité de la sonde (journalisation, priorité du repli). */
  id: string;
  /** Budget propre à cette sonde. */
  timeoutMs: number;
  /** Départ différé : 0 = immédiat. */
  delayMs?: number;
  /** La sonde reçoit un signal annulé dès qu'une autre a gagné (ou au budget global). */
  run: (signal: AbortSignal) => Promise<T | null>;
}

export interface ProbeFailure {
  id: string;
  error: string;
  timedOut: boolean;
}

export interface ProbeOutcome<T> {
  /** Première sonde satisfaisant `isWinner`. */
  winner: { id: string; value: T } | null;
  /** Meilleur résultat non gagnant, dans l'ordre de priorité des sondes. */
  fallback: { id: string; value: T } | null;
  failures: ProbeFailure[];
  elapsedMs: number;
  /** Budget global atteint avant qu'une sonde n'ait gagné. */
  budgetExceeded: boolean;
}

export interface ProbeRaceOptions<T> {
  isWinner: (value: T) => boolean;
  /** Borne dure de l'attente (ms) ; 0/absent = pas de borne globale. */
  budgetMs?: number;
}

function clampTimeout(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return 5_000;
  return Math.min(60_000, Math.max(250, Number(value)));
}

/**
 * Lance toutes les sondes et rend la première réponse gagnante.
 * Ne rejette jamais : chaque échec est rendu dans `failures`.
 */
export async function raceProbes<T>(
  attempts: ProbeAttempt<T>[],
  options: ProbeRaceOptions<T>,
): Promise<ProbeOutcome<T>> {
  const startedAt = Date.now();
  const failures: ProbeFailure[] = [];
  let fallback: { id: string; value: T } | null = null;
  let winner: { id: string; value: T } | null = null;
  let budgetExceeded = false;
  let settled = false;

  const controllers = attempts.map(() => new AbortController());
  /** Annule les sondes encore en vol (gagnant trouvé ou budget épuisé). */
  const abortPending = (exceptIndex = -1): void => {
    controllers.forEach((controller, index) => {
      if (index !== exceptIndex && !controller.signal.aborted) controller.abort();
    });
  };

  return new Promise<ProbeOutcome<T>>((resolve) => {
    let remaining = attempts.length;
    let budgetTimer: NodeJS.Timeout | null = null;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (budgetTimer) clearTimeout(budgetTimer);
      resolve({ winner, fallback, failures, elapsedMs: Date.now() - startedAt, budgetExceeded });
    };

    const settleOne = (): void => {
      remaining -= 1;
      if (winner || remaining <= 0) finish();
    };

    if (!attempts.length) {
      finish();
      return;
    }

    const budgetMs = Number(options.budgetMs || 0);
    if (Number.isFinite(budgetMs) && budgetMs > 0) {
      budgetTimer = setTimeout(() => {
        budgetExceeded = !winner;
        abortPending(winner ? attempts.findIndex((attempt) => attempt.id === winner!.id) : -1);
        finish();
      }, budgetMs);
      budgetTimer.unref?.();
    }

    attempts.forEach((attempt, index) => {
      const controller = controllers[index];
      const timeoutMs = clampTimeout(attempt.timeoutMs);
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = AbortSignal.any([controller.signal, timeoutSignal]);
      const start = (): void => {
        if (settled) {
          settleOne();
          return;
        }
        void Promise.resolve()
          .then(() => attempt.run(signal))
          .then((value) => {
            if (value != null) {
              if (options.isWinner(value)) {
                if (!winner) {
                  winner = { id: attempt.id, value };
                  abortPending(index);
                }
              } else if (!fallback) {
                // Ordre de priorité des sondes = ordre d'arrivée attendu du meilleur
                // repli (mobile, bureau, lecteur, …) : on garde le premier exploitable.
                fallback = { id: attempt.id, value };
              }
            }
            settleOne();
          })
          .catch((error: unknown) => {
            failures.push({
              id: attempt.id,
              error: String((error as Error)?.message || error || 'PROBE_FAILED').slice(0, 120),
              timedOut: timeoutSignal.aborted || (error as Error)?.name === 'TimeoutError',
            });
            settleOne();
          });
      };
      const delayMs = Math.max(0, Number(attempt.delayMs || 0));
      if (delayMs > 0) {
        const timer = setTimeout(start, delayMs);
        timer.unref?.();
      } else {
        start();
      }
    });
  });
}
