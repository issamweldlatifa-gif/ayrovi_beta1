/**
 * AYWEBs — CONTRAT D'ÉMISSION DEPUIS LE WebView DU CLIENT (Phase 2.1, 06/10/2026).
 *
 * ── LE MODÈLE (celui d'Add-to-Buyee) ────────────────────────────────────────
 * La page RÉELLE est sous les yeux du client, dans son navigateur : c'est la
 * seule lecture que ni l'IP du serveur ni un mur anti-robot ne peuvent gâcher.
 * Le client apporte donc des FAITS LUS : des textes, pas des nombres, pas de
 * DOM, pas de HTML. Le serveur applique SES règles (celles de la Phase 0 :
 * `priceIntegrity.ts`) sur ces textes et décide seul :
 *   • quel montant est lisible et exploitable ;
 *   • si la devise est prouvée (code ISO explicite — même règle que le lecteur
 *     serveur, `productPageParser.ts`) ;
 *   • si le prix est CORROBORÉ (JSON-LD, ou deux sources indépendantes d'accord) ;
 *   • l'état de disponibilité, d'après une liste de formulations limitée et
 *     documentée.
 *
 * Un client ne peut donc pas « envoyer un prix » : il peut seulement envoyer
 * une chaîne que le serveur interprète — et toute chaîne acceptée est conservée
 * comme preuve, avec son empreinte, pour l'audit et la re-vérification.
 *
 * ── CE QUI RESTE INTERDIT ───────────────────────────────────────────────────
 * Le HTML brut de la page (route `rejectProvidedPage`) : il contient le DOM du
 * compte connecté, des champs privés et des scripts — et il faisait croire à une
 * « capture » alors que le serveur n'en tirait aucune preuve indépendante.
 * Ce contrat le remplace par une dizaine de champs bornés.
 *
 * ── VOLONTAIREMENT ABSENT (à ne pas ajouter sans réflexion) ─────────────────
 * Aucune valeur numérique de prix, aucun identifiant de variante, aucun état de
 * stock pré-calculé, aucune clé de signature côté client : une clé embarquée
 * dans une application n'est pas un secret, et un nombre fourni par le client
 * n'est pas une lecture.
 */

export const AYWEBS_CAPTURE_VERSION = 1;

export const AYWEBS_CAPTURE_LIMITS = {
  /** Taille maximale du JSON de capture (octets). Une page pèse 1–2 Mo : ici, quelques ko. */
  maxBytes: 64_000,
  maxPriceCandidates: 4,
  maxTextLength: 300,
  maxTitleLength: 300,
  maxVariantTexts: 30,
  maxSelectedVariantTexts: 5,
  /** Groupes de variantes nommés (23/10/2026) : mêmes bornes que le script client. */
  maxVariantGroups: 4,
  maxVariantGroupValues: 20,
  /** Prix publiés par valeur : texte borné, même règle que les prix de page. */
  maxVariantValuePriceLength: 60,
  maxImages: 4,
  /** Au-delà, la capture est refusée : une page ouverte il y a une heure n'est pas une preuve. */
  maxAgeMs: 10 * 60_000,
  /** Tolérance d'horloge (le téléphone du client peut avancer un peu). */
  maxClockSkewMs: 60_000,
} as const;

/**
 * Ce que la page publie pour UNE valeur d'un groupe (« Rouge », « 42 », « 150 ml »).
 *
 * Constat du 23/10/2026 (capture d'écran du client, Amazon) : la feuille de choix
 * demandait au client de RÉINJECTER le lecteur à chaque changement de couleur, et
 * ne savait pas dire si l'autre couleur était disponible. Or la page publiait déjà,
 * sur la carte de chaque valeur : un prix (« $88.00 », « 5 options from $56.32 »)
 * et, quand il existe, l'état de stock (« In Stock »). Ces faits sont lus UNE fois,
 * dans la même capture, et la feuille les affiche.
 *
 * Aucun champ n'est deviné : `available` vaut `false` seulement quand la page
 * désactive explicitement la valeur (`disabled`, `aria-disabled="true"`, classe
 * « out-of-stock ») ; il reste `null` quand la page ne dit rien.
 */
export interface AyWebsCapturedVariantValue {
  value: string;
  available?: boolean | null;
  /** Prix affiché SUR CETTE VALEUR, tel qu'écrit (« $88.00 », « 12,95 € »). */
  price?: string | null;
  /** `true` quand le prix est une entrée de gamme (« à partir de », « from »). */
  priceFrom?: boolean;
  /** Stock annoncé sur la valeur (« Only 6 left ») — jamais déduit. */
  stock?: number | null;
}

