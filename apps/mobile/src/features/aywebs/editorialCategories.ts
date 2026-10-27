/**
 * Les six catégories de la section 1 de l'accueil AYWEBs.
 *
 * ── Décision du 27/10/2026 ──────────────────────────────────────────────────
 * Le client a envoyé la capture de référence et les six photos, puis a demandé
 * que **ces six cartes-là** portent **ces six photos-là**. La section ne suit
 * donc plus « les six premières catégories du serveur » (qui affichaient
 * Marketplace, Mode, Chaussures, High-tech, Smartphones, Jeux vidéo — trois
 * d'entre elles sans photo, avec une icône d'étiquette à la place) : elle suit
 * cet ordre éditorial, exactement celui de la référence.
 *
 * Ce qui reste piloté par le serveur : le LIBELLÉ (le catalogue publie
 * `labelFr` / `labelAr` pour chaque catégorie) et le CONTENU (toucher une tuile
 * filtre les boutiques de la section 3). Les libellés ci-dessous ne servent que
 * de repli hors ligne : si le serveur ne connaît pas encore la catégorie, la
 * carte garde son nom au lieu d'afficher un identifiant technique.
 *
 * Les deux dernières — « Casques et écouteurs » (`audio`) et « Activités de
 * plein air » (`outdoor`) — sont de vraies catégories du registre depuis le
 * 27/10/2026 : 18 et 16 boutiques les déclarent (`aywebsCategoryExtras.ts`).
 */

export interface EditorialCategory {
  /** Identifiant de catégorie côté serveur. */
  id: string;
  /** Repli hors ligne, dans la langue de l'interface. */
  labelFr: string;
  labelAr: string;
}

/** L'ordre est celui de la référence : deux colonnes, trois rangées. */
export const EDITORIAL_CATEGORIES: readonly EditorialCategory[] = [
  { id: 'beauty', labelFr: 'Beauté et parfum', labelAr: 'الجمال والعطور' },
  { id: 'home', labelFr: 'Meubles', labelAr: 'الأثاث' },
  { id: 'sports', labelFr: 'Sports et loisirs', labelAr: 'الرياضة والأنشطة' },
  { id: 'audio', labelFr: 'Casques et écouteurs', labelAr: 'السماعات والهيدفون' },
  { id: 'outdoor', labelFr: 'Activités de plein air', labelAr: 'أنشطة في الهواء الطلق' },
  { id: 'pets', labelFr: 'Animalerie', labelAr: 'مستلزمات الحيوانات' },
] as const;

/**
 * La catégorie telle que l'écran doit la dessiner : le libellé du SERVEUR s'il
 * existe, sinon le repli local — jamais l'identifiant.
 */
export function editorialCategory(
  entry: EditorialCategory,
  published: ReadonlyArray<{ id: string; labelFr: string; labelAr: string }>,
  locale: 'fr' | 'ar',
): { id: string; labelFr: string; labelAr: string } {
  const server = published.find((category) => category.id === entry.id);
  const labelFr = (server?.labelFr || '').trim() || entry.labelFr;
  const labelAr = (server?.labelAr || '').trim() || entry.labelAr;
  /* Une traduction arabe identique au français signale une donnée absente :
     on préfère alors notre repli, déjà traduit. */
  return {
    id: entry.id,
    labelFr,
    labelAr: locale === 'ar' && (!labelAr || labelAr === labelFr) ? entry.labelAr : labelAr,
  };
}
