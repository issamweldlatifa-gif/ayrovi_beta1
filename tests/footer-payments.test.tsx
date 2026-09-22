import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import glyphs from '../client/src/design/editorial/glyphs.json';
import { availablePaymentMethods, isPaymentMethodAvailable, PAYMENT_METHODS, paymentMethodById } from '../client/src/commerce/paymentMethods';
import { parseCommercePolicy } from '../client/src/commerce/policy';
import { FooterPaymentMethods } from '../client/src/components/FooterPaymentMethods';
import { Footer } from '../client/src/components/Footer';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

/**
 * LE BLOC PAIEMENT DU PIED DE PAGE, VÉRIFIÉ PAR LA RÈGLE — PAS PAR LA MISE EN PAGE.
 *
 * Ce que ces tests protègent, en une phrase : le pied de page ne peut pas annoncer un moyen de
 * paiement que la caisse refuserait, et il ne peut pas non plus se taire quand rien n'est ouvert.
 *
 * Les payloads reproduisent la forme RÉELLE de `/api/public/commerce-config` et passent par le
 * vrai analyseur (`parseCommercePolicy`) : si le serveur change de contrat, ces tests tombent.
 */
const LIVE_TODAY = {
  deposit: {
    percent: 20, cardDiscountPercent: 5, companyName: 'AYROVI',
    bankRib: '', posteAccount: '', flouciNumber: '',
    reviewDelay: 'Sous 1 jour ouvré après réception du justificatif',
    unavailableRefundPolicy: 'Acompte remboursé si AYROVI ne peut pas valider ou acheter l’article demandé',
  },
  capabilities: { cardGateway: false },
  governorates: ['Tunis', 'Ariana'],
};

const FULLY_CONFIGURED = {
  ...LIVE_TODAY,
  deposit: { ...LIVE_TODAY.deposit, bankRib: 'TN59 1234 5678 9012 3456 7890', posteAccount: 'CCP 12 345 678', flouciNumber: '+216 20 000 000' },
  capabilities: { cardGateway: true },
};

const policy = (payload: unknown) => parseCommercePolicy(payload);
const panel = (value: unknown, failed = false) => renderToStaticMarkup(
  <LocaleProvider><FooterPaymentMethods policy={value === null ? null : policy(value)} failed={failed} /></LocaleProvider>,
);

