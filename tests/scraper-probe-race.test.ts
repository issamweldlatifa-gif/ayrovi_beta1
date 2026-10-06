/**
 * SCRAPER — COURSE DE SONDES (05/10/2026).
 *
 * Ce que ce test protège, et pourquoi : la lecture d'une fiche marchande
 * essayait ses sources en CASCADE (mobile 7 s → bureau 6 s → lecteur 18 s →
 * rendu payant 18 s). Sur une fiche où la première source échoue, le client
 * payait la somme : « plus de vingt secondes » avant de voir un produit chiffré.
 * La course parallèle est désormais la règle ; ces tests la figent :
 *   1. la première sonde qui publie un prix gagne, sans attendre les autres ;
 *   2. les sondes perdantes sont annulées immédiatement (aucune socket laissée) ;
 *   3. un repli exploitable est conservé dans l'ordre de priorité ;
 *   4. une sonde différée ne démarre pas si une sonde rapide a déjà gagné ;
 *   5. le budget global borne l'attente, et l'appelant sait qu'il a été atteint.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { raceProbes } from '../src/scraper/probeRace';

interface Reading { price: number; source: string; }

function probe(id: string, options: {
  timeoutMs?: number;
  delayMs?: number;
  result?: Reading | null;
  failWith?: string;
  hangMs?: number;
}) {
  const run = vi.fn(async (signal: AbortSignal) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.hangMs) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, options.hangMs);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    if (options.failWith) throw new Error(options.failWith);
    return options.result ?? null;
  });
  return { id, timeoutMs: options.timeoutMs ?? 1_000, delayMs: options.delayMs, run };
}

describe('raceProbes — la première sonde utile gagne', () => {
  it('rend la première sonde qui publie un prix, sans attendre la plus lente', async () => {
    const started = Date.now();
    const slow = probe('slow', { result: { price: 20, source: 'slow' }, hangMs: 400 });
    const fast = probe('fast', { result: { price: 39.99, source: 'fast' }, hangMs: 40 });
    const outcome = await raceProbes([slow, fast], { isWinner: (value) => value.price > 0 });

    expect(outcome.winner?.id).toBe('fast');
    expect(outcome.winner?.value.price).toBe(39.99);
    // La perdante est annulée : l'attente ne dépasse pas la gagnante.
    expect(Date.now() - started).toBeLessThan(300);
    expect(outcome.budgetExceeded).toBe(false);
  });

  it('annule les sondes perdantes au lieu de laisser des requêtes ouvertes', async () => {
    const aborted: string[] = [];
    const loser = probe('loser', { hangMs: 5_000 });
    const tracked = {
      ...loser,
      run: async (signal: AbortSignal) => {
        signal.addEventListener('abort', () => aborted.push('loser'), { once: true });
        return loser.run(signal);
      },
    };
    const winner = probe('winner', { result: { price: 12, source: 'winner' }, hangMs: 20 });
    const outcome = await raceProbes([tracked, winner], { isWinner: (value) => value.price > 0 });

    expect(outcome.winner?.id).toBe('winner');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(aborted).toContain('loser');
  });

  it('conserve un repli exploitable et les échecs, sans rien inventer', async () => {
    const failing = probe('direct_mobile', { failWith: 'DIRECT_HTTP_403' });
    const partial = probe('jina', { result: { price: 0, source: 'jina' } });
    const outcome = await raceProbes([failing, partial], { isWinner: (value) => value.price > 0 });

    expect(outcome.winner).toBeNull();
    expect(outcome.fallback?.id).toBe('jina');
    expect(outcome.fallback?.value.source).toBe('jina');
    expect(outcome.failures.map((failure) => failure.id)).toContain('direct_mobile');
    expect(outcome.failures[0].error).toContain('DIRECT_HTTP_403');
  });

  it('ne démarre pas une sonde différée si une sonde rapide a déjà gagné', async () => {
    const quick = probe('direct_mobile', { result: { price: 9.99, source: 'direct' }, hangMs: 10 });
    const deferred = probe('jina', { result: { price: 9.99, source: 'jina' }, delayMs: 150 });
    const outcome = await raceProbes([quick, deferred], { isWinner: (value) => value.price > 0 });

    expect(outcome.winner?.id).toBe('direct_mobile');
    // La sonde différée n'est jamais partie : aucun appel externe dépensé pour rien.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(deferred.run).not.toHaveBeenCalled();
  });

  it('applique un budget global et le signale honnêtement', async () => {
    const started = Date.now();
    const verySlow = probe('very_slow', { timeoutMs: 5_000, result: { price: 30, source: 'very_slow' }, hangMs: 5_000 });
    const outcome = await raceProbes([verySlow], { isWinner: (value) => value.price > 0, budgetMs: 120 });

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(outcome.winner).toBeNull();
    expect(outcome.budgetExceeded).toBe(true);
  });

  it('ne rejette jamais : un échec total rend un résultat vide et tracé', async () => {
    const only = probe('direct_desktop', { failWith: 'DIRECT_TIMEOUT' });
    const outcome = await raceProbes([only], { isWinner: (value) => value.price > 0 });
    expect(outcome.winner).toBeNull();
    expect(outcome.fallback).toBeNull();
    expect(outcome.failures).toHaveLength(1);
  });
});

describe('scraper — câblage de la course parallèle', () => {
  const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');

  it('la lecture d’une fiche passe par la course de sondes', () => {
    expect(scraper).toContain("import { raceProbes, type ProbeAttempt } from './probeRace'");
    expect(scraper).toContain('const raced = await raceProbes(attempts');
    expect(scraper).toContain("id: 'direct_mobile'");
    expect(scraper).toContain("id: 'direct_desktop'");
  });

  it('le lecteur Jina reste le repli documenté, avec son en-tête HTML', () => {
    expect(scraper).toContain('https://r.jina.ai/${url}');
    expect(scraper).toContain("provider: 'jina'");
    expect(scraper).toContain("AYROVI_JINA_READER !== 'false'");
    expect(scraper).toContain("'X-Return-Format': 'html'");
  });

  it('les budgets de sonde sont réglables par environnement', () => {
    expect(scraper).toContain("positiveIntEnv('AYROVIX_DIRECT_TIMEOUT_MS'");
    expect(scraper).toContain("positiveIntEnv('AYROVIX_JINA_TIMEOUT_MS'");
    expect(scraper).toContain("positiveIntEnv('AYROVIX_JINA_HEADSTART_MS'");
  });

  it('le rendu payant reste le dernier recours, jamais la première dépense', () => {
    const stageB = scraper.indexOf('fetchRenderedProductPage(url)');
    const stageA = scraper.indexOf('const raced = await raceProbes(attempts');
    expect(stageA).toBeGreaterThan(0);
    expect(stageB).toBeGreaterThan(stageA);
    expect(scraper).toContain('ÉTAPE B — rendu payant, uniquement si');
    expect(scraper).toContain('ÉTAPE A — course des sondes gratuites');
  });
});
