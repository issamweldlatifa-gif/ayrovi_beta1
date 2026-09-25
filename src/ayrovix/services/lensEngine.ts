/**
 * MOTEUR LENS — l'unique orchestration de « que voit-on sur cette image ? ».
 *
 * L'audit du 25/09/2026 a trouvé DEUX orchestrations pour la même opération :
 * `runLensPipeline` (utilisée par l'administration et l'assistant) et une copie
 * écrite à la main dans la route publique. Elles avaient déjà divergé — la copie
 * publique n'avait ni cache, ni OCR, ni lecture de code-barres. Deux
 * orchestrations pour une seule question, c'est la garantie que le client et
 * l'administrateur ne verront jamais tout à fait le même produit.
 *
 * Ce module est désormais le SEUL endroit qui sait dans quel ordre interroger la
 * vision, la recherche visuelle et les signaux de l'image. Les deux appelants
 * gardent ce qui leur est propre (le format de réponse, le cache en base pour le
 * pipeline interne) et ne dupliquent plus l'orchestration.
 *
 * Trois garanties, tenues par les tests :
 *  • un moteur qui tombe n'emporte pas les autres — la vision peut échouer
 *    pendant que la recherche visuelle a déjà trouvé des offres ;
 *  • chaque moteur est mesuré SÉPARÉMENT, jamais deux fois la même durée ;
 *  • ce qui vient du cache n'est pas rappelé, et rien de vide n'est mémorisé.
 */
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { identifyProduct } from './ai';
import { serpApiVisualSearch } from './visualSearch';
import { lensImageKey, readLensCache, writeLensCache } from './lensRecognitionCache';
import { EMPTY_SIGNALS, readLensSignals, type LensSignals } from './lensSignals';

export interface LensRecognition {
  identification: AyrovixIdentification | null;
  /** Raison de l'échec de la vision, laissée à l'appelant : lui seul sait s'il peut continuer. */
  identificationError: unknown;
  matches: AyrovixCandidate[];
  signals: LensSignals;
  timings: { visionMs: number; matchesMs: number; signalsMs: number };
  /** Étapes abandonnées sur échéance — visibles dans le journal, jamais silencieuses. */
  timedOut: Array<'vision' | 'matches'>;
  /** Ce que le cache a réellement servi : 'none' | 'identification' | 'matches' | 'both'. */
  cacheHit: string;
}

export interface RecognizeOptions {
  /** Nombre de correspondances marchandes demandées. */
  matchLimit?: number;
  /** Lire le texte et les codes de l'image (défaut : oui). */
  withSignals?: boolean;
  /** Utiliser le cache de reconnaissance (défaut : oui). */
  useCache?: boolean;
}

/** Mesure une promesse sans changer son issue. */
async function timed<T>(work: Promise<T>, onDone: (ms: number) => void): Promise<T> {
  const started = Date.now();
  try { return await work; } finally { onDone(Date.now() - started); }
}

/*
 * ÉCHÉANCE DE RECONNAISSANCE (25/09/2026).
 *
 * Chaque moteur a déjà sa propre coupure réseau : la vision s'arrête à
 * AYROVIX_PROVIDER_TIMEOUT_MS (8 s par défaut) et la recherche visuelle à
 * AYROVIX_VISUAL_SEARCH_TIMEOUT_MS (10 s). Mais la vision RÉESSAIE une fois en
 * cas de réponse malformée : deux tentatives plus la latence réseau peuvent
 * donc dépasser vingt secondes, pendant lesquelles le client regarde un écran
 * qui ne dit rien. Aucun plafond ne couvrait ce cumul.
 *
 * Cette échéance le couvre. À son expiration, on rend ce qui est prêt — souvent
 * les correspondances marchandes, qui suffisent à afficher des offres — plutôt
 * que d'attendre un moteur qui ne répondra peut-être jamais. Le travail en
 * retard n'est pas « annulé » (nous ne contrôlons pas la socket du fournisseur),
 * il est simplement ABANDONNÉ : son résultat tardif n'est ni affiché, ni mis en
 * cache, car il correspondrait à une requête que le client a déjà quittée.
 */
export class LensDeadlineError extends Error {
  constructor(public readonly stage: 'vision' | 'matches' | 'signals') {
    super(`LENS_DEADLINE_${stage.toUpperCase()}`);
    this.name = 'LensDeadlineError';
  }
}

function deadlineMs(name: 'VISION' | 'MATCHES', fallback: number): number {
  const raw = Number(process.env[`AYROVI_LENS_${name}_DEADLINE_MS`]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  // Bornes de sûreté : une échéance trop courte transformerait chaque requête en
  // échec, une échéance trop longue ne protégerait plus personne.
  return Math.min(30_000, Math.max(2_000, raw));
}

function withDeadline<T>(work: Promise<T>, ms: number, stage: 'vision' | 'matches' | 'signals'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LensDeadlineError(stage)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function recognizeImage(
  image: Buffer,
  mime: string,
  options: RecognizeOptions = {},
): Promise<LensRecognition> {
  const { matchLimit = 8, withSignals = true, useCache = true } = options;

  const key = lensImageKey(image);
  const cached = useCache
    ? readLensCache<AyrovixIdentification, AyrovixCandidate, LensSignals>(key)
    : { identification: null, matches: null, signals: null, hit: 'none' as const };

  let visionMs = 0;
  let matchesMs = 0;
  let signalsMs = 0;

  const [visionResult, matchesResult, signalsResult] = await Promise.allSettled([
    cached.identification
      ? Promise.resolve(cached.identification)
      : timed(
          withDeadline(identifyProduct(image, mime), deadlineMs('VISION', 18_000), 'vision'),
          (ms) => { visionMs = ms; },
        ),
    cached.matches
      ? Promise.resolve(cached.matches)
      : timed(
          withDeadline(serpApiVisualSearch(image, matchLimit), deadlineMs('MATCHES', 14_000), 'matches'),
          (ms) => { matchesMs = ms; },
        ),
    !withSignals
      ? Promise.resolve(EMPTY_SIGNALS)
      : cached.signals
        ? Promise.resolve(cached.signals)
        : timed(readLensSignals(image), (ms) => { signalsMs = ms; }),
  ]);

  const identification = visionResult.status === 'fulfilled' ? visionResult.value : null;
  const matches = matchesResult.status === 'fulfilled' ? matchesResult.value : [];
  const signals = signalsResult.status === 'fulfilled' ? signalsResult.value : EMPTY_SIGNALS;

  if (useCache) {
    writeLensCache<AyrovixIdentification, AyrovixCandidate, LensSignals>(key, {
      identification: cached.identification ? undefined : identification,
      matches: cached.matches ? undefined : matches,
      signals: cached.signals || signals === EMPTY_SIGNALS ? undefined : signals,
    });
  }

  const timedOut: Array<'vision' | 'matches'> = [];
  if (visionResult.status === 'rejected' && visionResult.reason instanceof LensDeadlineError) timedOut.push('vision');
  if (matchesResult.status === 'rejected' && matchesResult.reason instanceof LensDeadlineError) timedOut.push('matches');
  if (timedOut.length) console.warn(`[AYROVIX lens-engine] échéance dépassée : ${timedOut.join(', ')}`);

  return {
    identification,
    identificationError: visionResult.status === 'rejected' ? visionResult.reason : null,
    matches,
    signals,
    timings: { visionMs, matchesMs, signalsMs },
    timedOut,
    cacheHit: cached.hit,
  };
}
