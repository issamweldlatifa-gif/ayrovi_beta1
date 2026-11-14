/**
 * Module PUR (aucun import natif) : les cotes de modèles (`templateMetrics`),
 * les tests et les composants lisent la même source. Ré-exporté par
 * `tokens.mobile.ts`.
 */

/**
 * « Avant ça, fais un système d'espacement » (retour du 14/11, Publication
 * jugée chargée et fatigante). Référence : les planches Zalando fournies
 * (125655 → 125749), relevées en dp :
 *   • marge latérale ≈ 12–16 · photo → marque ≈ 12 · titre → texte ≈ 16–24 ;
 *   • texte → lien / bouton ≈ 16–24 · lien → rangée de cartes ≈ 24–32 ;
 *   • fin d'une section → titre de la suivante ≈ 48–64 (le blanc SÉPARE,
 *     aucun filet).
 *
 * `SPACE` donne des NOMBRES ; `RHYTHM` leur donne un RÔLE. Un écran ne choisit
 * plus « 12 ou 16 ? » : il dit ce que l'espace sépare. Règle de proximité :
 * plus deux éléments sont liés, plus l'espace est petit — l'espace entre deux
 * groupes est toujours PLUS GRAND que l'espace à l'intérieur d'un groupe.
 * Toutes les valeurs viennent de l'échelle de l'identité (vérifié par test).
 */
export const RHYTHM = {
  /** Icône ↔ son compteur, pastilles empilées. */
  inline: 4,
  /** Titre ↔ sous-titre, lignes d'un même bloc de texte. */
  tight: 8,
  /** Photo ↔ texte de carte, lignes d'une liste, rangées d'une feuille. */
  related: 12,
  /** Marge de feuille, titre de section ↔ son contenu, écart entre éléments d'écran. */
  group: 16,
  /** Groupes d'une même section (texte ↔ action, bandeau ↔ contenu). */
  block: 24,
  /** Contenu ↔ rangée de cartes ; fin d'un bloc Publication ↔ bloc suivant. */
  cluster: 32,
  /** Entre deux sections d'une page (rubriques, campagnes). */
  section: 48,
  /** Entre deux zones de page (en-tête héros ↔ fil). */
  chapter: 64,
} as const;
export type RhythmRole = keyof typeof RHYTHM;
