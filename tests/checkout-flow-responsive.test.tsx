import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrderConfirmationShell } from '../client/src/components/OrderConfirmationShell';

const appSource = readFileSync('client/src/App.tsx', 'utf8');
const checkoutSource = readFileSync('client/src/shop/ShopCheckoutScreen.tsx', 'utf8');
const confirmationSource = readFileSync('client/src/components/OrderSuccessModal.tsx', 'utf8');
const accountSource = readFileSync('client/src/components/CustomerAccountPage.tsx', 'utf8');
const flowCss = readFileSync('client/src/styles/order-confirmation.css', 'utf8');
const shopCss = readFileSync('client/src/shop/shop.css', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');

describe('checkout route and responsive order flow', () => {
  it('mounts Checkout as a fixed full-viewport route, never as footer content', () => {
    expect(appSource).toContain('<div className="shop-checkout-route" data-app-route="checkout">');
    expect(appSource).toContain("const isCheckoutOpen = appView === 'app:checkout'");
    expect(shopCss).toMatch(/\.shop-checkout-route\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*100;[\s\S]*?inset:\s*0;/);
    expect(shopCss).toContain('overscroll-behavior: contain;');
  });

  it('takes the customer from delivery to payment and supports Back to the address step', () => {
    expect(checkoutSource).toContain('<AddressPage');
    expect(checkoutSource).toContain('<PaymentPage');
    expect(checkoutSource).toContain("setStep('payment')");
    expect(checkoutSource).toContain("onBack={() => setStep('address')}");
    expect(checkoutSource).toContain('onBack={onClose}');
  });

  it('creates the order through the single checkout API before initiating card payment', () => {
    const create = checkoutSource.indexOf("fetch('/api/checkout'");
    const payment = checkoutSource.indexOf('payments/card/initiate');
    expect(create).toBeGreaterThanOrEqual(0);
    expect(payment).toBeGreaterThan(create);
    expect(checkoutSource).toContain("'x-csrf-token': customerSession.csrfToken");
    expect(checkoutSource).toContain("'x-session-id': getSessionId()");
  });

  it('uses a scrollable viewport that respects mobile height and global width constraints', () => {
    expect(shopCss).toMatch(/\.shop-checkout-route\s*\{[\s\S]*?height:\s*100vh;[\s\S]*?height:\s*100dvh;[\s\S]*?overflow-y:\s*auto;/);
    expect(shopCss).toMatch(/\.s-page\s*\{[^}]*display:\s*flex[^}]*min-height:\s*100%/);
    expect(indexCss).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0[\s\S]*?overflow-x:\s*hidden/);
  });

  it('keeps the order confirmation overlay shell and reachable content', () => {
    const markup = renderToStaticMarkup(
      <OrderConfirmationShell direction="ltr" ariaLabelledBy="order-title"><span>Content</span></OrderConfirmationShell>,
    );
    expect(markup).toContain('class="order-confirmation-page"');
    expect(confirmationSource).toContain('<OrderConfirmationShell');
    expect(flowCss).toMatch(/\.order-confirmation-page\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/);
    expect(confirmationSource).toContain('Commande en attente d’acompte');
    expect(confirmationSource).toContain('Gérer l’acompte et suivre la commande');
  });

  it('keeps manual proof upload in the customer account, not the Checkout screen', () => {
    expect(checkoutSource).not.toContain('type="file"');
    expect(accountSource).toContain('type="file"');
    expect(accountSource).toContain('accept="image/jpeg,image/png,application/pdf"');
    expect(accountSource).toContain('Envoyer le justificatif');
  });
});
