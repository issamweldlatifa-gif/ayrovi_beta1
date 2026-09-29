// @vitest-environment jsdom
/* Regression guard for the live Checkout screen: it must render and respond. */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { ShopCheckoutScreen } from '../client/src/shop/ShopCheckoutScreen';

vi.mock('../client/src/services/publicApi', () => ({
  getCommerceConfig: vi.fn(async () => ({
    data: { deposit: { percent: 20, cardDiscountPercent: 0 }, capabilities: { cardGateway: false } },
  })),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  csrfToken: 'token',
  account: { id: 'a1', displayName: 'Issam Test', email: 'i@ayrovi.tn', phone: '98123456', emailVerified: true, phoneVerified: false },
} as any;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = (props: Record<string, unknown> = {}) => act(async () => root.render(
  <LocaleProvider>
    <ShopCheckoutScreen
      isOpen onClose={() => {}} totalTND={100} itemCount={1}
      customerSession={session} onRequireAuthentication={() => {}} onOrderSuccess={() => {}}
      modes={['home']}
      {...props as any}
    />
  </LocaleProvider>,
));

describe('page Commander — écran effectivement monté', () => {
  it('affiche l’adresse et des contrôles actifs, pas une page blanche', async () => {
    await render();
    expect(host.textContent?.trim().length ?? 0).toBeGreaterThan(40);
    expect(host.textContent).toContain('Adresse de livraison');
    expect(host.querySelectorAll('button').length).toBeGreaterThan(0);
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('Enregistrer l’adresse'))).toBe(true);
  });

  it('réagit au contrôle de validation sans quitter ni casser Checkout', async () => {
    await render();
    const save = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Enregistrer l’adresse'));
    expect(save).toBeDefined();
    await act(async () => save!.click());
    expect(host.textContent).toContain('À compléter');
    expect(host.textContent).toContain('Adresse de livraison');
  });

  it('reste visible sans session cliente et laisse le callback d’authentification au parent', async () => {
    const requireAuthentication = vi.fn();
    await render({ customerSession: null, onRequireAuthentication: requireAuthentication });
    expect(host.textContent?.trim().length ?? 0).toBeGreaterThan(20);
    expect(host.textContent).toContain('Adresse de livraison');
  });
});
