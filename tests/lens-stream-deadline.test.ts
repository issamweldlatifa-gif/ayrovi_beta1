/*
 * Lens — garde-fous du flux /analyze-image.
 * Un délai global doit toujours répondre (jamais de « Analyse en cours » infini),
 * et aucune écriture ne doit suivre une réponse de délai dépassé.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const routes = readFileSync('src/ayrovix/routes.ts', 'utf8');
const block = routes.split("router.post('/analyze-image'")[1].split("router.post('/analyze-url'")[0];
const visual = readFileSync('src/ayrovix/services/visualSearch.ts', 'utf8');
const clientApi = readFileSync('client/src/ayrovix/services/lensApi.ts', 'utf8');

describe('délai global de /analyze-image', () => {
  it('arme un délai qui répond par ANALYZE_TIMEOUT', () => {
    expect(block).toContain('armLensDeadline(deadlineMs');
    expect(block).toContain("emit('error', { code: 'ANALYZE_TIMEOUT'");
    expect(block).toContain("res.status(504).json({ success: false, code: 'ANALYZE_TIMEOUT'");
  });
  it('annule le délai dans tous les chemins de sortie', () => {
    expect(block).toMatch(/\} finally \{\s*cancelDeadline\(\);\s*\}/);
  });
  it('n’écrit plus rien après un délai dépassé', () => {
    expect(block.match(/if \(timedOut\) return;/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it('émet la progression : image lue, recherche, lecture des fiches', () => {
    expect(block).toContain("emit('progress', { step: 'identified' })");
    expect(block).toContain("emit('progress', { step: 'searching' })");
    expect(block).toContain("emit('progress', { step: 'reading', done: readyCount, total: candidates.length })");
  });
});

describe('clés SerpApi', () => {
  it('accepte les deux noms de variable utilisés dans le dépôt', () => {
    expect(visual).toContain('process.env.SERPAPI_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim()');
  });
});

describe('client : flux sans fin silencieuse', () => {
  it('refuse un flux fermé sans « done »', () => {
    expect(clientApi).toContain("'STREAM_INCOMPLETE'");
    expect(clientApi).toContain('if (!doneMeta)');
  });
  it('coupe un flux bloqué (délai d’inactivité) et signale ANALYZE_TIMEOUT', () => {
    expect(clientApi).toContain('LENS_STREAM_IDLE_MS');
    expect(clientApi).toContain("'ANALYZE_TIMEOUT'");
  });
});
