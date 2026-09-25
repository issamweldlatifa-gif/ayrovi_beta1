/*
 * SIGNAUX DE L'IMAGE (OCR + code-barres) sur le chemin CLIENT.
 *
 * L'audit avait montré que le chemin interne lisait le texte de l'image et
 * cherchait un code-barres, pendant que le chemin client ne faisait ni l'un ni
 * l'autre : même photo, reconnaissance plus pauvre pour le client.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
describe('l’OCR ne touche jamais au prix (règle client du 25/09/2026)', () => {
  const routes = readFileSync('src/ayrovix/routes.ts', 'utf8');
  const signals = readFileSync('src/ayrovix/services/lensSignals.ts', 'utf8');

  it('aucune fonction d’arbitrage de prix ne subsiste dans le module de signaux', () => {
    expect(signals).not.toContain('reconcileDetectedPrice');
    expect(signals).not.toContain('export interface DetectedPrice');
    // La raison est écrite dans le code, pour que personne ne la réintroduise.
    expect(signals).toContain('À NE PAS RÉINTRODUIRE');
  });

  it('la route n’injecte aucun montant issu de la lecture de l’image', () => {
    const block = routes.split("router.post('/analyze-image'")[1].split("router.post('/analyze-url'")[0];
    expect(block).not.toContain('reconcileDetectedPrice');
    expect(block).not.toMatch(/detected_price:\s*[a-zA-Z]+\(/);
    expect(block).not.toMatch(/signals[^;]*(salePrice|totalPrice)/);
  });

  it('le module de signaux ne rend que de l’identification : texte et code', () => {
    const contract = signals.split('export interface LensSignals {')[1].split('}')[0];
    expect(contract).toContain('report');
    expect(contract).toContain('code');
    expect(contract).not.toContain('price');
  });

  it('le prix garde son origine unique : l’offre marchande, puis notre formule', () => {
    const block = routes.split("router.post('/analyze-image'")[1].split("router.post('/analyze-url'")[0];
    expect(block).toContain('calculatePrice(');
    expect(block).toContain('getCachedPricingRules(db)');
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
