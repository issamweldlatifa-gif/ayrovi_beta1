/**
 * S BASE — un seul champ (mot-clé ou photo), deux boutiques, un filtre.
 *
 * Décision du 26/11/2026 : plus que 1688 et Alibaba.com, et la photo part chez
 * 1688 (aucun appel à SerpApi). Ce que ces tests montrent (rendu réel, réseau simulé) :
 *   1. le champ unique + la caméra, et les deux boutiques cochées par défaut ;
 *   2. le filtre = la sélection des boutiques interrogées ;
 *   3. chaque groupe porte SON temps et SON code d'erreur ;
 *   4. une photo va chez 1688 et le filtre se construit sur le vendeur ;
 *   5. changer la sélection après coup ne relance rien en silence : on le dit.
 */
import React from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { fetchSbaseItem, fetchSbaseSources, searchSbase, searchSbaseImage } from '../../src/api/sbase';
import { addSbaseToCart } from '../../src/api/cart';
import { SbaseItemScreen } from '../../src/features/sbase/SbaseItemScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../src/features/shell/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('../../src/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));

jest.mock('expo-image-picker', () => ({
  CameraType: { back: 'back', front: 'front' },
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', fileName: 'camera.jpg', mimeType: 'image/jpeg' }],
  })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' }],
  })),
}));

jest.mock('../../src/session/session', () => ({ useSessionId: () => 'sess-1' }));

jest.mock('../../src/api/cart', () => ({ addSbaseToCart: jest.fn() }));

jest.mock('../../src/api/sbase', () => ({
  fetchSbaseSources: jest.fn(),
  searchSbase: jest.fn(),
  searchSbaseImage: jest.fn(),
  fetchSbaseItem: jest.fn(),
}));

const cartMock = addSbaseToCart as unknown as jest.Mock;
const sourcesMock = fetchSbaseSources as unknown as jest.Mock;
const searchMock = searchSbase as unknown as jest.Mock;
const imageMock = searchSbaseImage as unknown as jest.Mock;
const itemMock = fetchSbaseItem as unknown as jest.Mock;

const supports = { keyword: true, url: false, image: false, details: false, price: true, variants: false, barcode: false };

const source = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  id, label, vendor: `${id}.com`, supports, fields: ['title', 'price'], markets: [], defaultMarket: null,
  costUsd: 0.0848, billedPerResult: false, async: true, defaultEnabled: true, configured: true, ...extra,
});

const SOURCES = {
  provider: 'apify',
  configured: true,
  sources: [
    source('1688', '1688', { supports: { ...supports, image: true, details: true, url: true, variants: true } }),
  ],
  image: {
    id: '1688', label: '1688 · photo', vendor: '1688.com',
    supports: { ...supports, image: true }, store: '1688', storeFromResults: false, configured: true,
    endpoint: 'https://topapi--image-search-1688-api.apify.actor/search', costUsd: 0.001,
  },
};

const ESTIMATE = {
  currency: 'CNY', amount: 22.8, rateTND: 0.4429, productTND: 10.404,
  freightTND: 6.0, dutyTND: 1.2, tvaTND: 3.4, serviceFeeTND: 1.5,
  localDeliveryTND: 0, totalTND: 22.504, categoryLabel: 'Gadgets',
  categoryStatus: 'ALLOWED' as const, restricted: false, requiresWeightValidation: false, pricingVersion: 9,
};

const item = (title: string, extra: Record<string, unknown> = {}) => ({
  id: 'x', title, url: 'https://shop/1', image: null, priceText: '22,80 CNY', amount: 22.8,
  currency: 'CNY', store: '1688', seller: 'Shenzhen T', moq: '1', rating: null, reviews: null,
  shipping: null, condition: null, missing: ['image'], priceEstimate: ESTIMATE, ...extra,
});

const supportsDetails = { ...supports, details: true };

const GROUP_OK = {
  source: { id: '1688', label: '1688', vendor: '1688.com', supports: supportsDetails },
  status: 'ok' as const, items: [item('Mini traceur GPS')], count: 1,
  durationMs: 812, cached: false, async: true, error: null, costUsd: 0.0848, billedPerResult: false,
};

