import React from 'react';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CheckoutFlowShell } from '../client/src/components/CheckoutFlowShell';

const checkoutSource = readFileSync('client/src/components/CheckoutModal.tsx', 'utf8');
const confirmationSource = readFileSync('client/src/components/OrderSuccessModal.tsx', 'utf8');
const flowCss = readFileSync('client/src/styles/checkout-flow.css', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');

describe('shared mobile checkout flow', () => {
  it('uses one shell contract for Livraison, Paiement and Confirmation', () => {
    const markup = renderToStaticMarkup(
      <CheckoutFlowShell direction="ltr" size="form" ariaLabel="Livraison"><span>Content</span></CheckoutFlowShell>,
    );
    expect(markup).toContain('checkout-flow-page checkout-flow-page--form');
    expect(markup).toContain('checkout-flow-container checkout-flow-container--form');
    expect(markup).toContain('data-checkout-flow="form"');
    expect(checkoutSource).toContain('<CheckoutFlowShell');
    expect(confirmationSource).toContain('<CheckoutFlowShell');
    expect(checkoutSource).toContain('className="checkout-flow-content');
    expect(confirmationSource).toContain('className="checkout-flow-content');
  });

  it('is edge-to-edge on mobile while retaining desktop max widths', () => {
    expect(flowCss).toMatch(/@media \(max-width: 639px\)[\s\S]*?\.checkout-flow-page\s*\{[\s\S]*?padding:\s*0/);
    expect(flowCss).toMatch(/@media \(max-width: 639px\)[\s\S]*?\.checkout-flow-container\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*100%[\s\S]*?min-height:\s*100dvh[\s\S]*?margin:\s*0/);
    expect(flowCss).toMatch(/\.checkout-flow-container--form\s*\{\s*max-width:\s*32rem/);
    expect(flowCss).toMatch(/\.checkout-flow-container--confirmation\s*\{[\s\S]*?max-width:\s*28rem/);
    expect(indexCss).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0[\s\S]*?overflow-x:\s*hidden/);
  });

  it('keeps a non-overflowing two-column mobile payment grid and four columns on desktop', () => {
    expect(flowCss).toMatch(/\.checkout-payment-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
    expect(flowCss).toMatch(/@media \(min-width: 640px\)[\s\S]*?\.checkout-payment-grid\s*\{[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/);
    expect(flowCss).toMatch(/\.checkout-payment-option\s*\{[\s\S]*?min-height:[\s\S]*?overflow:\s*hidden/);
  });

  it('only lets bank and postal transfer be selected, with explicit coming-soon states', () => {
    expect(checkoutSource).toContain("new Set<CheckoutPaymentMethod>(['BANK_TRANSFER', 'POSTE'])");
    expect(checkoutSource).toContain("paymentMethod: 'bank_transfer'");
    expect(checkoutSource).not.toContain("paymentMethod: 'card'");
    expect(checkoutSource).toContain('aria-disabled={!available}');
    expect(checkoutSource).toContain("tr('Bientôt disponible', 'متاح قريبًا')");
    expect(checkoutSource).toContain('Ce mode de paiement sera bientôt disponible.');
    expect(checkoutSource).toContain("✓ {tr('Virement bancaire'");
    expect(checkoutSource).toContain("✓ {tr('Transfert postal'");
  });

  it('uses exactly the four supplied local payment images', () => {
    const assets = ['card.png', 'flouci.png', 'bank-transfer.png', 'poste.png'];
    for (const asset of assets) {
      const path = `public/media/payments/${asset}`;
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(500);
      expect(checkoutSource).toContain(`/media/payments/${asset}`);
    }
  });

  it('makes the verification lifecycle explicit on confirmation', () => {
    expect(confirmationSource).toContain('Paiement en attente de vérification');
    expect(confirmationSource).toContain('téléverser le justificatif');
    expect(confirmationSource).toContain('vérifier le paiement');
    expect(confirmationSource).toContain('Facture et suivi activés');
    expect(confirmationSource).toContain('Gérer l’acompte et suivre la commande');
  });
});
