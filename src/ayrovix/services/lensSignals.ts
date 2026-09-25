/**
 * SIGNAUX DE L'IMAGE — OCR et code-barres pour le chemin CLIENT (25/09/2026).
 *
 * Constat de l'audit : `runLensPipeline` (chemin interne) lit le texte de
 * l'image en cinq passes et cherche un code-barres ; le chemin client, lui,
 * n'avait ni l'un ni l'autre. Le client obtenait donc une reconnaissance plus
 * pauvre que l'administrateur sur exactement la même photo.
 *
 * Ce module ne réécrit aucune logique : il appelle les fonctions existantes
 * (`prepareImageForAnalysis`, `ocrRecognize`, `analyzeOcrText`,
 * `scanCodeFromImage`) et rend un résultat unique. Deux garde-fous :
 *
 *  • TOUT est lancé en parallèle et chaque échec est isolé. L'OCR qui tombe ne
 *    doit jamais faire échouer une recherche que la vision a déjà réussie.
 *  • Un budget de temps borne l'ensemble : au-delà, on rend ce qui est prêt.
 *    Mieux vaut une reconnaissance sans OCR qu'un client qui attend.
 *
 * Ces signaux décrivent la PHOTO (son texte, son code), pas le marché : ils sont
 * donc mémorisables longtemps, comme la reconnaissance.
 */
import { prepareImageForAnalysis } from './imagePrep';
import { ocrRecognize } from '../../services/vision';
import { analyzeOcrText, type OcrPriceReport } from './ocrPrices';
import { scanCodeFromImage, type AyrovixScannedCode } from './codeScanner';

export interface LensSignals {
  /** Rapport OCR de l'image entière (passe normale + passe rehaussée). */
  report: OcrPriceReport | null;
  /** Rapports des segments, pour les captures d'écran très longues. */
  segments: OcrPriceReport[];
  /** Code-barres ou QR trouvé dans l'image, s'il y en a un. */
  code: AyrovixScannedCode | null;
  /** Nombre de caractères réellement lus — sert à juger la qualité, pas à décorer. */
  textLength: number;
}

export const EMPTY_SIGNALS: LensSignals = { report: null, segments: [], code: null, textLength: 0 };

const DEFAULT_BUDGET_MS = 4500;

function budgetMs(): number {
  const raw = Number(process.env.AYROVI_LENS_SIGNALS_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_MS;
}

/** Rend `fallback` si le travail dépasse le budget — sans jamais rejeter. */
function withBudget<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

export async function readLensSignals(image: Buffer): Promise<LensSignals> {
  if (!image?.length) return EMPTY_SIGNALS;
  if (process.env.AYROVI_LENS_SIGNALS === 'false') return EMPTY_SIGNALS;

  const ms = budgetMs();
  const work = (async (): Promise<LensSignals> => {
    const [prepared, code] = await Promise.all([
      prepareImageForAnalysis(image).catch(() => ({ enhanced: Buffer.alloc(0), segments: [] as Buffer[] })),
      scanCodeFromImage(image).catch(() => null),
    ]);

    const passes: Array<Promise<string>> = [ocrRecognize(image).catch(() => '')];
    if (prepared.enhanced.length) passes.push(ocrRecognize(prepared.enhanced).catch(() => ''));
    for (const segment of prepared.segments.slice(0, 3)) passes.push(ocrRecognize(segment).catch(() => ''));

    const texts = await Promise.all(passes);
    const whole = [texts[0], texts[1]].filter(Boolean).join('\n');
    const segmentTexts = texts.slice(2).filter(Boolean);

    return {
      report: whole ? analyzeOcrText(whole) : null,
      segments: segmentTexts.map((text) => analyzeOcrText(text)),
      code,
      textLength: whole.length,
    };
  })();

  return withBudget(work, EMPTY_SIGNALS, ms);
}

/*
 * NOTE DE CONCEPTION (règle client du 25/09/2026) — À NE PAS RÉINTRODUIRE.
 *
 * Une fonction d'arbitrage « prix lu par la vision contre prix lu par l'OCR » a
 * existé ici quelques heures. Elle est supprimée : le texte d'une photo sert à
 * RECONNAÎTRE un produit, jamais à en fixer le montant. Le prix a une seule
 * origine — l'offre marchande rapportée par SerpApi — et notre formule s'y
 * applique ensuite. Un chiffre mal lu sur une image serait un prix que personne
 * n'a jamais proposé, et c'est le client qui le paierait.
 *
 * Ce module ne rend donc que des signaux d'IDENTIFICATION : texte et code.
 */
