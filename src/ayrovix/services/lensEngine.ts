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
      : timed(identifyProduct(image, mime), (ms) => { visionMs = ms; }),
    cached.matches
      ? Promise.resolve(cached.matches)
      : timed(serpApiVisualSearch(image, matchLimit), (ms) => { matchesMs = ms; }),
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

  return {
    identification,
    identificationError: visionResult.status === 'rejected' ? visionResult.reason : null,
    matches,
    signals,
    timings: { visionMs, matchesMs, signalsMs },
    cacheHit: cached.hit,
  };
}
