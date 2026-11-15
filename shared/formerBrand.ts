/**
 * ANCIENNE MARQUE — le SEUL fichier du produit où son nom a encore le droit
 * d'apparaître (16/11/2026).
 *
 * Le nom de domaine qui ressemblait à l'ancienne marque a été réservé par un
 * tiers. Tout ce qui portait ce nom a donc été renommé ZAYROVI : domaine
 * (zayrovi.com), adresses e-mail, identifiant Android/iOS, schéma de lien,
 * routes d'API, en-têtes, cookies, tables, variables d'environnement, fichiers.
 *
 * Ce qui reste ici n'est PAS une marque affichée. Ce sont des octets que des
 * données déjà enregistrées exigent encore, et qu'on ne peut pas changer sans les
 * détruire :
 *
 *  1. ÉTIQUETTES CRYPTOGRAPHIQUES FIGÉES. Elles entrent dans le calcul de clés
 *     de chiffrement et d'empreintes déjà stockées (secrets TOTP des
 *     administrateurs, codes de secours, e-mails chiffrés, jetons de prix).
 *     Changer un seul caractère rendrait ces données illisibles pour toujours :
 *     administrateurs bloqués, e-mails perdus. Elles ne sont jamais montrées.
 *  2. LE NOM À MIGRER. Les bases existantes contiennent des tables, colonnes et
 *     valeurs à l'ancien nom ; la migration (src/db/formerBrandMigration.ts) doit
 *     savoir ce qu'elle cherche pour le renommer.
 *  3. LE PRÉFIXE DES ANCIENNES VARIABLES D'ENVIRONNEMENT, lu une seule fois au
 *     démarrage pour ne pas casser un serveur déjà configuré.
 *
 * Le test `tests/zayrovi-rebrand.test.ts` échoue si l'ancien nom réapparaît
 * ailleurs que dans la courte liste d'exceptions qu'il documente.
 */

/** L'ancien nom, en minuscules. */
export const FORMER_BRAND = 'ayrovi';

/** Préfixe des anciennes variables d'environnement (`AYROVI_…`, `AYROVIX_…`). */
export const FORMER_ENV_PREFIX = 'AYROVI';

/**
 * Étiquettes de séparation de domaine — FIGÉES octet pour octet.
 * Voir le point 1 ci-dessus : ne jamais les « renommer ».
 */
export const FROZEN_CRYPTO_LABELS = Object.freeze({
  /** Empreinte des codes de secours administrateur (stockées en base). */
  adminRecovery: 'ayrovi-admin-recovery:',
  /** Clé de chiffrement des secrets TOTP administrateur (stockés en base). */
  adminTotp: 'ayrovi-admin-totp:v1:',
  /** Matière de clé TOTP de secours, hors production uniquement (bases locales déjà enrôlées). */
  adminTotpDevelopmentKey: 'ayrovi-dev-only-admin-totp-key',
  /** Clé de chiffrement des e-mails de compte en attente d'envoi. */
  authMail: 'ayrovi-auth-mail-v1',
  /** HKDF des jetons de prix (portés par les paniers existants). */
  quoteSalt: 'ayrovi:quote-salt:v1',
  quoteInfo: 'ayrovi:ayrovix-quote:v1',
  /** HKDF des jetons de devis AYWEBs. */
  aywebsQuoteSalt: 'ayrovi:aywebs-quote-salt:v1',
  aywebsQuoteInfo: 'ayrovi:aywebs-quote:v1',
  /** Tirage reproductible de la relecture des devis AYWEBs. */
  aywebsQuoteSample: 'ayrovi:aywebs-quote-sample:v1',
  /** Graine de vérification des captures WebView AYWEBs. */
  aywebsWebviewVerify: 'ayrovi:aywebs-webview-verify:v1',
});

/**
 * `…-beta1` / `…_beta1` n'est pas la marque : c'est le nom technique du dépôt
 * GitHub et des services Render (`…-beta1-1.onrender.com`), qui servent encore
 * l'API des applications installées. Le renommer couperait le serveur.
 */
const INFRASTRUCTURE = '(?![-_]beta1)';
const FORMER = new RegExp(`(?<![zZ])(AYROVI|Ayrovi|ayrovi)${INFRASTRUCTURE}`, 'g');
const FORMER_DOMAIN = /(?<![zZ])ayrovi\.(?:tn|com)\b/gi;
const FORMER_ANY_CASE = new RegExp(`(?<![zZ])ayrovi${INFRASTRUCTURE}`, 'i');
const NEW_FOR: Record<string, string> = { AYROVI: 'ZAYROVI', Ayrovi: 'Zayrovi', ayrovi: 'zayrovi' };

/** Le texte contient-il l'ancien nom (hors « zayrovi », qui le contient aussi) ? */
export function mentionsFormerBrand(value: unknown): boolean {
  return typeof value === 'string' && FORMER_ANY_CASE.test(value);
}

/**
 * Remplace l'ancien nom par ZAYROVI en respectant la casse ; l'ancien domaine
 * (`.tn` comme `.com`) devient le domaine officiel `zayrovi.com`.
 */
export function renameFormerBrand(value: string): string {
  return value.replace(FORMER_DOMAIN, 'zayrovi.com').replace(FORMER, (match) => NEW_FOR[match] ?? match);
}

