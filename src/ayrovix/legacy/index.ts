/**
 * ANCIEN SYSTÈME « FICHES DEPUIS SERPAPI » — isolé ici (01/10/2026).
 *
 * Avant : les fiches de la grille Lens prenaient chez SerpApi leur prix, leurs
 * miniatures et leur `in_stock`, puis deux autres appels SerpApi payants
 * (`google_shopping`, `google_product`) complétaient description, galerie et
 * tailles. Tout cela est conservé, intact, derrière UNE porte :
 * `AYROVI_LENS_SOURCE=legacy`.
 *
 * Règle d'architecture (vérifiée par `tests/link-first-isolation.test.ts`) :
 * hors de `legacy/` et de `services/visualSearch.ts`, personne n'importe
 * `lensEnrichment` ni `productEnrichment`. Les routes passent par les
 * fonctions ci-dessous, qui ne font RIEN en mode « liens d'abord ».
 */
import type { AyrovixCandidate } from '../types';
import { isLegacyLensSource } from '../lensSource';
import { enrichCandidateDescriptions } from './lensEnrichment';
import { enrichProduct, EMPTY_ENRICHMENT, type ProductEnrichment } from './productEnrichment';

/** Description d'une grille : un appel SerpApi par fiche — legacy uniquement. */
export async function legacyEnrichDescriptions(candidates: AyrovixCandidate[]): Promise<AyrovixCandidate[]> {
  return isLegacyLensSource() ? enrichCandidateDescriptions(candidates) : candidates;
}

/** Galerie/tailles complétées par SerpApi pour la fiche ouverte — legacy uniquement. */
export async function legacyEnrichProduct(
  title: string,
  options: Parameters<typeof enrichProduct>[1],
): Promise<ProductEnrichment> {
  return isLegacyLensSource() ? enrichProduct(title, options) : EMPTY_ENRICHMENT;
}
