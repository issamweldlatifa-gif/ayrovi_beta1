/**
 * Moyens de paiement — SOURCE UNIQUE de la disponibilité.
 *
 * Pourquoi ce fichier existe : jusqu'ici la règle « ce moyen est-il réellement utilisable ? »
 * était dupliquée dans plusieurs écrans : au premier changement de configuration,
 * la caisse et le pied de page auraient pu annoncer des moyens de paiement différents.
 *
 * Ici, une seule fonction répond : `availablePaymentMethods(policy)`. Elle est consommée par la
 * caisse, par le pied de page et par les tests. La règle est la même que celle du serveur :
 * un moyen n'est disponible que si sa configuration OFFICIELLE existe.
 *
 *   • CARTE        → passerelle réelle configurée (`capabilities.cardGateway`), confirmée serveur.
 *   • VIREMENT     → RIB publié par l'Admin (`deposit.bankRib`).
 *   • POSTE / CCP  → compte postal publié par l'Admin (`deposit.posteAccount`).
 *   • FLOUCI / D17 → JAMAIS disponible sans passerelle : le numéro seul ne crée pas un paiement.
 *
 * Corollaire : quand rien n'est configuré, l'application ne se tait pas — elle l'annonce. C'est
 * exactement ce que fait la caisse (« la commande peut être créée, le paiement reste en attente
 * dans votre espace »), et le pied de page doit dire la même chose.
 */
import type { CommercePolicy } from './policy';

export type PaymentMethodId =
  | 'COD'
  | 'CARD' | 'FLOUCI' | 'D17' | 'BANK_TRANSFER' | 'POSTE'
  | 'OOREDOO' | 'ORANGE' | 'SODEXO';

/**
 * Marque NEUTRE, la nôtre : un nom du registre de glyphes central (`design/editorial/glyphs.json`),
 * rendu par l'unique moteur d'icônes. Aucune géométrie n'est écrite ici — c'est la règle du projet.
 * C'est la seule marque autorisée sur la signature publique : les visuels de marques tierces
 * (photo de carte, logo d'opérateur) restent dans la caisse, là où le moyen est explicitement choisi.
 *
 * Correspondances : carte → `Card` · mobile → `Phone` · virement → `Bank` · postal → `Mail`.
 */
export type PaymentMethodGlyph = 'Card' | 'Phone' | 'Bank' | 'Mail';

export type PaymentMethodMark =
  /** Marque locale (déjà dans `client/public/media/payments/`) — jamais un CDN externe. */
  | { kind: 'image'; src: string }
  /** Transfert : pas de logo à nous, donc un glyphe du jeu d'icônes maison. */
  | { kind: 'glyph'; glyph: 'transfer' };

export interface PaymentMethodDefinition {
  id: PaymentMethodId;
  /** Libellé neutre, sans nom de réseau : le pied de page n'affiche jamais « Visa »/« Mastercard ». */
  label: string;
  labelAr: string;
  /** Ce que dit le moyen quand il est réellement disponible. */
  hint: string;
  hintAr: string;
  /** Pourquoi il ne l'est pas — la raison FACTUELLE, pas « indisponible ». */
  blocked: string;
  blockedAr: string;
  mark: PaymentMethodMark;
  /** Marque propriétaire utilisée par le pied de page (fond noir) — jamais une image tierce. */
  glyph: PaymentMethodGlyph;
  /**
   * Encaissement EN LIGNE ? Le paiement à la livraison n'en est pas un : l'argent
   * change de main chez le client. La distinction compte, parce que le pied de
   * page annonce ce que le site sait encaisser **en ligne** — y glisser le
   * paiement à la livraison laisserait croire qu'une passerelle est ouverte.
   */
  online: boolean;
  available: (policy: CommercePolicy) => boolean;
}

