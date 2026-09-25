/**
 * CACHE DE RECONNAISSANCE LENS (25/09/2026).
 *
 * Constat de l'audit : le chemin CLIENT (`POST /analyze-image`) n'avait aucun
 * cache, alors que le chemin interne (`runLensPipeline`) en a un. La même photo
 * envoyée deux fois payait donc deux fois la vision ET deux fois SerpApi, et
 * faisait attendre deux fois. Ce module apporte le cache au chemin client sans
 * rien changer d'autre à la requête.
 *
 * ── Ce qui est mis en cache, et POURQUOI deux durées ──────────────────────
 *
 *  1. RECONNAISSANCE (`identification`) : marque, modèle, catégorie, prix LU
 *     sur l'image. Ces informations décrivent la PHOTO. Une photo ne change
 *     pas : on peut les garder longtemps (24 h par défaut).
 *
 *  2. CORRESPONDANCES MARCHANDES (`visual_matches`) : titres, boutiques et
 *     PRIX relevés chez des marchands. Ces informations décrivent le MARCHÉ,
 *     qui bouge. On les garde peu (30 min par défaut) — au-delà, un prix
 *     affiché n'est plus une observation, c'est un souvenir.
 *
 * Rien d'autre n'est mis en cache. Le calcul de prix (droits, TVA, taux) est
 * refait à CHAQUE requête à partir des règles en base : un tarif ne doit jamais
 * sortir d'un cache.
 *
 * Le cache est sur disque, une entrée par empreinte d'image, et toute entrée
 * illisible est traitée comme absente — un cache ne doit jamais faire échouer
 * une requête qu'il était censé accélérer.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Version du format : la changer invalide tout le cache d'un coup. */
const FORMAT = 'v1';

const DEFAULT_RECOGNITION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MATCHES_TTL_MS = 30 * 60 * 1000;

export interface LensCacheEntry<I, M> {
  identification: I | null;
  matches: M[] | null;
  /** Horodatages séparés : les deux moitiés n'ont pas la même durée de vie. */
  identificationAt: number;
  matchesAt: number;
}

export interface LensCacheRead<I, M> {
  identification: I | null;
  matches: M[] | null;
  /** Ce qui a réellement été servi par le cache, pour la télémétrie et l'en-tête. */
  hit: 'none' | 'identification' | 'matches' | 'both';
}

function cacheDir(): string {
  return process.env.AYROVI_LENS_CACHE_DIR || path.resolve(process.cwd(), 'data', 'lens-recognition');
}

function ttl(name: 'RECOGNITION' | 'MATCHES'): number {
  const raw = Number(process.env[`AYROVI_LENS_${name}_TTL_MS`]);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return name === 'RECOGNITION' ? DEFAULT_RECOGNITION_TTL_MS : DEFAULT_MATCHES_TTL_MS;
}

/** Empreinte de l'image RÉELLEMENT analysée (après normalisation et recadrage). */
export function lensImageKey(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 40);
}

function entryFile(key: string): string {
  return path.join(cacheDir(), `${FORMAT}-${key}.json`);
}

export function readLensCache<I, M>(key: string, now = Date.now()): LensCacheRead<I, M> {
  const empty: LensCacheRead<I, M> = { identification: null, matches: null, hit: 'none' };
  if (process.env.AYROVI_LENS_CACHE === 'false') return empty;
  try {
    const raw = fs.readFileSync(entryFile(key), 'utf8');
    const entry = JSON.parse(raw) as LensCacheEntry<I, M>;
    const identification = entry.identification && now - entry.identificationAt <= ttl('RECOGNITION')
      ? entry.identification
      : null;
    const matches = entry.matches && now - entry.matchesAt <= ttl('MATCHES')
      ? entry.matches
      : null;
    const hit = identification && matches ? 'both' : identification ? 'identification' : matches ? 'matches' : 'none';
    return { identification, matches, hit };
  } catch {
    // Absente, illisible ou corrompue : on recalcule, on n'échoue pas.
    return empty;
  }
}

/**
 * Écrit ce qui vient d'être calculé. Les deux moitiés sont indépendantes :
 * une reconnaissance encore valable n'est pas effacée parce que les
 * correspondances marchandes ont été rafraîchies.
 */
export function writeLensCache<I, M>(
  key: string,
  value: { identification?: I | null; matches?: M[] | null },
  now = Date.now(),
): void {
  if (process.env.AYROVI_LENS_CACHE === 'false') return;
  try {
    const file = entryFile(key);
    let current: LensCacheEntry<I, M> = { identification: null, matches: null, identificationAt: 0, matchesAt: 0 };
    try { current = JSON.parse(fs.readFileSync(file, 'utf8')) as LensCacheEntry<I, M>; } catch { /* première écriture */ }

    const next: LensCacheEntry<I, M> = {
      identification: value.identification !== undefined && value.identification !== null
        ? value.identification
        : current.identification,
      identificationAt: value.identification !== undefined && value.identification !== null ? now : current.identificationAt,
      // Une liste VIDE n'est pas un résultat : on ne la mémorise pas, sinon on
      // sert du vide pendant une demi-heure à cause d'un incident passager.
      matches: value.matches && value.matches.length ? value.matches : current.matches,
      matchesAt: value.matches && value.matches.length ? now : current.matchesAt,
    };

    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next), 'utf8');
  } catch {
    // Un cache qui ne sait pas écrire reste un cache : la requête continue.
  }
}
