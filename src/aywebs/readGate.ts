/**
 * AYWEBs — PORTE DE LECTURE MARCHANDE (« Phase 1 », 06/10/2026).
 *
 * ── LE RISQUE RÉEL ──────────────────────────────────────────────────────────
 * AYWEBs partage son processus avec le reste d'AYROVI (Express, admin, ERP,
 * paiements). Une lecture marchande, c'est un `fetch` de 700 Ko à 1,9 Mo suivi
 * d'une analyse DOM complète. Mesure du 06/10/2026 : ~21 s de CPU pour 20
 * lectures. Rien ne bornait le nombre de lectures simultanées : cent requêtes
 * simultanées = cent analyses DOM en parallèle dans le même fil d'exécution.
 *
 * ── CE QUE FAIT CETTE PORTE ─────────────────────────────────────────────────
 * Un sémaphore FIFO : au plus `AYWEBS_READ_CONCURRENCY` lectures à la fois
 * (défaut 3), les autres attendent leur tour. La porte ne refuse JAMAIS une
 * lecture : au-delà de `AYWEBS_READ_GATE_MAX_WAIT_MS` (défaut 20 s) d'attente,
 * l'appel passe sans créneau (compté `bypassed`) — préférable à une panne
 * fabriquée par le régulateur lui-même. Les compteurs sont exposés dans
 * `/health` (§46 : état réel, jamais estimé).
 *
 * Pourquoi pas des workers threads tout de suite ? parce que le bundle serveur
 * est un fichier unique produit par esbuild (voir `build:server`) : un worker
 * séparé demande une seconde cible de build et une gestion de cycle de vie. La
 * porte apporte l'essentiel de la protection sans ce risque ; les workers sont
 * planifiés en Phase 2 avec, à ce moment-là, une mesure qui justifie leur coût.
 */

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 16;
const DEFAULT_MAX_WAIT_MS = 20_000;
const MAX_MAX_WAIT_MS = 120_000;

interface Waiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

const waiters: Waiter[] = [];
let active = 0;
let completed = 0;
let bypassed = 0;
let peakQueue = 0;

function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

export function ayWebsReadConcurrency(): number {
  return integerEnv('AYWEBS_READ_CONCURRENCY', DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
}

export function ayWebsReadGateMaxWaitMs(): number {
  return integerEnv('AYWEBS_READ_GATE_MAX_WAIT_MS', DEFAULT_MAX_WAIT_MS, 0, MAX_MAX_WAIT_MS);
}

/** Libère un créneau et en accorde un au prochain lecteur en attente. */
function release(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (!next) return;
  if (next.timer) clearTimeout(next.timer);
  if (next.settled) {
    // L'attente avait expiré et l'appel est déjà passé sans créneau : ce
    // créneau libéré ne doit pas être perdu, on le cède au suivant.
    release();
    return;
  }
  next.settled = true;
  active += 1;
  next.resolve();
}

/**
 * Exécute `task` en respectant le plafond de lectures simultanées.
 * Ne lève jamais pour cause de saturation : au pire, elle patiente puis passe.
 */
export async function withAyWebsReadSlot<T>(task: () => Promise<T>): Promise<T> {
  const limit = ayWebsReadConcurrency();
  if (active < limit) {
    active += 1;
    try {
      return await task();
    } finally {
      completed += 1;
      release();
    }
  }

  const maxWait = ayWebsReadGateMaxWaitMs();
  if (maxWait <= 0) {
    bypassed += 1;
    try {
      return await task();
    } finally {
      completed += 1;
    }
  }

  const granted = await new Promise<boolean>((resolve) => {
    const waiter: Waiter = { settled: false, timer: null, resolve: () => resolve(true) };
    waiter.timer = setTimeout(() => {
      if (waiter.settled) return;
      waiter.settled = true;
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      bypassed += 1;
      resolve(false);
    }, maxWait);
    waiters.push(waiter);
    peakQueue = Math.max(peakQueue, waiters.length);
  });

  try {
    return await task();
  } finally {
    completed += 1;
    if (granted) release();
  }
}

export function ayWebsReadGateStats(): {
  limit: number; active: number; queued: number; completed: number; bypassed: number; peak_queue: number;
} {
  return {
    limit: ayWebsReadConcurrency(),
    active,
    queued: waiters.length,
    completed,
    bypassed,
    peak_queue: peakQueue,
  };
}

/** Remise à zéro (tests uniquement). */
export function resetAyWebsReadGate(): void {
  for (const waiter of waiters.splice(0, waiters.length)) {
    if (waiter.timer) clearTimeout(waiter.timer);
  }
  active = 0;
  completed = 0;
  bypassed = 0;
  peakQueue = 0;
}