export const PAYMENT_METHODS: PaymentMethodDefinition[] = [
  {
    /*
     * PAIEMENT À LA LIVRAISON — le seul moyen qui n'a besoin d'AUCUNE passerelle :
     * l'argent change de main devant le client. Il est donc réellement
     * encaissable dès aujourd'hui, et c'est lui qui permet d'éprouver la chaîne
     * complète — commande, facture, suivi — sans attendre une intégration.
     */
    id: 'COD',
    glyph: 'Bank',
    label: 'Paiement à la livraison',
    labelAr: 'الدفع عند الاستلام',
    hint: 'Vous payez le livreur à la remise du colis',
    hintAr: 'تخلّص الموزّع وقت ما يوصلك الطرد',
    blocked: 'Désactivé par la boutique',
    blockedAr: 'معطّل من المتجر',
    mark: { kind: 'glyph', glyph: 'transfer' },
    online: false,
    // Aucune configuration technique à vérifier : seule la boutique peut le retirer.
    available: () => true,
  },
  {
    id: 'CARD',
    glyph: 'Card',
    label: 'Carte bancaire',
    labelAr: 'بطاقة بنكية',
    hint: 'Paiement immédiat, confirmé par le serveur',
    hintAr: 'دفع فوري، يؤكّده الخادم',
    blocked: 'Passerelle non configurée',
    blockedAr: 'بوابة الدفع غير مضبوطة',
    mark: { kind: 'image', src: '/media/payments/card.png' },
    online: true,
    available: (policy) => policy.deposit.cardGatewayAvailable,
  },
  {
    id: 'FLOUCI',
    glyph: 'Phone',
    label: 'Flouci / D17',
    labelAr: 'Flouci / D17',
    hint: 'Paiement mobile',
    hintAr: 'دفع عبر الهاتف',
    blocked: 'En attente d’une passerelle réelle',
    blockedAr: 'في انتظار بوابة دفع حقيقية',
    mark: { kind: 'image', src: '/media/payments/flouci.png' },
    // Un numéro de téléphone n'est pas une passerelle : sans intégration officielle, aucun
    // paiement ne peut être encaissé ni confirmé. Ce moyen reste donc définitivement indisponible
    // tant que le serveur ne l'expose pas — c'est la même décision que dans la caisse.
    online: true,
    available: () => false,
  },
  {
    id: 'BANK_TRANSFER',
    glyph: 'Bank',
    label: 'Pré-paiement (virement bancaire)',
    labelAr: 'دفع مسبق (تحويل بنكي)',
    hint: 'Coordonnées envoyées après la commande · expédition dès réception',
    hintAr: 'نبعثولك التفاصيل بعد الطلب · الإرسال كي يوصل الخلاص',
    blocked: 'RIB non publié',
    blockedAr: 'لم يُنشر RIB',
    mark: { kind: 'image', src: '/media/payments/bank-transfer.png' },
    online: true,
    available: (policy) => Boolean(policy.deposit.bankRib.trim()),
  },
  {
    id: 'POSTE',
    glyph: 'Mail',
    label: 'Transfert postal',
    labelAr: 'تحويل بريدي',
    hint: 'Justificatif téléversé depuis votre espace',
    hintAr: 'تُرفع الوصل من فضائك',
    blocked: 'Compte postal non publié',
    blockedAr: 'الحساب البريدي غير منشور',
    mark: { kind: 'image', src: '/media/payments/poste.png' },
    online: true,
    available: (policy) => Boolean(policy.deposit.posteAccount.trim()),
  },
  {
    id: 'D17',
    glyph: 'Phone',
    label: 'D17 — La Poste Tunisienne',
    labelAr: 'D17 — البريد التونسي',
    hint: 'Paiement mobile DigiPost',
    hintAr: 'دفع عبر تطبيق DigiPost',
    blocked: 'En attente d’une passerelle réelle',
    blockedAr: 'في انتظار بوابة دفع حقيقية',
    // Pas de logo officiel en notre possession : on n'en fabrique pas un.
    mark: { kind: 'glyph', glyph: 'transfer' },
    online: true,
    available: () => false,
  },
  {
    id: 'OOREDOO',
    glyph: 'Phone',
    label: 'Ooredoo Money',
    labelAr: 'Ooredoo Money',
    hint: 'Paiement depuis le solde mobile',
    hintAr: 'دفع من رصيد الهاتف',
    blocked: 'En attente d’une passerelle réelle',
    blockedAr: 'في انتظار بوابة دفع حقيقية',
    mark: { kind: 'image', src: '/media/payments/ooredoo.png' },
    online: true,
    available: () => false,
  },
  {
    id: 'ORANGE',
    glyph: 'Phone',
    label: 'Orange Money',
    labelAr: 'Orange Money',
    hint: 'Paiement depuis le solde mobile',
    hintAr: 'دفع من رصيد الهاتف',
    blocked: 'En attente d’une passerelle réelle',
    blockedAr: 'في انتظار بوابة دفع حقيقية',
    mark: { kind: 'image', src: '/media/payments/orange.svg' },
    online: true,
    available: () => false,
  },
  {
    id: 'SODEXO',
    glyph: 'Card',
    label: 'Cartes Sodexo',
    labelAr: 'بطاقات Sodexo',
    hint: 'Titres et cartes cadeaux acceptés',
    hintAr: 'بطاقات وقسائم مقبولة',
    blocked: 'Acceptation marchande non configurée',
    blockedAr: 'قبول التاجر غير مضبوط',
    mark: { kind: 'image', src: '/media/payments/sodexo.png' },
    online: true,
    available: () => false,
  },
];

