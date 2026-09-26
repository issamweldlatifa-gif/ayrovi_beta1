// @vitest-environment jsdom
/*
 * LA CAISSE DOIT S'AFFICHER (26/09/2026).
 *
 * Régression vécue en production : en extrayant les règles de commande, une
 * fonction avait été renommée alors que le bouton appelait encore l'ancien nom.
 * La page « Commander » plantait et restait BLANCHE — aucun test ne la rendait,
 * donc rien ne l'a vu. La compilation ne l'a pas vu non plus : l'appel vivait
 * dans du JSX, et l'identifiant manquant n'était résolu qu'à l'exécution.
 *
 * Ce fichier existe pour qu'une page morte ne puisse plus partir en production.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { NavigationHistoryProvider } from '../client/src/navigation/NavigationHistory';
import { CheckoutModal } from '../client/src/components/CheckoutModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  csrfToken: 'token',
  account: { id: 'a1', displayName: 'Issam', email: 'i@ayrovi.tn', phone: '98123456', emailVerified: true, phoneVerified: false },
} as any;

let root: Root;
let host: HTMLDivElement;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: { deposit: { percent: 30, cardDiscountPercent: 5 } } }),
  })) as unknown as typeof fetch;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  globalThis.fetch = originalFetch;
});

const render = (props: Record<string, unknown> = {}) => act(async () => root.render(
  <LocaleProvider><NavigationHistoryProvider>
    <CheckoutModal
      isOpen onClose={() => {}} items={[]} totalTND={100} itemCount={1}
      customerSession={session} onRequireAuthentication={() => {}} onOrderSuccess={() => {}}
      {...props as any}
    />
  </NavigationHistoryProvider></LocaleProvider>,
));

describe('page Commander', () => {
  it('s’affiche réellement — pas une page blanche', async () => {
    await render();
    expect(host.textContent?.trim().length ?? 0).toBeGreaterThan(40);
    expect(host.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('propose de continuer vers le paiement, et le bouton est relié', async () => {
    await render();
    const next = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Continuer vers le paiement'));
    expect(next).toBeDefined();
    // Le clic ne doit rien casser : un identifiant manquant plantait toute la page.
    await act(async () => next!.click());
    expect(host.textContent?.trim().length ?? 0).toBeGreaterThan(40);
  });

  it('s’affiche aussi sans session cliente — jamais un écran vide', async () => {
    await render({ customerSession: null });
    expect(host.textContent?.trim().length ?? 0).toBeGreaterThan(20);
  });
});
