/**
 * RACINE DES CACHES RÉGÉNÉRABLES — audit d'architecture du 12/11/2026.
 *
 * ── Le problème mesuré ───────────────────────────────────────────────────────
 * Tous les caches vivaient sous `data/`, c'est-à-dire sur le DISQUE PERSISTANT
 * de 1 Go qui porte aussi la base SQLite, les médias téléversés et les
 * sauvegardes locales. Leurs plafonds additionnés (proxy 256 Mo + natif 192 +
 * composé 256 + détouré 256 + variantes 64 + reconnaissance 128 + enrichissement
 * sans plafond) DÉPASSAIENT la taille du disque. Disque plein = SQLite ne peut plus
 * écrire = plus de commandes, plus de connexions : panne totale.
 *
 * ── La décision ─────────────────────────────────────────────────────────────
 * `AYROVI_CACHE_ROOT` désigne un emplacement pour ce qui se RECALCULE (vignettes,
 * images redimensionnées, réponses de magasins à durée de vie courte). Sur
 * Render : le système de fichiers éphémère du conteneur (perdu au déploiement,
 * c'est voulu : un cache se reconstruit). Le disque persistant ne garde que ce
 * qui ne se recrée pas : la base, les médias téléversés, les sauvegardes, et
 * le cache de reconnaissance Lens (payant à reconstruire : appels IA facturés).
 *
 * Sans la variable : comportement historique (sous `data/`), rien ne bouge.
 * Chaque cache garde aussi sa variable dédiée, qui prime (compatibilité).
 */
import path from 'node:path';

/** Caches qui se reconstruisent sans coût facturé — éligibles à la racine éphémère. */
export const REGENERABLE_CACHES = [
  'media-proxy',
  'media-native',
  'media-composed',
  'media-isolated',
  'variant-availability',
  'product-enrichment',
] as const;
export type RegenerableCache = typeof REGENERABLE_CACHES[number];

export function regenerableCacheDir(name: RegenerableCache, env: NodeJS.ProcessEnv = process.env): string {
  if (!REGENERABLE_CACHES.includes(name)) throw new Error(`CACHE_NOT_REGENERABLE:${name}`);
  const root = String(env.AYROVI_CACHE_ROOT || '').trim();
  return root ? path.resolve(root, name) : path.resolve(process.cwd(), 'data', name);
}