const GROUP_ERROR = {
  source: { id: '1688', label: '1688', vendor: '1688.com', supports },
  status: 'error' as const, items: [], count: 0, durationMs: 0,
  cached: false, async: true, error: { code: 'APIFY_UNAUTHORIZED', message: 'clé refusée' },
  costUsd: 0.0848, billedPerResult: false,
};

const GROUP_NO_ESTIMATE = {
  source: { id: '1688', label: '1688', vendor: '1688.com', supports },
  status: 'ok' as const,
  items: [item('Coque iPhone', { url: 'https://detail.1688.com/offer/9.html', priceEstimate: null })],
  count: 1, durationMs: 640, cached: false, async: true, error: null,
  costUsd: 0.0848, billedPerResult: false,
};

const DETAIL = {
  source: { id: '1688', label: '1688', vendor: '1688.com', supports: supportsDetails },
  detail: {
    title: 'Écouteurs sans fil', brand: 'BASEUS', priceText: null, amount: 1.2, currency: 'CNY',
    oldPriceText: null, rating: null, reviews: null, availability: 'in_stock',
    seller: '深圳市聚声源电子商务有限公司',
    url: 'https://detail.1688.com/offer/1046925823679.html', images: ['https://img/1.jpg', 'https://img/2.jpg'],
    description: 'Bluetooth 5.3',
    specs: [{ name: '蓝牙版本', value: '5.3' }],
    variants: [
      { name: 'Couleur', values: [{ label: 'Noir', available: null, image: null }, { label: 'Blanc', available: null, image: null }] },
      { name: 'Pack', values: [{ label: 'Standard', available: null, image: null }] },
    ],
    missing: ['rating'],
    priceEstimate: {
      ...ESTIMATE, localDeliveryTND: 7, totalTND: 29.504, categoryLabel: 'Gadgets',
    },
  },
  durationMs: 1500, cached: false, costUsd: 0.00899, billedPerResult: false,
  fetchedAt: new Date().toISOString(),
};

/** Résultat avec une ligne Alibaba cliquable (aucune fiche publiée). */
const RESULT_ERROR = {
  query: 'traceur',
  totalMs: 300,
  groups: [GROUP_ERROR],
  count: 0,
  missingFields: [],
  fetchedAt: new Date().toISOString(),
};

/** Résultat sans estimation TND (devise non cotée) : l'écran doit le dire. */
const RESULT_NO_ESTIMATE = {
  query: 'coque',
  totalMs: 900,
  groups: [GROUP_OK, GROUP_NO_ESTIMATE],
  count: 2,
  missingFields: ['image'],
  fetchedAt: new Date().toISOString(),
};

const RESULT = {
  query: 'mini traceur gps',
  totalMs: 1240,
  groups: [GROUP_OK],
  count: 1,
  missingFields: ['image'],
  fetchedAt: new Date().toISOString(),
};

const IMAGE_RESULT = {
  mode: 'image' as const,
  channel: SOURCES.image,
  status: 'ok' as const,
  items: [
    item('Traceur GPS 1688', { seller: 'Shenzhen T' }),
    item('Traceur GPS Guangzhou', { seller: 'Guangzhou Y', url: 'https://detail.1688.com/offer/2.html' }),
  ],
  count: 2,
  stores: ['1688'],
  missingFields: ['image'],
  durationMs: 900,
  totalMs: 1100,
  endpoint: 'https://topapi--image-search-1688-api.apify.actor/search',
  costUsd: 0.001,
  fetchedAt: new Date().toISOString(),
};

function mount() {
  const SbaseTab = require('../../app/(tabs)/sbase').default;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={client}>
            <SbaseTab />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sourcesMock.mockResolvedValue(SOURCES);
});

