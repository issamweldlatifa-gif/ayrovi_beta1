/**
 * D'OÙ VIENNENT LES FICHES DE LENS — l'interrupteur unique.
 *
 *   links  (défaut) — « liens d'abord » : SerpApi ne fournit QUE les liens des
 *                     pages marchandes. Prix, photos, disponibilité et options
 *                     (taille / contenance / type) sont lus sur la page du
 *                     marchand (`linkFirst/`), puis passent par le moteur de
 *                     prix AYROVI (conversion, droits, TVA, promo) et par
 *                     l'isolation des images.
 *   legacy          — l'ancien système : prix, miniatures et `in_stock` repris
 *                     tels que SerpApi les rapporte, descriptions et galeries
 *                     demandées à d'autres appels SerpApi payants. Il vit
 *                     désormais dans `legacy/` et n'est atteint QUE par cet
 *                     interrupteur.
 *
 * `AYROVI_LENS_SOURCE=legacy` rétablit l'ancien comportement sans redéploiement
 * de code — un retour arrière d'exploitation, pas une seconde voie à maintenir.
 */
export type LensSourceMode = 'links' | 'legacy';

export function lensSourceMode(): LensSourceMode {
  return String(process.env.AYROVI_LENS_SOURCE || '').trim().toLowerCase() === 'legacy' ? 'legacy' : 'links';
}

export function isLegacyLensSource(): boolean {
  return lensSourceMode() === 'legacy';
}