/**
 * Réseaux acceptés DERRIÈRE la carte bancaire. Ce ne sont pas des moyens de
 * paiement séparés : on ne « choisit » pas Visa, on paie par carte et le réseau
 * suit la carte. Ils ne sont donc affichés qu'en marques, jamais en options.
 */
export const CARD_NETWORK_MARKS: { id: string; src: string; label: string }[] = [
  { id: 'visa', src: '/media/payments/visa.svg', label: 'Visa' },
  { id: 'mastercard', src: '/media/payments/mastercard.svg', label: 'Mastercard' },
];

/** Ordre d'affichage de la caisse : il ne change pas selon la disponibilité. */
export const PAYMENT_METHOD_ORDER: PaymentMethodId[] = PAYMENT_METHODS.map((method) => method.id);

export const paymentMethodById = (id: PaymentMethodId): PaymentMethodDefinition =>
  PAYMENT_METHODS.find((method) => method.id === id)!;

/**
 * La seule question qui compte : ce moyen peut-il encaisser de l'argent MAINTENANT ?
 * Toute écriture qui contourne cette fonction produit une promesse que la caisse ne tiendra pas.
 */
export const isPaymentMethodAvailable = (policy: CommercePolicy, id: PaymentMethodId): boolean =>
  paymentMethodById(id).available(policy);

/**
 * Ce que le site sait encaisser EN LIGNE aujourd'hui. C'est ce que le pied de
 * page annonce : promettre un encaissement en ligne qui n'existe pas fait
 * revenir le client pour rien.
 */
export const availablePaymentMethods = (policy: CommercePolicy): PaymentMethodDefinition[] =>
  PAYMENT_METHODS.filter((method) => method.online && method.available(policy));

/**
 * Ce avec quoi le client peut RÉELLEMENT payer sa commande, en ligne ou non.
 * C'est la liste de la caisse et du panier — le paiement à la livraison en fait
 * partie, et il permet d'éprouver la chaîne complète sans aucune passerelle.
 */
export const availableAtCheckout = (policy: CommercePolicy): PaymentMethodDefinition[] => {
  // Un moyen doit être BOTH techniquement disponible ET accepté par la boutique.
  // La seconde condition manquait : le serveur refuse toute commande dont le
  // moyen ne figure pas dans sa liste configurée, donc proposer un moyen absent
  // de cette liste menait droit à un refus après avoir tout saisi. Liste vide =
  // le serveur n'en publie pas : on ne restreint rien (comportement historique).
  // `?? []` : une politique incomplète (appelant ancien) ne doit jamais faire
  // planter la caisse — elle ne restreint simplement rien, comme avant.
  const accepted = policy.acceptedPaymentMethods ?? [];
  return PAYMENT_METHODS.filter((method) =>
    method.available(policy) && (!accepted.length || accepted.includes(method.id)));
};
