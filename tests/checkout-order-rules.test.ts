/*
 * RÈGLES DE COMMANDE — extraites de l'écran (25/09/2026).
 *
 * Elles engagent l'entreprise : conditions acceptées, contact vérifié, numéro
 * tunisien réel, moyen de paiement réellement encaissable, et commande créée
 * AVANT le paiement. Tant qu'elles vivaient dans le composant, elles n'étaient
 * vérifiables qu'en rendant une interface — donc mal vérifiées.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCheckoutBody, isEmail, isServerRefusal, isTunisianPhone, normalizeTunisianPhone,
  refuseCheckout, resolvePaymentMethod, type CheckoutForm, type CheckoutIdentity,
} from '../client/src/shop/checkoutOrder';

const identity = (over: Partial<CheckoutIdentity> = {}): CheckoutIdentity =>
  ({ authenticated: true, emailVerified: true, phoneVerified: false, ...over });
const form = (over: Partial<CheckoutForm> = {}): CheckoutForm =>
  ({ name: 'Issam', email: 'i@ayrovi.tn', phone: '98 123 456', address: 'Rue 1, Tunis', termsAccepted: true, ...over });

describe('refus de commande — la raison, jamais un simple « non »', () => {
  it('laisse passer une commande complète', () => {
    expect(refuseCheckout(identity(), form())).toBeNull();
  });

  it('exige une session ouverte', () => {
    expect(refuseCheckout(identity({ authenticated: false }), form())).toBe('AUTH_REQUIRED');
  });

  it('exige un contact vérifié — e-mail OU téléphone suffit', () => {
    expect(refuseCheckout(identity({ emailVerified: false, phoneVerified: false }), form())).toBe('CONTACT_NOT_VERIFIED');
    expect(refuseCheckout(identity({ emailVerified: false, phoneVerified: true }), form())).toBeNull();
  });

  it('refuse un champ vide avant de juger son contenu', () => {
    expect(refuseCheckout(identity(), form({ address: '   ' }))).toBe('FIELDS_MISSING');
  });

  it('refuse un e-mail invalide', () => {
    expect(refuseCheckout(identity(), form({ email: 'issam@' }))).toBe('EMAIL_INVALID');
  });

  it('refuse les conditions non acceptées — c’est un engagement, pas une case décorative', () => {
    expect(refuseCheckout(identity(), form({ termsAccepted: false }))).toBe('TERMS_REQUIRED');
  });
});

describe('numéro tunisien', () => {
  it.each(['98123456', '+216 98 123 456', '00216 98 123 456', '216 98123456'])('accepte %s', (raw) => {
    expect(isTunisianPhone(raw)).toBe(true);
    expect(normalizeTunisianPhone(raw)).toBe('98123456');
  });

  it.each(['12345678', '981234', '9812345678', '', '98 123 45a'])('refuse %s', (raw) => {
    expect(isTunisianPhone(raw)).toBe(false);
  });

  it.each(['i@ayrovi.tn', 'a.b@c.io'])('accepte l’e-mail %s', (raw) => expect(isEmail(raw)).toBe(true));
  it.each(['i@ayrovi', 'i ayrovi.tn', '@ayrovi.tn', ''])('refuse l’e-mail %s', (raw) => expect(isEmail(raw)).toBe(false));
});

describe('moyen de paiement soumis avec la commande', () => {
  const available = (...ids: string[]) => ({
    anyAvailable: ids.length > 0,
    isAvailable: (method: string) => ids.includes(method),
  });

  it('quand AUCUN moyen n’encaisse, la commande part quand même en attente', () => {
    expect(resolvePaymentMethod('', available())).toEqual({ method: 'PENDING_SELECTION', deferred: true });
  });

  it('refuse un moyen désactivé : créer une commande inencaissable ne rend service à personne', () => {
    expect(resolvePaymentMethod('FLOUCI', available('CARD'))).toEqual({ refusal: 'PAYMENT_UNAVAILABLE' });
    expect(resolvePaymentMethod('', available('CARD'))).toEqual({ refusal: 'PAYMENT_UNAVAILABLE' });
  });

  it('accepte un moyen réellement disponible, quelle que soit la casse saisie', () => {
    expect(resolvePaymentMethod('card', available('CARD'))).toEqual({ method: 'CARD', deferred: false });
  });
});

describe('corps de la requête', () => {
  it('la commande est créée AVANT le paiement : le moyen y vaut toujours PENDING_SELECTION', () => {
    const body = buildCheckoutBody({ name: 'Issam', paymentMethod: 'CARD' }, 'fr');
    expect(body.paymentMethod).toBe('PENDING_SELECTION');
    expect(body.locale).toBe('fr-TN');
    expect(buildCheckoutBody({}, 'ar').locale).toBe('ar-TN');
  });

  it('les refus serveur connus restent identifiables', () => {
    expect(isServerRefusal('TERMS_REQUIRED')).toBe(true);
    expect(isServerRefusal('DELIVERY_LOCATION_INVALID')).toBe(true);
    // Un code inconnu n'est pas avalé : l'écran doit pouvoir l'afficher tel quel.
    expect(isServerRefusal('SOMETHING_NEW')).toBe(false);
  });
});
