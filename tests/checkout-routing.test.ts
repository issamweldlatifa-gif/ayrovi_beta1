import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('client/src/App.tsx', 'utf8');
const bagScreen = readFileSync('client/src/shop/ShopBagScreen.tsx', 'utf8');
const bagPage = readFileSync('client/src/shop/BagPage.tsx', 'utf8');
const checkoutScreen = readFileSync('client/src/shop/ShopCheckoutScreen.tsx', 'utf8');
const clientApiRoutes = readFileSync('src/api/routes.ts', 'utf8');

describe('single Checkout route audit', () => {
  it('the cart button reaches the sole app:checkout destination', () => {
    expect(app).toContain('onProceedToCheckout={handleProceedToCheckout}');
    expect(bagScreen).toContain('onCheckout={onProceedToCheckout}');
    expect(bagPage).toContain('onClick={onCheckout}');
    expect(app).toContain("openAppView('app:checkout')");
    expect(app).toContain("[{ id: 'app:checkout' }]"); // resume after authentication
    expect(app.match(/id: 'app:checkout'/g)).toHaveLength(1);
  });

  it('mounts one current screen in a fixed full-screen surface', () => {
    expect(app.match(/<ShopCheckoutScreen\b/g)).toHaveLength(1);
    expect(app).toContain('<div className="shop-checkout-route" data-app-route="checkout">');
    expect(checkoutScreen).toContain("fetch('/api/checkout'");
  });

  it('has no second legacy Checkout component, form route, or duplicate API handler', () => {
    expect(existsSync('client/src/components/CheckoutModal.tsx')).toBe(false);
    expect(existsSync('client/src/components/CheckoutFlowShell.tsx')).toBe(false);
    expect(existsSync('client/src/styles/checkout-flow.css')).toBe(false);
    expect(checkoutScreen).not.toContain("checkout:payment");
    expect((clientApiRoutes.match(/router\.post\('\/checkout'/g) || [])).toHaveLength(1);
  });
});
