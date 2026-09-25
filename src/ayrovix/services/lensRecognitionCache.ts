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

export interface LensCacheEntry<I, M, S = unknown> {
  identification: I | null;
  matches: M[] | null;
  /**
   * Signaux lus SUR la photo (texte OCR, code-barres). Ils décrivent l'image,
   * pas le marché : ils vivent donc aussi longtemps que la reconnaissance.
   */
  signals: S | null;
  /** Horodatages séparés : les moitiés n'ont pas la même durée de vie. */
  identificationAt: number;
  matchesAt: number;
}

export interface LensCacheRead<I, M, S = unknown> {
  identification: I | null;
  matches: M[] | null;
  signals: S | null;
  /** Ce qui a réellement été servi par le cache, pour la télémétrie et l'en-tête. */
  hit: 'none' | 'identification' | 'matches' | 'both';
}

/**
 * Le cache est-il actif ?
 *
 * Défaut constaté pendant l'intégration : sous test, un cache sur DISQUE rend
 * les exécutions dépendantes les unes des autres — un scénario passait parce
 * qu'une entrée écrite par un test précédent servait la réponse, et les moteurs
 * n'étaient jamais appelés. Un test doit décrire le système, pas l'historique de
 * la machine. Sous test, le cache est donc INACTIF sauf si le test fournit
 * lui-même un répertoire isolé (ou l'active explicitement).
 */
function cacheEnabled(): boolean {
  if (process.env.AYROVI_LENS_CACHE === 'false') return false;
  if (process.env.AYROVI_LENS_CACHE === 'true') return true;
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return Boolean(process.env.AYROVI_LENS_CACHE_DIR);
  return true;
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

export function readLensCache<I, M, S = unknown>(key: string, now = Date.now()): LensCacheRead<I, M, S> {
  const empty: LensCacheRead<I, M, S> = { identification: null, matches: null, signals: null, hit: 'none' };
  if (!cacheEnabled()) return empty;
  try {
    const raw = fs.readFileSync(entryFile(key), 'utf8');
    const entry = JSON.parse(raw) as LensCacheEntry<I, M, S>;
    const fresh = now - entry.identificationAt <= ttl('RECOGNITION');
    const identification = entry.identification && fresh ? entry.identification : null;
    const signals = entry.signals && fresh ? entry.signals : null;
    const matches = entry.matches && now - entry.matchesAt <= ttl('MATCHES')
      ? entry.matches
      : null;
    const hit = identification && matches ? 'both' : identification ? 'identification' : matches ? 'matches' : 'none';
    return { identification, matches, signals, hit };
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
export function writeLensCache<I, M, S = unknown>(
  key: string,
  value: { identification?: I | null; matches?: M[] | null; signals?: S | null },
  now = Date.now(),
): void {
  if (!cacheEnabled()) return;
  try {
    const file = entryFile(key);
    let current: LensCacheEntry<I, M, S> = { identification: null, matches: null, signals: null, identificationAt: 0, matchesAt: 0 };
    try { current = JSON.parse(fs.readFileSync(file, 'utf8')) as LensCacheEntry<I, M, S>; } catch { /* première écriture */ }

    const next: LensCacheEntry<I, M, S> = {
      identification: value.identification !== undefined && value.identification !== null
        ? value.identification
        : current.identification,
      identificationAt: value.identification !== undefined && value.identification !== null ? now : current.identificationAt,
      signals: value.signals !== undefined && value.signals !== null ? value.signals : current.signals,
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
