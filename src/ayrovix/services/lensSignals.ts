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

export interface DetectedPrice {
  amount: number;
  currency: string;
  label: 'none' | 'product_price' | 'old_price' | 'cart_total';
  confidence: number;
}

/**
 * Améliore le prix LU sur l'image, sans jamais dégrader une lecture déjà sûre.
 *
 * Règle : la vision garde la main dès qu'elle est exploitable (≥ 0,65). Ce n'est
 * QUE lorsqu'elle ne l'est pas que l'OCR peut proposer sa lecture, et seulement
 * si celle-ci est elle-même sûre. En cas de doute des deux côtés, on ne choisit
 * pas — on laisse le prix « non lu », et l'écran demandera confirmation. Deviner
 * ici reviendrait à faire payer au client une erreur de lecture.
 */
export function reconcileDetectedPrice(vision: DetectedPrice, signals: LensSignals): DetectedPrice {
  const visionUsable = vision.confidence >= 0.65 && vision.amount > 0 && Boolean(vision.currency)
    && (vision.label === 'product_price' || vision.label === 'cart_total');
  if (visionUsable) return vision;

  const reports = [signals.report, ...signals.segments].filter((report): report is OcrPriceReport => Boolean(report));
  for (const report of reports) {
    if (report.confidence < 0.65 || !report.currency) continue;
    const amount = report.salePrice ?? report.totalPrice;
    if (!Number.isFinite(amount as number) || (amount as number) <= 0) continue;
    return {
      amount: amount as number,
      currency: report.currency,
      label: report.salePrice != null ? 'product_price' : 'cart_total',
      confidence: report.confidence,
    };
  }
  return vision;
}