describe('moyens de paiement du pied de page — la vérité, pas la vitrine', () => {
  it('n’annonce AUCUN moyen quand aucun n’est encaissable, et le dit explicitement', () => {
    const live = policy(LIVE_TODAY);
    expect(availablePaymentMethods(live)).toEqual([]);
    const html = panel(LIVE_TODAY);
    for (const label of ['Carte bancaire', 'Flouci', 'D17', 'Virement bancaire', 'Transfert postal']) {
      expect(html).not.toContain(label);
    }
    expect(html).toContain('Aucun encaissement en ligne n’est ouvert aujourd’hui.');
    expect(html).toContain('la commande est enregistrée et le règlement reste en attente');
    expect(html).not.toContain('class="public-footer-payment"');
  });

  it('n’affiche que ce que l’Admin a réellement publié, et jamais Flouci/D17 sans passerelle', () => {
    const configured = policy(FULLY_CONFIGURED);
    expect(availablePaymentMethods(configured).map((method) => method.id)).toEqual(['CARD', 'BANK_TRANSFER', 'POSTE']);
    expect(isPaymentMethodAvailable(configured, 'FLOUCI')).toBe(false);
    const html = panel(FULLY_CONFIGURED);
    expect(html.match(/class="public-footer-payment"/g)).toHaveLength(3);
    for (const label of ['Carte bancaire', 'Virement bancaire', 'Transfert postal']) expect(html).toContain(label);
    expect(html).not.toContain('Flouci');
    expect(html).not.toContain('Aucun encaissement en ligne');
    // La remise carte n'apparaît que si la carte est réellement encaissable.
    expect(html).toContain('Remise carte bancaire');
    expect(panel(LIVE_TODAY)).not.toContain('Remise carte bancaire');
  });

  it('n’imprime jamais une marque tierce : ni logo réseau, ni photo de carte', () => {
    for (const payload of [LIVE_TODAY, FULLY_CONFIGURED]) {
      const html = panel(payload);
      expect(html).not.toContain('VISA'); expect(html).not.toContain('Mastercard');
      expect(html).not.toContain('/media/payments/');
      expect(html).not.toContain('<img');
      expect(html).not.toContain('href="https://');
    }
  });

  it('tire ses marques du registre de glyphes central, et jamais d’un dessin local', () => {
    for (const method of PAYMENT_METHODS) {
      expect(Object.keys(glyphs)).toContain(method.glyph);
      expect(method.glyph).toMatch(/^[A-Z][A-Za-z]+$/);
    }
    // Chaque moyen parle les deux langues, sans doublon de libellé.
    expect(new Set(PAYMENT_METHODS.map((method) => method.label)).size).toBe(PAYMENT_METHODS.length);
    for (const method of PAYMENT_METHODS) {
      for (const value of [method.label, method.labelAr, method.hint, method.hintAr, method.blocked, method.blockedAr]) {
        expect(value.trim().length).toBeGreaterThan(1);
      }
      // Un nom de marque garde son orthographe officielle dans les deux langues (Flouci / D17) ;
      // tout ce que NOUS rédigeons — accroche, motif — est réellement traduit en arabe.
      if (method.labelAr !== method.label) expect(method.labelAr).toMatch(/[\u0600-\u06FF]/);
      expect(method.hintAr).toMatch(/[\u0600-\u06FF]/);
      expect(method.blockedAr).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('accorde les chiffres affichés aux seules données publiées', () => {
    const html = panel(LIVE_TODAY);
    expect(html).toContain('Acompte à la commande');
    expect(html).toContain('20 %');
    expect(html).toContain('Sous 1 jour ouvré après réception du justificatif');
    expect(html).toContain('Acompte remboursé si AYROVI ne peut pas valider');
    expect(html).toContain('href="/terms.html"');
    // Des conditions serveur invalides ne produisent aucune affirmation : la caisse bloque déjà.
    expect(() => parseCommercePolicy({ deposit: { percent: 0, cardDiscountPercent: 5 } })).toThrow('COMMERCE_TERMS_INVALID');
  });

  it('ne prétend rien tant que la configuration n’est pas connue, et l’annonce si elle échoue', () => {
    const waiting = renderToStaticMarkup(<LocaleProvider><FooterPaymentMethods policy={null} /></LocaleProvider>);
    expect(waiting).toContain('Vérification des moyens de paiement');
    expect(waiting).not.toContain('class="public-footer-payment"');
    expect(waiting).not.toContain('20 %');
    const failed = renderToStaticMarkup(<LocaleProvider><FooterPaymentMethods policy={null} failed /></LocaleProvider>);
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Écrivez-nous');
  });

  it('le pied de page entier garde ses invariants en portant ce bloc', () => {
    const html = renderToStaticMarkup(<LocaleProvider><Footer onOpenAccount={() => {}} onOpenAssistant={() => {}} onOpenAbout={() => {}} /></LocaleProvider>);
    expect(html).toContain('data-site-footer');
    expect(html).toContain('id="paiement"');
    expect(html).toContain('id="nos-canaux"');
    expect(html.match(/public-footer-social-unavailable/g)!.length).toBe(4);
    for (const href of ['/privacy.html', '/terms.html', '/data-deletion.html']) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain('href="https://');
    expect(html).not.toContain('VISA'); expect(html).not.toContain('Mastercard');
  });

  it('la règle de disponibilité est LA MÊME pour la caisse et pour le pied de page', () => {
    const configured = policy(FULLY_CONFIGURED);
    expect(paymentMethodById('CARD').available(configured)).toBe(isPaymentMethodAvailable(configured, 'CARD'));
    expect(paymentMethodById('BANK_TRANSFER').available(configured)).toBe(true);
    // Un RIB vide, un compte postal vide, une passerelle absente : trois motifs distincts.
    const live = policy(LIVE_TODAY);
    expect(paymentMethodById('BANK_TRANSFER').blocked).toBe('RIB non publié');
    expect(paymentMethodById('POSTE').blocked).toBe('Compte postal non publié');
    expect(paymentMethodById('CARD').blocked).toBe('Passerelle non configurée');
    expect(paymentMethodById('BANK_TRANSFER').available(live)).toBe(false);
  });
});