/**
 * Valeurs enregistrées en texte libre (avec espaces) que le code comparait telles
 * quelles. Les identifiants (sans espace) sont renommés par règle générale.
 */
export const FORMER_EXACT_TEXT_VALUES: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['Client AYROVI', 'Client ZAYROVI'],
] as const);

/**
 * Expressions techniques renommées partout où elles apparaissent, même au milieu
 * d'un texte : le nom CSS de la police maison, enregistré dans les thèmes du site
 * (`'… Extracted Sans', 'Noto Sans Arabic', sans-serif`). Sans cela, une pile de
 * polices enregistrée ne trouverait plus la police déclarée sous le nouveau nom.
 */
export const FORMER_TECHNICAL_PHRASES: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['Ayrovi Extracted Sans', 'Zayrovi Extracted Sans'],
  ['AYROVI EXTRACTED SANS', 'ZAYROVI EXTRACTED SANS'],
] as const);

/**
 * Première migration de marque (16/10/2026) : textes des graines d'origine.
 * Chaque ligne : [table, colonne, condition supplémentaire, ancienne valeur, nouvelle valeur].
 * Un texte modifié depuis le Dashboard n'est jamais touché (égalité exacte exigée).
 */
export const REBRAND_V1_SEED_VALUES: ReadonlyArray<readonly [string, string, string, string, string]> = Object.freeze([
  ['settings', 'setting_value', "setting_key IN ('company_name','company_legal_name')", 'AYROVI', 'ZAYROVI'],
  ['settings', 'setting_value', "setting_key='unavailable_refund_policy'",
    'Acompte remboursé si AYROVI ne peut pas valider ou acheter l’article demandé',
    'Acompte remboursé si ZAYROVI ne peut pas valider ou acheter l’article demandé'],
  ['admin_users', 'name', '1=1', 'AYROVI Admin', 'ZAYROVI Admin'],
  ['news_items', 'author', '1=1', 'Équipe AYROVI', 'Équipe ZAYROVI'],
  ['news_items', 'title', "id='news_arrival_08'", 'Le nouvel arrivage AYROVI est ouvert', 'Le nouvel arrivage ZAYROVI est ouvert'],
  ['news_items', 'content', "id='news_arrival_08'",
    'Préparez vos liens et captures avec Lens. AYROVI centralise le calcul, l’achat et la livraison en Tunisie.',
    'Préparez vos liens et captures avec Lens. ZAYROVI centralise le calcul, l’achat et la livraison en Tunisie.'],
  ['lens_hero_settings', 'phone_status_label', '1=1', 'AYROVI LENS', 'ZAYROVI LENS'],
  ['stories_showcase_settings', 'title', "id='global'", 'Social AYROVI', 'Social ZAYROVI'],
  ['story_publishers', 'name', "id='pub_zayrovi'", 'Ayrovi', 'Zayrovi'],
  ['reels', 'title', "id='reel_demo_01'", 'La sélection AYROVI en mouvement', 'La sélection ZAYROVI en mouvement'],
  ['stories', 'description', "id='story_demo_02'", 'Ce que l’équipe AYROVI a sélectionné pour vous.', 'Ce que l’équipe ZAYROVI a sélectionné pour vous.'],
  ['ai_knowledge', 'answer', "id='ai_delivery'",
    'AYROVI livre dans les 24 gouvernorats. Le délai indicatif configuré est de 5 à 8 jours ouvrés.',
    'ZAYROVI livre dans les 24 gouvernorats. Le délai indicatif configuré est de 5 à 8 jours ouvrés.'],
  ['ai_knowledge', 'answer', "id='ai_payment'",
    'Les moyens gérés par AYROVI sont le paiement à la livraison, D17 et Flouci.',
    'Les moyens gérés par ZAYROVI sont le paiement à la livraison, D17 et Flouci.'],
  ['erp_organizations', 'name', "code='ORG-0001'", 'AYROVI', 'ZAYROVI'],
  ['erp_organizations', 'legal_name', "code='ORG-0001'", 'AYROVI', 'ZAYROVI'],
  // fiche employé miroir de l'admin d'origine (son ancien nom découpé en prénom / nom)
  ['erp_employees', 'first_name', "last_name='Admin' AND user_id IN (SELECT id FROM admin_users WHERE name='ZAYROVI Admin')", 'AYROVI', 'ZAYROVI'],
  ['erp_sequences', 'description', "sequence_key='ayweb_cart_item_number'", 'Identité AYROVI d’une ligne de panier AyWebs', 'Identité ZAYROVI d’une ligne de panier AyWebs'],
  ['erp_sequences', 'description', "sequence_key='ayweb_package_number'", 'Colis consolidé en entrepôt AYROVI', 'Colis consolidé en entrepôt ZAYROVI'],
  ['public_nav_items', 'label_ar', "destination='news'", 'مجلة AYROVI', 'مجلة ZAYROVI'],
] as const);

/** Contenu LENS v2 (JSON) de la graine d'origine : [ancien fragment, nouveau fragment]. */
export const REBRAND_V1_LENS_FRAGMENTS: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['Propulsé par l’IA AYROVI', 'Propulsé par l’IA ZAYROVI'],
  ['"AYROVI LENS"', '"ZAYROVI LENS"'],
] as const);