/** Groupe de variantes nommé, tel que lu par le script du client. */
export interface AyWebsCapturedVariantGroup {
  name: string;
  values: string[];
  /** Valeur affichée sur la page — une seule, ou vide. */
  selected?: string[];
  /**
   * États et prix PUBLIÉS pour chaque valeur (23/10/2026). Le même ordre n'est
   * pas garanti : `value` fait foi. Absent = la page ne publie rien de plus que
   * le libellé — la feuille le dit au lieu de bloquer sans explication.
   */
  options?: AyWebsCapturedVariantValue[];
}

/**
 * D'où vient un texte de prix — conservé pour l'audit et la corroboration.
 *
 * `a11y_label` : étiquette d'accessibilité de la zone d'achat (Amazon), c'est-à-dire
 * une CHAÎNE COMPLÈTE écrite par la page — par opposition à `dom`, où le montant est
 * reconstruit par nous depuis ses fragments (symbole + entier + décimale). Les deux
 * familles d'accord corroborent ; deux lectures d'une même famille ne le font pas.
 *
 * `embedded_json` : prix publié dans un script de la page (« "displayPrice":"$109.00" »),
 * lu tel quel, jamais recomposé.
 */
export type AyWebsCaptureSource = 'json_ld' | 'microdata' | 'embedded_json' | 'meta' | 'a11y_label' | 'dom';

export interface AyWebsCapturedPriceCandidate {
  /** Texte de prix TEL QU'AFFICHÉ par la page (« 1 299,00 € », « $6.99 »). */
  text: string;
  source: AyWebsCaptureSource;
}

export interface AyWebsAmazonEvidence {
  readerVersion?: number;
  pageAsin?: string | null;
  selectedAsin?: string | null;
  /** Valeurs AFFICHÉES comme choisies (lues dans les données du twister). */
  selectedValues?: string[];
  options?: Array<{
    dimension: string;
    value: string;
    asin?: string | null;
    selected?: boolean;
    availabilityEvidence?: 'available' | 'unavailable' | 'unknown';
    /** Prix affiché SUR LA CARTE de ce choix, tel qu'écrit ; jamais un devis. */
    price?: string | null;
    /**
     * Le prix de la carte est un « à partir de » (« 5 options from $56.32 ») :
     * une entrée de gamme, jamais le prix de cette valeur (23/10/2026).
     */
    priceFrom?: boolean;
    /** Stock annoncé sur la carte (« Only 6 left in stock »). */
    stock?: number | null;
    source?: string;
  }>;
  variants?: Array<{
    asin: string;
    selected?: boolean;
    dimensions?: Array<{ name: string; value: string }>;
    source?: string;
  }>;
}

export interface AyWebsCapturedPage {
  /** Version du contrat : un serveur ancien refuse une capture future. */
  v: number;
  /** Codes courts du lecteur (ex. « price:buybox », « title:visible ») — jamais de texte de page. */
  diagnostics?: string[];
  /** Identité/version du lecteur livré par le serveur — diagnostic seulement, jamais une preuve métier. */
  reader?: { id: string | null; version: number } | null;
  /**
   * Amazon : variantes et option choisie (évidence structurée, sans texte libre).
   * Les index numériques ne deviennent jamais des noms d'option : le lecteur les résout
   * via variationValues, ou les écarte.
   */
  amazon?: AyWebsAmazonEvidence | null;
  /** URL de la page réellement affichée dans le WebView. */
  url: string;
  /** `<link rel="canonical">` ou `og:url`, quand la page les publie. */
  canonicalUrl?: string | null;
  /** Titre affiché (og:title / <title> / JSON-LD name) — texte brut. */
  title?: string | null;
  brand?: string | null;
  /** 1 à 4 lectures de prix indépendantes (JSON-LD, meta, DOM…). */
  priceCandidates: AyWebsCapturedPriceCandidate[];
  /** Preuve de devise telle qu'affichée : « € », « EUR », « د.ت », « $ ». */
  currencyText?: string | null;
  /** Disponibilité publiée (valeur structurée) ou texte proche du bouton d'achat. */
  availabilityText?: string | null;
  /** Libellé/état du bouton d'achat POUR LA SÉLECTION COURANTE. */
  addToCartText?: string | null;
  /** État neuf/occasion/reconditionné publié par la source (JSON-LD itemCondition). */
  conditionText?: string | null;
  /** Options choisies par le client sur la page (libellés bruts). */
  selectedVariantTexts?: string[];
  /** Options publiées par la page (libellés bruts, bornés). */
  variantTexts?: string[];
  /**
   * Groupes de variantes NOMMÉS (« Taille », « Couleur ») avec leurs valeurs et
   * celle qui est affichée. Lus uniquement sur les boutiques sans adaptateur
   * d'URL (23/10/2026) : un `<label for>`, un `<legend>`, un `aria-label` ou le
   * `name` du champ nomme le groupe. Bornes : 4 groupes, 20 valeurs, 60 car.
   */
  variantGroups?: AyWebsCapturedVariantGroup[];
  /** Images trouvées (URLs http/https seulement). */
  images?: string[];
  /** Horodatage ISO de la lecture, dans le navigateur du client. */
  capturedAt: string;
  /** Langue de la page, si disponible (diagnostic de la lecture de prix). */
  pageLang?: string | null;
}

