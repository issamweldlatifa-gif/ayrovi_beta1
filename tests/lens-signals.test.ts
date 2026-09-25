/*
 * SIGNAUX DE L'IMAGE (OCR + code-barres) sur le chemin CLIENT.
 *
 * L'audit avait montré que le chemin interne lisait le texte de l'image et
 * cherchait un code-barres, pendant que le chemin client ne faisait ni l'un ni
 * l'autre : même photo, reconnaissance plus pauvre pour le client.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMPTY_SIGNALS, reconcileDetectedPrice, type LensSignals } from '../src/ayrovix/services/lensSignals';
import type { OcrPriceReport } from '../src/ayrovix/services/ocrPrices';

const report = (over: Partial<OcrPriceReport>): OcrPriceReport => ({
  findings: [], salePrice: null, originalPrice: null, shippingPrice: null, totalPrice: null,
  discountPercent: null, currency: null, confidence: 0, text: '', ...over,
});

const signals = (over: Partial<LensSignals> = {}): LensSignals => ({ ...EMPTY_SIGNALS, ...over });

describe('prix lu sur l’image — arbitrage vision / OCR', () => {
  it('une lecture sûre de la vision n’est JAMAIS remplacée', () => {
    const vision = { amount: 35.95, currency: 'EUR', label: 'product_price' as const, confidence: 0.9 };
    const out = reconcileDetectedPrice(vision, signals({ report: report({ salePrice: 999, currency: 'EUR', confidence: 0.99 }) }));
    expect(out).toEqual(vision);
  });

  it('quand la vision doute, un OCR sûr prend le relais', () => {
    const vision = { amount: 0, currency: '', label: 'none' as const, confidence: 0 };
    const out = reconcileDetectedPrice(vision, signals({ report: report({ salePrice: 35.95, currency: 'EUR', confidence: 0.82 }) }));
    expect(out.amount).toBe(35.95);
    expect(out.currency).toBe('EUR');
    expect(out.label).toBe('product_price');
  });

  it('quand les DEUX doutent, le prix reste non lu — on ne devine pas un montant', () => {
    const vision = { amount: 0, currency: '', label: 'none' as const, confidence: 0.2 };
    const out = reconcileDetectedPrice(vision, signals({ report: report({ salePrice: 35.95, currency: 'EUR', confidence: 0.4 }) }));
    expect(out).toEqual(vision);
  });

  it('un OCR sans devise n’est pas exploitable : un nombre seul n’est pas un prix', () => {
    const vision = { amount: 0, currency: '', label: 'none' as const, confidence: 0 };
    const out = reconcileDetectedPrice(vision, signals({ report: report({ salePrice: 35.95, currency: null, confidence: 0.9 }) }));
    expect(out).toEqual(vision);
  });

  it('un total de panier est étiqueté comme tel, pas comme un prix produit', () => {
    const vision = { amount: 0, currency: '', label: 'none' as const, confidence: 0 };
    const out = reconcileDetectedPrice(vision, signals({ report: report({ totalPrice: 120, currency: 'TND', confidence: 0.8 }) }));
    expect(out.label).toBe('cart_total');
    expect(out.amount).toBe(120);
  });

  it('les segments d’une capture longue sont lus aussi', () => {
    const vision = { amount: 0, currency: '', label: 'none' as const, confidence: 0 };
    const out = reconcileDetectedPrice(vision, signals({ segments: [report({ salePrice: 42, currency: 'EUR', confidence: 0.7 })] }));
    expect(out.amount).toBe(42);
  });
});

describe('câblage sur la route client', () => {
  const routes = readFileSync('src/ayrovix/routes.ts', 'utf8');
  const source = readFileSync('src/ayrovix/services/lensSignals.ts', 'utf8');

  const engine = readFileSync('src/ayrovix/services/lensEngine.ts', 'utf8');

  it('les signaux tournent en parallèle des moteurs, pas après eux', () => {
    const block = engine.split('Promise.allSettled([')[1].split(']);')[0];
    expect(block).toContain('readLensSignals(image)');
    expect(block).toContain('identifyProduct(image, mime)');
    expect(block).toContain('serpApiVisualSearch(image, matchLimit)');
  });

  it('ils sont mesurés et mis en cache avec la photo, jamais avec le marché', () => {
    expect(routes).toContain("mark(trace, 'imageSignalsMs', recognition.timings.signalsMs)");
    expect(engine).toContain('signals: cached.signals || signals === EMPTY_SIGNALS ? undefined : signals');
  });

  it('aucune logique n’est réécrite : le module réutilise les fonctions existantes', () => {
    for (const dependency of ['prepareImageForAnalysis', 'ocrRecognize', 'analyzeOcrText', 'scanCodeFromImage']) {
      expect(source).toContain(`import { ${dependency}`.slice(0, 8 + dependency.length) || dependency);
      expect(source).toContain(dependency);
    }
  });

  it('un budget de temps borne la lecture : jamais de client bloqué par l’OCR', () => {
    expect(source).toContain('withBudget');
    expect(source).toContain('AYROVI_LENS_SIGNALS_BUDGET_MS');
    expect(source).toContain("process.env.AYROVI_LENS_SIGNALS === 'false'");
  });

  it('aucun échec de lecture ne peut faire tomber la requête', () => {
    expect(source).toMatch(/catch\(\(\) => ''\)/);
    expect(source).toContain('catch(() => null)');
  });
});
