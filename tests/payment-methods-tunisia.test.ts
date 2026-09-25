/*
 * MOYENS DE PAIEMENT TUNISIENS (25/09/2026).
 *
 * Le paysage réel est affiché en entier — carte, virement, transfert postal,
 * Flouci, D17, Ooredoo Money, Orange Money, cartes Sodexo — mais AFFICHER
 * n'est pas PROMETTRE : un moyen sans passerelle configurée reste marqué
 * indisponible, quelle que soit la politique commerciale reçue.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARD_NETWORK_MARKS,
  PAYMENT_METHODS,
  availablePaymentMethods,
  isPaymentMethodAvailable,
} from '../client/src/commerce/paymentMethods';
import type { CommercePolicy } from '../client/src/commerce/policy';

/** Politique la plus permissive imaginable : tout est publié et configuré. */
const generous = {
  deposit: { cardGatewayAvailable: true, bankRib: 'TN59 1000 6035 0000 1234 5678', posteAccount: '17 001 000 0000 1234 56' },
} as unknown as CommercePolicy;

const publicFile = (src: string) => path.join(process.cwd(), 'client/public', src.replace(/^\//, ''));

describe('registre des moyens de paiement', () => {
  it('couvre le paysage tunisien annoncé au client', () => {
    expect(PAYMENT_METHODS.map((method) => method.id)).toEqual([
      'CARD', 'FLOUCI', 'BANK_TRANSFER', 'POSTE', 'D17', 'OOREDOO', 'ORANGE', 'SODEXO',
    ]);
  });

  it('n’active JAMAIS un moyen sans passerelle, même avec une politique parfaite', () => {
    for (const id of ['FLOUCI', 'D17', 'OOREDOO', 'ORANGE', 'SODEXO'] as const) {
      expect(isPaymentMethodAvailable(generous, id), id).toBe(false);
    }
    expect(availablePaymentMethods(generous).map((method) => method.id)).toEqual(['CARD', 'BANK_TRANSFER', 'POSTE']);
  });

  it('chaque moyen explique FACTUELLEMENT pourquoi il est bloqué', () => {
    for (const method of PAYMENT_METHODS) {
      expect(method.blocked.trim().length, method.id).toBeGreaterThan(8);
      expect(method.blockedAr.trim().length, method.id).toBeGreaterThan(4);
      expect(method.blocked.toLowerCase()).not.toBe('indisponible');
    }
  });

  it('chaque marque image existe réellement dans le dépôt — aucun logo fantôme', () => {
    for (const method of PAYMENT_METHODS) {
      if (method.mark.kind !== 'image') continue;
      expect(fs.existsSync(publicFile(method.mark.src)), method.mark.src).toBe(true);
    }
  });

  it('les réseaux de carte sont des marques, pas des options de paiement', () => {
    expect(CARD_NETWORK_MARKS.map((network) => network.id)).toEqual(['visa', 'mastercard']);
    for (const network of CARD_NETWORK_MARKS) {
      expect(fs.existsSync(publicFile(network.src)), network.src).toBe(true);
    }
    expect(PAYMENT_METHODS.some((method) => /visa|mastercard/i.test(method.id))).toBe(false);
  });
});
