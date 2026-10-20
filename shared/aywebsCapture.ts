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
  maxImages: 4,
  /** Au-delà, la capture est refusée : une page ouverte il y a une heure n'est pas une preuve. */
  maxAgeMs: 10 * 60_000,
  /** Tolérance d'horloge (le téléphone du client peut avancer un peu). */
  maxClockSkewMs: 60_000,
} as const;

/** D'où vient un texte de prix — conservé pour l'audit et la corroboration. */
export type AyWebsCaptureSource = 'json_ld' | 'microdata' | 'meta' | 'dom';

export interface AyWebsCapturedPriceCandidate {
  /** Texte de prix TEL QU'AFFICHÉ par la page (« 1 299,00 € », « $6.99 »). */
  text: string;
  source: AyWebsCaptureSource;
}

export interface AyWebsCapturedPage {
  /** Version du contrat : un serveur ancien refuse une capture future. */
  v: number;
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
  'NO_AVAILABILITY_EVIDENCE',
] as const;

export type AyWebsCaptureRejection = (typeof AYWEBS_CAPTURE_REJECTIONS)[number];
