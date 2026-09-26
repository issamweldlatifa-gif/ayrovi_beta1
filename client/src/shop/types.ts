/**
 * CONTRAT UNIQUE DE LA BOUTIQUE (v2, 25/09/2026).
 *
 * Pourquoi ce fichier existe : les écrans actuels reçoivent des objets bruts
 * (candidat Lens, produit scrapé, ligne de panier) et recalculent chacun de leur
 * côté ce qu'il faut afficher — le prix barré ici, la disponibilité là, le titre
 * découpé ailleurs. Trois écrans, trois vérités, et l'écart se voit à l'œil nu.
 *
 * `ProductView` est la SEULE forme que la boutique v2 sait afficher. Elle est
 * produite une fois, par un adaptateur, et consommée telle quelle : un composant
 * de la boutique ne calcule jamais un prix, ne devine jamais une taille, et ne
 * fabrique jamais un texte absent de la source.
 *
 * Règle non négociable : tout champ dont la source ne dit rien vaut `null`, et
 * `null` s'affiche comme une absence — jamais comme une valeur par défaut.
 */

/** Les trois seuls états de stock reconnus (moteur de disponibilité, phase 3). */
export type StockState = 'available' | 'unavailable' | 'unknown';

export interface Money {
  /** Montant en dinars, déjà converti et arrondi par le serveur. */
  tnd: number;
  /** Montant d'origine chez le marchand, pour la transparence. `null` si inconnu. */
  source?: { amount: number; currency: string } | null;
}

export interface PriceView {
  current: Money;
  /** Prix de référence barré. `null` = pas de promotion, donc aucune barre. */
  reference: Money | null;
  /** Remise en pourcentage entier, calculée par le serveur. `null` si pas de promo. */
  discountPercent: number | null;
  /** Vrai si le prix vient d'être vérifié à la source (affiche la mention). */
  verifiedAtSource: boolean;
}

export interface SizeOption {
  /** Valeur affichée dans l'échelle principale (ex. « M », « 42 »). */
  value: string;
  /** Même taille dans l'échelle de la marque, QUAND la source la donne. */
  brandValue: string | null;
  state: StockState;
  /**
   * Quantité restante annoncée PAR LA SOURCE. Google/SerpApi ne l'exposent
   * jamais : ce champ reste `null` sauf si un marchand la publie explicitement.
   */
  remaining: number | null;
}

export interface MediaView {
  /** URL déjà passée par la composition AYROVI (produit détouré sur notre canvas). */
  src: string;
  /** Replis successifs, du meilleur rendu au plus sûr. */
  fallbacks: string[];
  alt: string;
}

export interface ProductView {
  id: string;
  /** Marque FOURNIE par la source. `null` si elle ne la donne pas — jamais déduite. */
  brand: string | null;
  title: string;
  /** Texte descriptif FOURNI par la source. `null` = la ligne grise ne s'affiche pas. */
  description: string | null;
  media: MediaView[];
  price: PriceView | null;
  sizes: SizeOption[];
  /** Nom de l'échelle principale (« EU », « FR »…) quand la source le précise. */
  sizeScaleLabel: string | null;
  colors: { name: string; media: MediaView | null; selected: boolean }[];
  /** Étiquettes factuelles à poser sur le média (promo, etc.). */
  flags: { kind: 'deal' | 'info'; label: string }[];
  merchant: { name: string; url: string } | null;
}

/** Ce que la fiche a le droit de faire, injecté par l'hôte — jamais deviné. */
export interface ProductActions {
  onBack?: () => void;
  onOpenBag?: () => void;
  onAddToBag?: (
    size: SizeOption | null,
    quantity: number,
    details: { note: string; link: string },
  ) => Promise<void> | void;
  onSelectColor?: (name: string) => void;
}

/** Vrai si la taille peut être commandée. `unknown` n'est JAMAIS commandable. */
export const isOrderable = (size: SizeOption | null | undefined): boolean =>
  Boolean(size && size.state === 'available');

/**
 * Raison FACTUELLE d'un refus. Retourne `null` quand il n'y a rien à refuser :
  * un message vide vaut mieux qu'un message inventé.
 */
export function refusalReason(size: SizeOption | null): 'unavailable' | 'unknown' | null {
  if (!size) return null;
  if (size.state === 'unavailable') return 'unavailable';
  if (size.state === 'unknown') return 'unknown';
  return null;
}

/** L'échelle marque n'existe que si la source la donne pour au moins deux tailles. */
export function hasBrandScale(sizes: SizeOption[]): boolean {
  return sizes.filter((size) => Boolean(size.brandValue && size.brandValue !== size.value)).length >= 2;
}
