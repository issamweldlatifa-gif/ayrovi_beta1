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

describe('order-first mobile checkout and customer account', () => {
  it('uses one shell contract for Livraison, Récapitulatif and Confirmation', () => {
    const markup = renderToStaticMarkup(
      <CheckoutFlowShell direction="ltr" size="form" ariaLabel="Livraison"><span>Content</span></CheckoutFlowShell>,
    );
    expect(markup).toContain('checkout-flow-page checkout-flow-page--form');
    expect(markup).toContain('checkout-flow-container checkout-flow-container--form');
    expect(checkoutSource).toContain('<CheckoutFlowShell');
    expect(confirmationSource).toContain('<CheckoutFlowShell');
    expect(checkoutSource).toContain("tr('Récapitulatif', 'المراجعة')");
  });

  it('is edge-to-edge on mobile while retaining desktop max widths', () => {
    expect(flowCss).toMatch(/@media \(max-width: 639px\)[\s\S]*?\.checkout-flow-page\s*\{[\s\S]*?padding:\s*0/);
    expect(flowCss).toMatch(/@media \(max-width: 639px\)[\s\S]*?\.checkout-flow-container\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*100%[\s\S]*?min-height:\s*100dvh/);
    expect(indexCss).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0[\s\S]*?overflow-x:\s*hidden/);
  });

  it('creates the order before selecting a payment method', () => {
    expect(checkoutSource).toContain("paymentMethod: 'pending_selection'");
    expect(checkoutSource).toContain("paymentMethod: 'PENDING_SELECTION'");
    expect(checkoutSource).toContain("tr('Créer la commande', 'إنشاء الطلب')");
    expect(checkoutSource).not.toContain('Mode de paiement de l’acompte');
  });

  it('exposes exactly card and bank/postal transfer in the persisted order detail', () => {
    expect(accountSource).toContain("tr('Carte bancaire','بطاقة بنكية')");
    expect(accountSource).toContain("tr('Virement bancaire / postal','تحويل بنكي / بريدي')");
    expect(accountSource).toContain('cardGatewayAvailable');
    expect(accountSource).toContain('Payer l’acompte par carte');
    expect(accountSource).toContain("accept=\"image/jpeg,image/png,application/pdf\"");
    expect(accountSource).not.toContain('Envoyer le reçu du paiement carte');
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