/** Résumé de ce qui a été retenu — renvoyé au client et journalisé. */
export interface AyWebsCaptureOutcome {
  used: boolean;
  /** Empreinte SHA-256 de l'évidence acceptée (auditable, jamais secrète). */
  fingerprint: string | null;
  /** Source du prix retenu, ou `null` si aucun prix n'a été lu. */
  priceSource: AyWebsCaptureSource | null;
  /** Prix corroboré (JSON-LD, ou deux sources indépendantes d'accord). */
  corroborated: boolean;
  /** Motif de refus/indisponibilité de la capture (code stable), sinon `null`. */
  rejection: string | null;
}

/** Codes de refus/limites de la capture — jamais affichés tels quels au client. */
export const AYWEBS_CAPTURE_REJECTIONS = [
  'NOT_AN_OBJECT',
  'BAD_VERSION',
  'TOO_LARGE',
  'URL_HOST_MISMATCH',
  'CANONICAL_HOST_MISMATCH',
  'STALE_CAPTURE',
  'FUTURE_CAPTURE',
  'NO_PRICE_TEXT',
  'PRICE_REJECTED',
  'AMBIGUOUS_PRICE',
  /**
   * Prix lu d'UNE seule source sur un domaine hors registre (Phase 2.1).
   * Sur une boutique nommée, une source unique reste acceptable ; sur un domaine
   * inconnu, il faut la donnée machine du marchand (JSON-LD) ou deux sources
   * indépendantes d'accord — sinon le montant n'est pas exploitable.
   */
  'PRICE_NOT_CORROBORATED',
  /** Zone d'achat Amazon désignant un AUTRE article que l'URL (ASIN différent). */
  'BUYBOX_ASIN_MISMATCH',
  'NO_AVAILABILITY_EVIDENCE',
  /**
   * Amazon, fiche à plusieurs variantes (couleur, taille…) : l'option CHOISIE n'est pas
   * prouvée (absente, non confirmée, indisponible, ou pas la fiche ouverte). Le prix de
   * la zone d'achat ne vaut que pour l'option choisie : on refuse plutôt que de deviner.
   * Actif seulement avec AYWEBS_AMAZON_VARIANT_CONTRACT=1.
   */
  'VARIANT_NOT_PROVEN',
  /**
   * Fiche en rupture : aucun prix publié ET l'élément de disponibilité dit « Currently unavailable »
   * (ou équivalent). Refusée comme toute capture sans prix ; c'est la cause, pas « NO_PRICE_TEXT ».
   */
  'OUT_OF_STOCK',
  /**
   * La capture ne décrit PAS une fiche produit : aucun prix, aucune commande
   * d'achat, aucune variante, aucun repère de fiche (23/10/2026). C'est la page
   * d'accueil, un rayon, une page de recherche ou une bannière — le lecteur a
   * été injecté au mauvais endroit, ou la boutique a servi une page de
   * redirection pays. Refus explicite : ce n'est pas « un prix illisible ».
   */
  'NOT_A_PRODUCT_PAGE',
] as const;

/**
 * Nature de la PAGE lue — décidée par le SERVEUR à partir de la capture, jamais
 * par le client (23/10/2026 : « le script ne s'injecte que sur une fiche »).
 *
 *   • `PRODUCT_CARD` — une fiche : un article identifié (titre) ET au moins un
 *     repère de vente (prix publié, commande d'achat, variantes, ou la coquille
 *     produit Amazon avec son ASIN) ;
 *   • `STOREFRONT`   — une page de magasin : aucun repère de vente (accueil,
 *     rayon, recherche, redirection pays) ;
 *   • `AD`           — un prix SANS identité d'article : bannière, encart
 *     sponsorisé, page promotionnelle. Un prix seul n'est jamais une fiche.
 */
export type AyWebsPageKind = 'PRODUCT_CARD' | 'STOREFRONT' | 'AD';

/** Ce que la page PUBLIE, réduit à des booléens — aucune donnée personnelle. */
export interface AyWebsPageSignals {
  hasTitle: boolean;
  hasPrice: boolean;
  hasPurchaseControl: boolean;
  hasVariants: boolean;
  hasImages: boolean;
  /** Coquille produit Amazon (`#dp`, ASIN) : une fiche même sans prix lisible. */
  hasProductShell: boolean;
}

export type AyWebsCaptureRejection = (typeof AYWEBS_CAPTURE_REJECTIONS)[number];
