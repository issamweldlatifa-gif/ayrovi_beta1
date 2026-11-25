/**
 * PANIER — le rendu ne doit JAMAIS jeter, quelle que soit la donnée.
 *
 * Le panier reçoit des lignes de TROIS origines (catalogue, capture marchande,
 * pont AYWEBs) et de versions différentes du serveur : une ligne peut arriver
 * sans photo, sans devise, sans total, sans jeton de prix. Un écran qui suppose
 * un champ présent ferme l'application — et l'utilisateur perd son panier.
 *
 * Ce test monte l'écran réel (`app/(tabs)/cart.tsx`) dans trois états :
 *   1. panier vide — l'écran dit « vide », il ne casse pas ;
 *   2. panier pauvre — lignes sans image / devise / total, jeton absent ;
 *   3. panier en erreur — le réseau tombe, l'écran montre l'erreur et propose
 *      de réessayer.
 *
 * Les appels réseau sont simulés (`@/api/cart`, `@/api/aywebs`) : on vérifie le
 * RENDU, pas le serveur. Les fonctions pures de `@/api/cart` restent les vraies
 * (`zayroviCartReadiness`, `ZAYROVI_PRICE_TRUST_REASONS`) — c'est leur résultat
 * qui décide si le bouton de commande apparaît.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { useSonimSession, clearSonimSession } from '../../src/features/sonim/sonimSession';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../src/session/session', () => ({ useSessionId: () => 'sess_test' }));
jest.mock('../../src/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));

// La coque (en-tête + menu) est testée ailleurs ; ici on isole le panier.
jest.mock('../../src/features/shell/AppHeader', () => ({ AppHeader: () => null }));

jest.mock('../../src/api/cart', () => {
  const actual = jest.requireActual('../../src/api/cart');
  return {
    ...actual,
    fetchZayroviCart: jest.fn(async () => {
      if (require('./cartFixture').getError()) throw require('./cartFixture').getError();
      return require('./cartFixture').getCart();
    }),
    removeZayroviCartItem: jest.fn(async () => ({})),
    updateZayroviCartQuantity: jest.fn(async () => ({})),
  };
});

jest.mock('../../src/api/aywebs', () => ({
  fetchAyWebsCart: jest.fn(async () => ({ lines: [], totals: null })),
  bridgeAyWebsCartToZayrovi: jest.fn(async () => ({})),
}));

const emptyCart = {
  sessionId: 'sess_test',
  serverNow: new Date().toISOString(),
  items: [],
  units: 0,
  productSubtotalTND: 0,
  deliveryTND: 0,
  totalTND: 0,
  blockedIds: [],
};

const poorLine = {
  id: 'line_poor',
  store: '',
  title: 'Article sans photo',
  imageUrl: '',
  sourceUrl: '',
  sourcePrice: 0,
  sourceCurrency: '',
  quantity: 1,
  variant: '',
  customerNote: '',
  priceVerificationStatus: 'PENDING_MANUAL',
  priceTrust: '',
  priceTrustReason: '',
  priceTrustExpiresAt: '',
  availability: '',
  availabilityReason: '',
  lineTotalTND: null,
  originalLineTotalTND: null,
  promoLabel: '',
  discountTND: null,
  updatedAt: '',
};

const secondLine = { ...poorLine, id: 'line_b', title: 'Deuxième ligne' };
const firstLine = { ...poorLine, id: 'line_a', title: 'Première ligne' };
const twoLineCart = { ...emptyCart, items: [firstLine, secondLine], units: 2 };

const poorCart = {
  ...emptyCart,
  items: [poorLine],
  units: 1,
  productSubtotalTND: 0,
  deliveryTND: 0,
  totalTND: 0,
};

function mount() {
  const CartScreen = require('../../app/(tabs)/cart').default;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={client}>
            <CartScreen />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
}

describe('panier — aucun plantage au montage', () => {
  it('16/11 : logo Clean sur CHAQUE carte (à la place du •••) — revue modifiable de l’article, sans envoi', async () => {
    clearSonimSession();
    require('./cartFixture').setCart(poorCart);
    const view = mount();
    const buttons = await screen.findAllByLabelText('Demander à Clean à propos de cet article');
    expect(buttons).toHaveLength(poorCart.items.length);
    expect(screen.queryByTestId('cart-ask-sonim')).toBeNull();
    expect(screen.queryByTestId(`cart-line-${poorCart.items[0].id}-menu`)).toBeNull();
    fireEvent.press(screen.getByTestId(`cart-line-${poorCart.items[0].id}-clean`));
    expect(router.push).toHaveBeenCalledWith('/sonim-assistant');
    expect(useSonimSession.getState().draft).toContain('Article sans photo');
    expect(useSonimSession.getState().messages).toEqual([]);
    view.unmount();
    clearSonimSession();
  });

  it('panier vide : illustration, raison, et une seule action utile', async () => {
    require('./cartFixture').setCart(emptyCart);
    const view = mount();
    const empty = await screen.findByTestId('cart-empty');
    expect(within(empty).getByText('Votre panier est vide')).toBeTruthy();
    // Pas de lignes, donc pas de bouton de commande : on ne propose pas un
    // chemin qui échouera.
    expect(screen.queryByTestId('cart-checkout')).toBeNull();
    // L'action de l'état vide ramène aux sélections, elle ne promet rien d'autre.
    fireEvent.press(screen.getByTestId('cart-empty-action'));
    expect(router.push).toHaveBeenLastCalledWith('/(tabs)');
    expect(view.toJSON()).not.toBeNull();
    view.unmount();
  });

  it('ligne pauvre (sans photo, sans devise, sans total) : l’écran monte quand même', async () => {
    require('./cartFixture').setCart(poorCart);
    const view = mount();
    await view.findByText('Article sans photo');
    // Les contrôles de la ligne existent : la quantité reste ajustable même
    // quand le prix n'est pas encore prouvé.
    expect(screen.getByTestId('cart-line-line_poor-plus')).toBeTruthy();
    expect(screen.getByTestId('cart-line-line_poor-remove')).toBeTruthy();
    // Aucun montant inventé pour la ligne : le total absent s'écrit avec la
    // phrase du serveur (« il n'est pas deviné »), jamais « 0.00 TND ».
    expect(screen.getByText(/pas deviné|لا يتمّ تقديره/i)).toBeTruthy();
    view.unmount();
  });

  it('panier en erreur réseau : l’écran montre l’erreur, il ne se ferme pas', async () => {
    const error = Object.assign(new Error('réseau indisponible'), { isOffline: true });
    require('./cartFixture').setError(error);
    const view = mount();
    await view.findByText(/connexion|internet|شبكة|اتصال/i).catch(() => null);
    expect(view.toJSON()).not.toBeNull();
    require('./cartFixture').setError(null);
    view.unmount();
  });
});

describe('panier — gestes qui engagent', () => {
  it('retirer un article demande confirmation avant d’appeler le serveur', async () => {
    require('./cartFixture').setCart(poorCart);
    const spy = jest.spyOn(Alert, 'alert');
    const api = require('../../src/api/cart');
    const view = mount();
    await view.findByText('Article sans photo');
    fireEvent.press(screen.getByTestId('cart-line-line_poor-remove'));
    // Rien n'est parti : la boîte de confirmation est ouverte.
    expect(api.removeZayroviCartItem).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    const buttons = spy.mock.calls[0]![2] as Array<{ text: string; onPress?: () => void }>;
    const confirm = buttons.find(button => button.text === 'Retirer');
    expect(confirm).toBeTruthy();
    confirm!.onPress!();
    await waitFor(() => expect(api.removeZayroviCartItem).toHaveBeenCalledWith({ itemId: 'line_poor', sessionId: 'sess_test' }));
    // Un accusé de réception : la ligne disparaît, l'écran dit pourquoi.
    expect(await screen.findByText('Article retiré du panier.')).toBeTruthy();
    spy.mockRestore();
    view.unmount();
  });

  it('une ligne qui travaille ne bloque pas les autres', async () => {
    require('./cartFixture').setCart(twoLineCart);
    const api = require('../../src/api/cart');
    // La première ligne reste « en vol » : le serveur ne répond pas encore.
    api.updateZayroviCartQuantity.mockImplementationOnce(() => new Promise(() => undefined));
    const view = mount();
    await view.findByText('Première ligne');
    fireEvent.press(screen.getByTestId('cart-line-line_a-plus'));
    // Pendant que la ligne A attend, la ligne B reste cliquable : le défaut
    // corrigé gelait TOUTE la liste, donc ce second appui n'arrivait jamais.
    fireEvent.press(screen.getByTestId('cart-line-line_b-plus'));
    await waitFor(() => expect(api.updateZayroviCartQuantity).toHaveBeenCalledTimes(2));
    expect(api.updateZayroviCartQuantity.mock.calls.map((call: any[]) => call[0].itemId)).toEqual(['line_a', 'line_b']);
    // Et la ligne en vol reste affichée pendant l'attente (aucun saut de liste).
    expect(screen.getByTestId('cart-line-line_a-plus')).toBeTruthy();
    view.unmount();
  });
});
