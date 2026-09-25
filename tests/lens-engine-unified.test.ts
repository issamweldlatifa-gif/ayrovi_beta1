/*
 * MOTEUR LENS UNIFIÉ — il ne doit plus exister qu'UNE orchestration.
 *
 * L'audit avait trouvé deux séquences pour la même question : celle du pipeline
 * interne et une copie manuscrite dans la route publique, déjà divergentes (la
 * copie n'avait ni cache, ni OCR, ni lecture de code). Ces tests empêchent la
 * seconde de réapparaître.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const routes = readFileSync('src/ayrovix/routes.ts', 'utf8');
const pipeline = readFileSync('src/ayrovix/services/lensPipeline.ts', 'utf8');
const engine = readFileSync('src/ayrovix/services/lensEngine.ts', 'utf8');

describe('une seule orchestration', () => {
  it('la route publique n’appelle plus les moteurs elle-même', () => {
    const block = routes.split("router.post('/analyze-image'")[1].split("router.post('/analyze-url'")[0];
    expect(block).toContain('recognizeImage(effectiveBuffer, effectiveMime)');
    expect(block).not.toContain('identifyProduct(effectiveBuffer');
    expect(block).not.toContain('serpApiVisualSearch(effectiveBuffer');
    expect(block).not.toContain('readLensSignals(effectiveBuffer');
  });

  it('le pipeline interne non plus — il garde son cache et sa fusion, rien d’autre', () => {
    expect(pipeline).toContain('recognizeImage(image, mime)');
    expect(pipeline).not.toMatch(/identifyProduct\(image/);
    expect(pipeline).not.toMatch(/serpApiVisualSearch\(image/);
    expect(pipeline).not.toMatch(/ocrRecognize\(/);
    expect(pipeline).toContain('mergeVisionOcr');
    expect(pipeline).toContain('writeCanonicalLensCache');
  });

  it('le moteur interroge les trois sources EN PARALLÈLE', () => {
    const call = engine.split('Promise.allSettled([')[1].split(']);')[0];
    expect(call).toContain('identifyProduct(image, mime)');
    expect(call).toContain('serpApiVisualSearch(image, matchLimit)');
    expect(call).toContain('readLensSignals(image)');
  });

  it('un moteur qui tombe n’emporte pas les autres', () => {
    expect(engine).toContain('Promise.allSettled');
    expect(engine).toContain("visionResult.status === 'fulfilled'");
    expect(engine).toContain("matchesResult.status === 'fulfilled' ? matchesResult.value : []");
  });

  it('l’erreur de vision est transmise, pas avalée : l’appelant décide s’il continue', () => {
    expect(engine).toContain('identificationError');
    expect(routes).toContain('const visionError = recognition.identificationError;');
  });

  it('chaque moteur est mesuré séparément', () => {
    expect(engine).toContain('visionMs');
    expect(engine).toContain('matchesMs');
    expect(engine).toContain('signalsMs');
    expect(routes).toContain("mark(trace, 'anthropicVisionMs', recognition.timings.visionMs)");
    expect(routes).toContain("mark(trace, 'serpApiTotalMs', recognition.timings.matchesMs)");
  });
});

describe('moteur — comportement réel', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-engine-'));
    process.env.AYROVI_LENS_CACHE_DIR = dir;
    delete process.env.AYROVI_LENS_CACHE;
    vi.resetModules();
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); vi.resetModules(); });

  async function loadEngine(vision: any, matches: any) {
    vi.doMock('../src/ayrovix/services/ai', () => ({ identifyProduct: vision }));
    vi.doMock('../src/ayrovix/services/visualSearch', () => ({ serpApiVisualSearch: matches }));
    vi.doMock('../src/ayrovix/services/lensSignals', async () => {
      const actual = await vi.importActual<any>('../src/ayrovix/services/lensSignals');
      return { ...actual, readLensSignals: async () => actual.EMPTY_SIGNALS };
    });
    return import('../src/ayrovix/services/lensEngine');
  }

  it('la vision peut échouer pendant que la recherche visuelle réussit', async () => {
    const { recognizeImage } = await loadEngine(
      vi.fn().mockRejectedValue(new Error('VISION_DOWN')),
      vi.fn().mockResolvedValue([{ id: 'm1' }]),
    );
    const out = await recognizeImage(Buffer.from('img-a'), 'image/jpeg');
    expect(out.identification).toBeNull();
    expect((out.identificationError as Error).message).toBe('VISION_DOWN');
    expect(out.matches).toHaveLength(1);
  });

  it('la deuxième analyse de la même image ne rappelle aucun moteur payant', async () => {
    const vision = vi.fn().mockResolvedValue({ brand: 'Champion' });
    const matches = vi.fn().mockResolvedValue([{ id: 'm1' }]);
    const { recognizeImage } = await loadEngine(vision, matches);
    const image = Buffer.from('img-b');
    const first = await recognizeImage(image, 'image/jpeg');
    const second = await recognizeImage(image, 'image/jpeg');
    expect(first.cacheHit).toBe('none');
    expect(second.cacheHit).toBe('both');
    expect(vision).toHaveBeenCalledTimes(1);
    expect(matches).toHaveBeenCalledTimes(1);
  });

  it('un échec n’est pas mémorisé : la requête suivante réessaie vraiment', async () => {
    const vision = vi.fn().mockRejectedValue(new Error('down'));
    const matches = vi.fn().mockResolvedValue([]);
    const { recognizeImage } = await loadEngine(vision, matches);
    const image = Buffer.from('img-c');
    await recognizeImage(image, 'image/jpeg');
    await recognizeImage(image, 'image/jpeg');
    expect(vision).toHaveBeenCalledTimes(2);
    expect(matches).toHaveBeenCalledTimes(2);
  });
});
