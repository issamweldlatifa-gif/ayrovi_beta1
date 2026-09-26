/**
 * RÈGLES DE COMMANDE — extraites de l'écran, sans changer leur comportement.
 *
 * Pourquoi cette extraction (25/09/2026) : la caisse n'est pas un écran, c'est
 * un contrat de vente. Sept garanties y vivaient mêlées au rendu — acceptation
 * des conditions, contact vérifié, numéro tunisien réel, e-mail valide, choix
 * d'un moyen réellement encaissable, liaison du paiement APRÈS création de la
 * commande, traduction des refus. Tant qu'elles restaient dans le composant,
 * elles n'étaient testables qu'en rendant une interface, et donc mal testées.
 *
 * Ici, ce sont des fonctions pures : elles décident, elles n'affichent rien.
 * Aucune règle n'a été modifiée pendant le déplacement — c'est la condition
 * pour que l'écran puisse ensuite être remplacé sans toucher au contrat.
 */

export interface CheckoutIdentity {
  /** Session cliente ouverte ? Sans elle, rien ne part. */
  authenticated: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface CheckoutForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  termsAccepted: boolean;
}

export type CheckoutRefusal =
  | 'AUTH_REQUIRED'
  | 'CONTACT_NOT_VERIFIED'
  | 'FIELDS_MISSING'
  | 'EMAIL_INVALID'
  | 'PHONE_INVALID'
  | 'TERMS_REQUIRED';

/**
 * Numéro tunisien réel : huit chiffres commençant par 2, 4, 5, 7 ou 9. Les
 * préfixes internationaux courants sont retirés avant contrôle, parce qu'un
 * client qui écrit « +216 98 … » a donné un numéro valide, pas une erreur.
 */
export function normalizeTunisianPhone(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00216')) digits = digits.slice(5);
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3);
  return digits;
}

export function isTunisianPhone(raw: string): boolean {
  return /^[24579]\d{7}$/.test(normalizeTunisianPhone(raw));
}

export function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || ''));
}

/**
 * Le premier refus rencontré, dans l'ordre où il compte. `null` = la commande
 * peut être soumise. On rend la RAISON, jamais un simple « false » : l'écran
 * doit pouvoir dire au client ce qui manque.
 */
export function refuseCheckout(identity: CheckoutIdentity, form: CheckoutForm): CheckoutRefusal | null {
  if (!identity.authenticated) return 'AUTH_REQUIRED';
  if (!identity.emailVerified && !identity.phoneVerified) return 'CONTACT_NOT_VERIFIED';
  if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.address.trim()) return 'FIELDS_MISSING';
  if (!isEmail(form.email)) return 'EMAIL_INVALID';
  if (!isTunisianPhone(form.phone)) return 'PHONE_INVALID';
  if (!form.termsAccepted) return 'TERMS_REQUIRED';
  return null;
}

/**
 * Quel moyen de paiement part avec la commande.
 *
 * Deux cas seulement. Si AUCUN moyen n'est encaissable aujourd'hui, la commande
 * est quand même créée avec `PENDING_SELECTION` : le client ne perd pas son
 * panier parce que la configuration marchande n'est pas prête. Sinon, le moyen
 * choisi doit être réellement disponible — sélectionner un moyen désactivé ne
 * crée pas une commande qu'on ne pourra pas encaisser.
 */
export function resolvePaymentMethod(
  selected: string,
  availability: { anyAvailable: boolean; isAvailable: (method: string) => boolean },
): { method: string; deferred: boolean } | { refusal: 'PAYMENT_UNAVAILABLE' } {
  if (!availability.anyAvailable) return { method: 'PENDING_SELECTION', deferred: true };
  const method = String(selected || '').toUpperCase();
  if (!method || !availability.isAvailable(method)) return { refusal: 'PAYMENT_UNAVAILABLE' };
  return { method, deferred: false };
}

/**
 * Codes de refus renvoyés par le serveur. Un code non traduit doit rester
 * VISIBLE tel quel plutôt que d'être masqué par un message générique : le
 * support doit pouvoir le lire dans la capture d'écran du client.
 */
export const SERVER_REFUSALS = [
  'CHECKOUT_EMAIL_INVALID',
  'TERMS_REQUIRED',
  'CONTACT_VERIFICATION_REQUIRED',
  'VERIFIED_EMAIL_REQUIRED',
  'DELIVERY_LOCATION_INVALID',
] as const;

export type ServerRefusal = (typeof SERVER_REFUSALS)[number];

export function isServerRefusal(code: unknown): code is ServerRefusal {
  return typeof code === 'string' && (SERVER_REFUSALS as readonly string[]).includes(code);
}

/**
 * Corps de la requête de commande. Le moyen de paiement y vaut TOUJOURS
 * `PENDING_SELECTION` : la commande est l'autorité, le paiement s'y rattache
 * ensuite par son identifiant. Inverser l'ordre créerait des paiements
 * orphelins, impossibles à rapprocher d'une commande.
 */
export function buildCheckoutBody<T extends object>(form: T, locale: 'fr' | 'ar'): Record<string, unknown> {
  return { ...form, paymentMethod: 'PENDING_SELECTION', locale: locale === 'ar' ? 'ar-TN' : 'fr-TN' };
}
