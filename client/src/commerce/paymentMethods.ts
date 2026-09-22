/**
 * Moyens de paiement — SOURCE UNIQUE de la disponibilité.
 *
 * Pourquoi ce fichier existe : jusqu'ici la règle « ce moyen est-il réellement utilisable ? »
 * était écrite dans `CheckoutModal.tsx` et écrite une deuxième fois nulle part. Le pied de page
 * devait maintenant afficher des moyens de paiement : s'il avait recopié la règle, les deux
 * copies auraient divergé au premier changement de configuration, et le site aurait fini par
 * annoncer au visiteur un moyen de paiement que la caisse refuse.
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

export type PaymentMethodId = 'CARD' | 'FLOUCI' | 'BANK_TRANSFER' | 'POSTE';

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
  available: (policy: CommercePolicy) => boolean;
}

export const PAYMENT_METHODS: PaymentMethodDefinition[] = [
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
    available: () => false,
  },
  {
    id: 'BANK_TRANSFER',
    glyph: 'Bank',
    label: 'Virement bancaire',
    labelAr: 'تحويل بنكي',
    hint: 'Justificatif téléversé depuis votre espace',
    hintAr: 'تُرفع الوصل من فضائك',
    blocked: 'RIB non publié',
    blockedAr: 'لم يُنشر RIB',
    mark: { kind: 'glyph', glyph: 'transfer' },
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
    available: (policy) => Boolean(policy.deposit.posteAccount.trim()),
  },
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

export const availablePaymentMethods = (policy: CommercePolicy): PaymentMethodDefinition[] =>
  PAYMENT_METHODS.filter((method) => method.available(policy));
