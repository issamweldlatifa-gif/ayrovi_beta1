import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CheckoutFlowShell } from '../client/src/components/CheckoutFlowShell';

const checkoutSource = readFileSync('client/src/components/CheckoutModal.tsx', 'utf8');
const confirmationSource = readFileSync('client/src/components/OrderSuccessModal.tsx', 'utf8');
const accountSource = readFileSync('client/src/components/CustomerAccountPage.tsx', 'utf8');
const flowCss = readFileSync('client/src/styles/checkout-flow.css', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');

describe('order-backed mobile checkout and customer account', () => {
  it('uses one shell contract for Livraison, Paiement and Confirmation', () => {
    const markup = renderToStaticMarkup(
      <CheckoutFlowShell direction="ltr" size="form" ariaLabel="Livraison"><span>Content</span></CheckoutFlowShell>,
    );
    expect(markup).toContain('checkout-flow-page checkout-flow-page--form');
    expect(markup).toContain('checkout-flow-container checkout-flow-container--form');
    expect(checkoutSource).toContain('<CheckoutFlowShell');
    expect(confirmationSource).toContain('<CheckoutFlowShell');
    expect(checkoutSource).toContain("tr('Paiement', 'الدفع')");
  });

  it('has an internal touch scroll area and reachable sticky actions on mobile', () => {
    expect(flowCss).toMatch(/\.checkout-flow-container\s*\{[\s\S]*?display:\s*flex[\s\S]*?max-height:/);
    expect(flowCss).toMatch(/\.checkout-flow-content\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
    expect(flowCss).toMatch(/\.checkout-flow-actions\s*\{[\s\S]*?position:\s*sticky[\s\S]*?bottom:/);
    expect(flowCss).toMatch(/@media \(max-width: 639px\)[\s\S]*?\.checkout-flow-container\s*\{[\s\S]*?height:\s*100dvh[\s\S]*?max-height:\s*100dvh/);
    expect(indexCss).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0[\s\S]*?overflow-x:\s*hidden/);
  });

  it('restores the full payment choice after delivery while keeping the order authoritative', () => {
    expect(checkoutSource).toContain("paymentMethod: 'PENDING_SELECTION'");
    expect(checkoutSource).toContain('Mode de paiement de l’acompte');
    expect(checkoutSource).toContain('Visa / Mastercard');
    expect(checkoutSource).toContain('Flouci / D17');
    expect(checkoutSource).toContain('Virement bancaire');
    expect(checkoutSource).toContain('Transfert postal');
    expect(checkoutSource).toContain('/payments/card/initiate');
    expect(checkoutSource).toContain('/deposit/method');
    expect(checkoutSource).toContain("formData.paymentMethod.toUpperCase()==='CARD'?tr('Créer et payer'");
  });

  it('never simulates unavailable gateways and keeps manual proof upload in the profile', () => {
    expect(checkoutSource).toContain("false; // Flouci/D17 stays visible but cannot be selected without a real gateway.");
    expect(checkoutSource).toContain('aucune transaction ne sera simulée sans passerelle réelle');
    expect(checkoutSource).not.toContain('type="file"');
    expect(accountSource).toContain('type="file"');
    expect(accountSource).toContain('accept="image/jpeg,image/png,application/pdf"');
    expect(accountSource).toContain('Envoyer le justificatif');
  });

  it('uses a vertical account menu and min-width guards for 320–414 px', () => {
    expect(accountSource).toContain('className="grid gap-1"');
    expect(accountSource).toContain('min-w-0');
    expect(accountSource).toContain("section==='home'?'block':'hidden'");
    expect(accountSource).toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(accountSource).toContain('object-contain');
  });

  it('states the truthful independent payment, invoice and tracking lifecycle', () => {
    expect(confirmationSource).toContain('Commande en attente d’acompte');
    expect(confirmationSource).toContain('Paiement vérifié, puis commande confirmée');
    expect(confirmationSource).toContain('Suivi visible après expédition; facture visible après émission');
    expect(confirmationSource).toContain('Gérer l’acompte et suivre la commande');
  });
});