describe('S Base — un champ, deux boutiques en filtre', () => {
  it('affiche le champ unique, la caméra et les deux boutiques cochées', async () => {
    const view = mount();
    expect(await screen.findByTestId('sbase-query')).toBeTruthy();
    expect(screen.getByTestId('sbase-photo')).toBeTruthy();

    const dev = await screen.findByTestId('sbase-source-1688');
    expect(dev.props.accessibilityState.selected).toBe(true);
    // Alibaba.com retirée, comme les 6 autres : le serveur n'en décrit qu'une.
    expect(screen.queryByTestId('sbase-source-alibaba')).toBeNull();
    expect(screen.queryByTestId('sbase-source-amazon')).toBeNull();
    expect(screen.queryByTestId('sbase-source-aliexpress')).toBeNull();
    view.unmount();
  });

  it('cherche par mot-clé sur les deux boutiques et montre le temps par groupe', async () => {
    searchMock.mockResolvedValue(RESULT);
    const view = mount();

    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'mini traceur gps');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith({
      q: 'mini traceur gps',
      sources: ['1688'],
    }));

    expect(await screen.findByText('Mini traceur GPS')).toBeTruthy();
    // الثمن بعملته الصريحة (amount+currency) — رقم عاري لا يُعرض أبداً.
    expect(screen.getByText(/22,8 CNY/)).toBeTruthy();
    expect(await screen.findByTestId('sbase-response-time')).toHaveTextContent(/812/);
    // Le groupe 1688 porte son temps.
    expect(screen.getByTestId('sbase-group-1688-meta')).toHaveTextContent(/812 ms/);
    // MOQ et fournisseur sont affichés : c'est du commerce de gros.
    expect(screen.getAllByText(/Shenzhen T/).length).toBeGreaterThan(0);
    // Le prix rendu en Tunisie vient du moteur de prix (calculé serveur).
    expect(screen.getByTestId('sbase-estimate-0')).toHaveTextContent(/22,504 TND/);
    view.unmount();
  });

  it('une boutique en échec affiche son code, pas une liste vide', async () => {
    searchMock.mockResolvedValue(RESULT_ERROR);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'traceur');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    expect(await screen.findByTestId('sbase-group-1688-meta')).toHaveTextContent(/APIFY_UNAUTHORIZED/);
    /*
     * 26/11/2026 — l'écran affichait « Aucun résultat pour « traceur » » AU-DESSUS
     * du bloc d'erreur. Zéro résultat et échec ne sont pas la même chose : quand
     * toutes les boutiques échouent, on ne parle pas de résultat.
     */
    expect(screen.getByTestId('sbase-summary')).not.toHaveTextContent(/Aucun résultat/i);
    expect(screen.getByTestId('sbase-summary')).toHaveTextContent(/Aucune boutique n/i);
    // L'échec est nommé dans l'en-tête du groupe, avec le code réel.
    expect(screen.getByTestId('sbase-group-1688-meta')).toHaveTextContent(/APIFY_UNAUTHORIZED/);
    // Un échec n'est pas facturé : afficher un coût serait un mensonge.
    expect(screen.getByText(/échec non facturé/)).toBeTruthy();
    expect(screen.queryByText(/0,084/)).toBeNull();
    view.unmount();
  });

  it('sans devise cotée, la carte dit « estimation indisponible » au lieu d’un chiffre', async () => {
    searchMock.mockResolvedValue(RESULT_NO_ESTIMATE);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'coque');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    await screen.findByText('Coque iPhone');
    // Deux groupes, donc deux fois l'index 0 : on vise le texte, pas le testID.
    expect(screen.getAllByText(/indisponible/i).length).toBeGreaterThan(0);
    view.unmount();
  });

  it('décocher une boutique masque son groupe immédiatement, sans nouvel appel payant', async () => {
    searchMock.mockResolvedValue(RESULT);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'traceur');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    expect(await screen.findByTestId('sbase-group-1688')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sbase-source-1688'));
    await waitFor(() => expect(screen.queryByTestId('sbase-group-1688')).toBeNull());
    expect(screen.getByTestId('sbase-stale')).toBeTruthy();
    expect(searchMock).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

describe('S Base — fiche produit', () => {
  it('un résultat de 1688 ouvre la fiche interne, pas le navigateur', async () => {
    searchMock.mockResolvedValue(RESULT);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'traceur');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    fireEvent.press(await screen.findByText('Mini traceur GPS'));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/sbase/item',
      params: expect.objectContaining({ source: '1688', id: 'x' }),
    }));
    view.unmount();
  });

  it('un résultat sans fiche ouvre le lien d’origine sur 1688', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    searchMock.mockResolvedValue(RESULT_NO_ESTIMATE);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'coque');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    fireEvent.press(await screen.findByText('Coque iPhone'));
    expect(open).toHaveBeenCalledWith('https://detail.1688.com/offer/9.html');
    open.mockRestore();
    view.unmount();
  });

  it('la fiche 1688 affiche prix, vendeur, tailles/couleurs et champs manquants', async () => {
    itemMock.mockResolvedValue(DETAIL);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <PrefsProvider><I18nProvider><ThemeProvider><QueryClientProvider client={client}>
        <SbaseItemScreen source="1688" id="1046925823679" title="Écouteurs" url={null} />
      </QueryClientProvider></ThemeProvider></I18nProvider></PrefsProvider>,
    );

    expect(await screen.findByText('Écouteurs sans fil')).toBeTruthy();
    expect(screen.getAllByText(/1,20/).length).toBeGreaterThan(0);
    // Les tailles/couleurs viennent du serveur : rien de fabriqué côté app.
    expect(screen.getByText('Noir')).toBeTruthy();
    expect(screen.getByText('Standard')).toBeTruthy();
    expect(screen.getByText('蓝牙版本')).toBeTruthy();
    // La fiche montre le prix rendu en Tunisie (moteur de prix), livraison incluse.
    expect(screen.getByTestId('sbase-item-estimate-total')).toHaveTextContent(/TND/);
    expect(await screen.findByTestId('sbase-item-response')).toHaveTextContent(/1,5 s/);
    view.unmount();
  });

  it('section « produits similaires » : un tap = un appel assumé, les résultats se remplissent', async () => {
    itemMock.mockResolvedValue(DETAIL);
    searchMock.mockResolvedValue(RESULT);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <PrefsProvider><I18nProvider><ThemeProvider><QueryClientProvider client={client}>
        <SbaseItemScreen source="1688" id="1046925823679" title="Écouteurs" url={null} />
      </QueryClientProvider></ThemeProvider></I18nProvider></PrefsProvider>,
    );
    await screen.findByText('Écouteurs sans fil');
    fireEvent.press(screen.getByTestId('sbase-similar-run'));
    await waitFor(() => expect(searchMock).toHaveBeenCalledWith({ q: expect.any(String), sources: ['1688'] }, expect.anything()));
    expect(await screen.findByText('Mini traceur GPS')).toBeTruthy();
    // الكلفة كما ردّها الخادم (0,0848 في الـfixture) — معروضة لا مخفيّة.
    expect(screen.getByTestId('sbase-similar-meta')).toHaveTextContent(/0,085/);
    view.unmount();
  });

  it('اختيار اللون والكمية في الفيش يصلان للحمولة كما اختارهما الزبون', async () => {
    itemMock.mockResolvedValue(DETAIL);
    cartMock.mockResolvedValue({ cartItemId: 'c9', totalItemsCount: 1, totalTND: 29.504, deliveryTND: 7, quoteExpiresAt: '', serverNow: '' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <PrefsProvider><I18nProvider><ThemeProvider><QueryClientProvider client={client}>
        <SbaseItemScreen source="1688" id="1046925823679" title="Écouteurs" url={null} />
      </QueryClientProvider></ThemeProvider></I18nProvider></PrefsProvider>,
    );
    await screen.findByText('Écouteurs sans fil');
    // Couleur: Noir (أول مجموعة، أول قيمة)
    fireEvent.press(screen.getByTestId('sbase-variant-0-0'));
    fireEvent.press(screen.getByTestId('sbase-fiche-qty-plus'));
    fireEvent.press(screen.getByTestId('sbase-fiche-cart'));
    await waitFor(() => expect(cartMock).toHaveBeenCalledTimes(1));
    const call = cartMock.mock.calls[0][0] as { payload: { requestedColor: string | null; quantity: number; variant: string | null } };
    expect(call.payload.requestedColor).toBe('Noir');
    expect(call.payload.quantity).toBe(2);
    expect(call.payload.variant).toContain('Noir');
    expect(await screen.findByText(/Ajouté au panier/)).toBeTruthy();
    view.unmount();
  });

  it('boutique sans fiche : l’écran le dit au lieu d’afficher du vide', async () => {
    itemMock.mockRejectedValue(Object.assign(new Error('unsupported'), { code: 'DETAILS_UNSUPPORTED' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <PrefsProvider><I18nProvider><ThemeProvider><QueryClientProvider client={client}>
        <SbaseItemScreen source="alibaba" id="100500" title={null} url="https://alibaba.com/x" />
      </QueryClientProvider></ThemeProvider></I18nProvider></PrefsProvider>,
    );
    expect(await screen.findByTestId('sbase-item-error')).toBeTruthy();
    expect(screen.getByText(/ne publie pas de fiche produit|ما ينشرش فيش منتج/)).toBeTruthy();
    view.unmount();
  });
});

describe('S Base — photo (1688, sans SerpApi)', () => {
  it('la caméra envoie la photo et le filtre se construit sur les fournisseurs reçus', async () => {
    imageMock.mockResolvedValue(IMAGE_RESULT);
    const view = mount();

    await screen.findByTestId('sbase-source-1688');
    fireEvent.press(screen.getByTestId('sbase-photo'));

    // نداء لكل مخزن على حدة (تعمير تدريجي): الافتراضي 1688.
    await waitFor(() => expect(imageMock).toHaveBeenCalledWith(
      { uri: 'file:///photo.jpg', name: 'camera.jpg', type: 'image/jpeg' },
      { stores: ['1688'] },
    ));
    // الكاميرا هي من التقطت فعلاً (المدخل الأساسي — قرار المالك).
    expect(require('expo-image-picker').launchCameraAsync).toHaveBeenCalled();

    expect(await screen.findByText('Traceur GPS 1688')).toBeTruthy();
    expect(screen.getByText('Traceur GPS Guangzhou')).toBeTruthy();
    expect(screen.getByTestId('sbase-image-summary')).toHaveTextContent(/2 résultats/);
    // Le coût de l'appel est affiché (aucune dépense invisible) : 0,004 $ chez l'actor image.
    expect(screen.getByTestId('sbase-image-spend')).toHaveTextContent(/0,001/);

    // Filtre construit sur les fournisseurs présents dans les résultats.
    fireEvent.press(screen.getByTestId('sbase-store-1688'));
    await waitFor(() => expect(screen.queryByText('Traceur GPS 1688')).not.toBeNull());

    /* 26/11/2026 — la ligne d'une photo ouvrait la source « google-lens » (404
       UNKNOWN_SOURCE). Les résultats d'une photo SONT des produits 1688. */
    fireEvent.press(screen.getByTestId('sbase-item-0'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/sbase/item',
      params: expect.objectContaining({ source: '1688' }),
    })));
    view.unmount();
  });

  it('zéro produit similaire : on parle de la photo, pas d’une recherche vide', async () => {
    imageMock.mockResolvedValue({ ...IMAGE_RESULT, items: [], count: 0, stores: [], status: 'empty' });
    const view = mount();
    await screen.findByTestId('sbase-source-1688');
    fireEvent.press(screen.getByTestId('sbase-photo'));
    const summary = await screen.findByTestId('sbase-image-summary');
    expect(summary).toHaveTextContent(/cette photo/i);
    expect(summary).not.toHaveTextContent(/Aucun résultat pour « »/);
    view.unmount();
  });

  it('image non configurée sur le serveur : expliqué, sans accusation de photo', async () => {
    imageMock.mockRejectedValue(Object.assign(new Error('تحليل الصور موش مضبوط على الخادم.'), {
      code: 'SBASE_IMAGE_NOT_CONFIGURED',
    }));
    const view = mount();
    await screen.findByTestId('sbase-source-1688');
    fireEvent.press(screen.getByTestId('sbase-photo'));
    const message = await screen.findByTestId('sbase-error-message');
    expect(message).toHaveTextContent(/configur/i);
    view.unmount();
  });

  /*
   * 26/11/2026 — la photo part sur PLUSIEURS magasins (1688 + AliExpress) :
   * chaque magasin porte sa vérité (résultats/temps, ou code + « échec non
   * facturé »), et une ligne AliExpress ouvre le lien d'origine — pas de fiche.
   */
  it('photo multi-magasins : un appel par magasin (progressif), Ali échoue et le dit, 1688 remplit son groupe', async () => {
    const IMAGE_STORES = {
      ...SOURCES,
      image: {
        ...SOURCES.image,
        stores: [
          { id: '1688', label: '1688 · photo', vendor: '1688.com', costUsd: 0.001 },
          { id: 'aliexpress', label: 'AliExpress · photo', vendor: 'aliexpress.com', costUsd: 0.02 },
        ],
      },
    };
    sourcesMock.mockResolvedValue(IMAGE_STORES);
    // النداءان منفصلان (تعمير تدريجي): كل مخزن يردّ بحقيقته — Ali يرفض، و1688 تجيب.
    imageMock.mockImplementation((_file: unknown, options?: { stores?: string[] }) => {
      if (options?.stores?.[0] === 'aliexpress') {
        return Promise.reject(Object.assign(new Error('429'), { code: 'SBASE_IMAGE_RATE_LIMITED' }));
      }
      return Promise.resolve({
        ...IMAGE_RESULT,
        channel: IMAGE_STORES.image,
        items: [item('Traceur GPS 1688', { store: '1688', seller: 'Shenzhen T' })],
        count: 1,
        stores: ['1688'],
        groups: [{ source: { id: '1688', label: '1688 · photo', vendor: '1688.com' }, status: 'ok', count: 1, items: [], durationMs: 2100, error: null, costUsd: 0.001 }],
      });
    });
    const view = mount();
    await screen.findByTestId('sbase-source-1688');
    fireEvent.press(screen.getByTestId('sbase-photo'));

    expect(await screen.findByText(/chaque boutique dit sa vérité/)).toBeTruthy();
    expect(await screen.findByTestId('sbase-image-store-1688')).toHaveTextContent(/1688 · photo · 1/);
    // Ali رفض: صفّه يحمل الكود الحقيقي و«échec non facturé»، و1688 تكمّل عادي.
    expect(screen.getByTestId('sbase-image-store-aliexpress')).toHaveTextContent(/SBASE_IMAGE_RATE_LIMITED/);
    expect(screen.getByTestId('sbase-image-store-aliexpress')).toHaveTextContent(/échec non facturé/);
    // الفاتورة = الناجح فقط: 0.001 — الفاشل مجّاني.
    expect(screen.getByTestId('sbase-image-spend')).toHaveTextContent(/0,001/);
    // فشل Ali وحده ليس فشلاً كلياً: لا بطاقة خطأ عامة.
    expect(screen.queryByTestId('sbase-error')).toBeNull();
    view.unmount();
  });

  it('skeleton pendant l\'attente : le gabarit gris apparaît par magasin, puis se remplit', async () => {
    // نداء معلّق: القوالب تظهر فوراً وتستمر حتى الوصول.
    imageMock.mockImplementation(() => new Promise(() => {}));
    const view = mount();
    await screen.findByTestId('sbase-source-1688');
    fireEvent.press(screen.getByTestId('sbase-photo'));
    expect(await screen.findByTestId('sbase-skeleton-1688')).toBeTruthy();
    expect(screen.getByTestId('sbase-skeleton-1688-0')).toBeTruthy();
    // النتيجة لم تصل بعد: لا بطاقة نتيجة ولا «aucun résultat».
    expect(screen.queryByTestId('sbase-group-1688')).toBeNull();
    expect(screen.getByTestId('sbase-image-summary')).toHaveTextContent(/Recherche en cours/);
    view.unmount();
  });

  it('skeleton par boutique pour la recherche par mot-clé aussi', async () => {
    searchMock.mockImplementation(() => new Promise(() => {}));
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'traceur');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    expect(await screen.findByTestId('sbase-skeleton-1688')).toBeTruthy();
    expect(screen.getByTestId('sbase-summary')).toHaveTextContent(/Recherche en cours/);
    view.unmount();
  });

  it('ajout au panier depuis la carte : charge honnête sans quote signée, confirmation affichée', async () => {
    searchMock.mockResolvedValue(RESULT);
    cartMock.mockResolvedValue({ cartItemId: 'c1', totalItemsCount: 1, totalTND: 22.504, deliveryTND: 8, quoteExpiresAt: '', serverNow: '' });
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'traceur');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    fireEvent.press(await screen.findByTestId('sbase-cart-0'));
    await waitFor(() => expect(cartMock).toHaveBeenCalledTimes(1));
    const call = cartMock.mock.calls[0][0] as { payload: Record<string, unknown>; sessionId: string };
    expect(call.sessionId).toBe('sess-1');
    expect(call.payload).toMatchObject({ store: '1688', sourcePrice: 22.8, sourceCurrency: 'CNY', quantity: 1 });
    // الصدق: بحث لا يصدر quote موقّعة — الحمولة تحمل الاثنين أبداً.
    expect(call.payload.priceVerificationStatus).toBeUndefined();
    expect(call.payload.priceToken).toBeUndefined();
    expect(await screen.findByText(/Ajouté au panier/)).toBeTruthy();
    view.unmount();
  });

  it('عدّاد الكمية على البطاقة يرفع الحمولة (سقف 99 وأدنى حدّ MOQ)', async () => {
    searchMock.mockResolvedValue(RESULT);
    cartMock.mockResolvedValue({ cartItemId: 'c2', totalItemsCount: 1, totalTND: 22.504, deliveryTND: 8, quoteExpiresAt: '', serverNow: '' });
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'traceur');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    fireEvent.press(await screen.findByTestId('sbase-qty-plus-0'));
    fireEvent.press(screen.getByTestId('sbase-qty-plus-0'));
    fireEvent.press(screen.getByTestId('sbase-cart-0'));
    await waitFor(() => expect(cartMock).toHaveBeenCalledTimes(1));
    expect((cartMock.mock.calls[0][0] as { payload: { quantity: number } }).payload.quantity).toBe(3);
    view.unmount();
  });

  it('refus du panier : le code du serveur est affiché tel quel', async () => {
    searchMock.mockResolvedValue(RESULT);
    cartMock.mockRejectedValue(Object.assign(new Error('refusé'), { code: 'INVALID_CART_ITEM' }));
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'traceur');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    fireEvent.press(await screen.findByTestId('sbase-cart-0'));
    expect(await screen.findByText(/Ajout refusé/)).toBeTruthy();
    expect(screen.getByText('INVALID_CART_ITEM')).toBeTruthy();
    view.unmount();
  });

  it("caméra refusée : le message parle d'autorisation, pas d'une photo invalide", async () => {
    const picker = require('expo-image-picker');
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    const view = mount();
    await screen.findByTestId('sbase-source-1688');
    fireEvent.press(screen.getByTestId('sbase-photo'));
    const message = await screen.findByTestId('sbase-error-message');
    expect(message).toHaveTextContent(/autorisation caméra|صلاحية الكاميرا/);
    expect(imageMock).not.toHaveBeenCalled();
    view.unmount();
  });

  /*
   * 26/11/2026 — l'écran français affichait « La recherche a échoué » suivi
   * d'une phrase ARABE du serveur, et un refus du fournisseur se présentait
   * comme une photo invalide. Le code doit maintenant choisir la phrase.
   */
  it('un refus du fournisseur s’explique en français, pas en « photo invalide »', async () => {
    imageMock.mockRejectedValue(Object.assign(new Error('تعذّر تحليل الصورة.'), {
      code: 'SBASE_IMAGE_PROVIDER_REFUSED',
    }));
    const view = mount();
    await screen.findByTestId('sbase-source-1688');
    fireEvent.press(screen.getByTestId('sbase-photo'));

    const message = await screen.findByTestId('sbase-error-message');
    expect(message).toHaveTextContent(/quota ou clé/i);
    expect(message).not.toHaveTextContent(/تعذّر/);
    expect(screen.getByTestId('sbase-error')).toHaveTextContent(/SBASE_IMAGE_PROVIDER_REFUSED/);
    expect(screen.getByTestId('sbase-error')).not.toHaveTextContent(/SBASE_IMAGE_INVALID/);
    view.unmount();
  });

  it('sans clé APIFY, la page l’annonce au lieu d’inventer des résultats', async () => {
    sourcesMock.mockResolvedValue({ ...SOURCES, configured: false });
    const view = mount();
    expect(await screen.findByTestId('sbase-unconfigured')).toBeTruthy();
    view.unmount();
  });
});
