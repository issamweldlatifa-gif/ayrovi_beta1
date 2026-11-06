import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LensScreen from '@/../app/lens';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockTakePicture = jest.fn(async (_options?: Record<string, unknown>) => ({ uri: 'file:///lens-capture.jpg', width: 1200, height: 1600 }));
const mockAnalyzeImage = jest.fn();
const mockDetect = jest.fn();
const mockLocalize = jest.fn();
const mockRequestPermission = jest.fn(async () => ({ granted: true }));
const mockPush = jest.fn();

jest.mock('expo-camera', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const CameraView = ReactModule.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    ReactModule.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
    ReactModule.useEffect(() => {
      (props.onCameraReady as (() => void) | undefined)?.();
    }, []);
    return ReactModule.createElement(View, { testID: 'mock-native-camera' });
  });
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true, status: 'granted', canAskAgain: true }, mockRequestPermission],
  };
});

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

// Pas de module natif en test : la réduction d'image retombe sur l'original, Live n'a pas de capteur.
jest.mock('expo-image-manipulator', () => { throw new Error('module natif absent en test'); });
jest.mock('expo-sensors', () => ({ Accelerometer: { isAvailableAsync: async () => false } }));

jest.mock('@/api/lens', () => ({
  analyzeImage: (...args: unknown[]) => mockAnalyzeImage(...args),
  localizeImage: (...args: unknown[]) => mockLocalize(...args),
  searchVisualMatches: (...args: unknown[]) => mockDetect(...args),
  analyzeUrl: jest.fn(),
  analyzeCode: jest.fn(),
  analyzeBarcode: jest.fn(),
  analyzeText: jest.fn(),
  fetchLensHistory: jest.fn(async () => []),
  markChosen: jest.fn(async () => undefined),
}));

// La recherche passe par le FLUX (SSE) : le même double sert les deux voies,
// avec la même signature (fichier + options `{ roi, signal, onProgress, onCard }`).
jest.mock('@/api/lensStream', () => ({
  analyzeImageStream: (...args: unknown[]) => mockAnalyzeImage(...args),
}));

jest.mock('@/api/account', () => ({ addExternalFavorite: jest.fn(async () => undefined) }));
jest.mock('@/api/cart', () => ({ addExternalToCart: jest.fn(async () => undefined) }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: (...args: unknown[]) => mockPush(...args) },
  useIsFocused: () => true,
}));

function wrap(node: React.ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, right: 0, bottom: 16, left: 0 } }}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>{node}</ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

/** Seules les vraies photos (pas les petites images Live) comptent ici. */
const shutterCalls = () => mockTakePicture.mock.calls.filter(([options]) => !(options as { shutterSound?: boolean } | undefined)?.hasOwnProperty('shutterSound'));

/**
 * 17/10/2026 : la détection passe par SerpApi, qui rend des PAGES
 * ressemblantes — PAS de boîtes. Le cadre reste donc manuel.
 */
const MATCHES = {
  products: [],
  matches: [
    { name: 'Sweat à capuche jaune', image: '', url: 'https://shop.test/sweat', source: 'Shop' },
    { name: 'Baskets blanches', image: '', url: 'https://shop.test/baskets', source: 'Shop' },
  ],
  width: 768,
  height: 1024,
};

const EMPTY_RESULT = { candidates: [], eventId: 'evt', excluded: { count: 0, reasons: {} } };

describe('caméra Lens directe', () => {
  beforeEach(() => {
    mockTakePicture.mockClear();
    mockAnalyzeImage.mockReset();
    mockDetect.mockReset();
    mockLocalize.mockReset().mockResolvedValue([{ name: 'Veste', category: 'jacket', box: { x: .1, y: .2, w: .5, h: .4 } }]);
    mockRequestPermission.mockClear();
    mockPush.mockClear();
  });

  it('capture une seule fois, garde la photo sous les squelettes et annule sans résultat périmé', async () => {
    let resolveSearch!: (value: typeof EMPTY_RESULT) => void;
    mockAnalyzeImage.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));

    render(wrap(<LensScreen />));

    expect(await screen.findByTestId('lens-camera-experience')).toBeTruthy();
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);

    expect(await screen.findByTestId('lens-search-skeleton')).toBeTruthy();
    expect(screen.getByTestId('lens-captured-preview')).toBeTruthy();
    expect(shutterCalls()).toHaveLength(1);
    // The grounded item, not the entire scene, is sent to merchant search.
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    expect(mockAnalyzeImage.mock.calls[0][1].roi).toEqual({x:10,y:20,w:50,h:40});
    expect(mockLocalize).toHaveBeenCalledTimes(1);
    // Merchant matches are never mistaken for item coordinates.
    expect(mockDetect).not.toHaveBeenCalled();

    const signal = mockAnalyzeImage.mock.calls[0][1].signal as AbortSignal;
    fireEvent.press(screen.getByTestId('lens-search-cancel'));
    await waitFor(() => expect(screen.getByTestId('lens-camera-experience')).toBeTruthy());
    expect(signal.aborted).toBe(true);

    resolveSearch(EMPTY_RESULT);
    await waitFor(() => expect(screen.queryByTestId('lens-results-grid')).toBeNull());
    expect(mockAnalyzeImage).toHaveBeenCalledTimes(1);
  });

  it('sélectionne automatiquement le vrai produit repéré, sans points ni poignées', async () => {
    mockDetect.mockResolvedValue(MATCHES);
    mockAnalyzeImage.mockResolvedValue(EMPTY_RESULT);

    render(wrap(<LensScreen />));
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);

    // Grounding happens separately from SerpApi merchant search.
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    expect(mockAnalyzeImage.mock.calls[0][1].roi).toEqual({x:10,y:20,w:50,h:40});
    expect(await screen.findByTestId('lens-selected-product')).toBeTruthy();
    // Aucun point de produit : ce sont les pages, pas des zones, qu'on montre.
    expect(screen.queryByTestId('lens-product-dot-0')).toBeNull();
  });

  it('montre la couronne de recherche autour du produit cherché, puis la retire', async () => {
    let resolveSearch!: (value: typeof EMPTY_RESULT) => void;
    mockAnalyzeImage.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));

    render(wrap(<LensScreen />));
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);

    // Pendant la recherche : 8 points autour du cadre + le trait de balayage.
    expect(await screen.findByTestId('lens-search-ring')).toBeTruthy();
    expect(screen.getByTestId('lens-search-scan')).toBeTruthy();
    for (let index = 0; index < 8; index += 1) {
      expect(screen.getByTestId(`lens-search-dot-${index}`)).toBeTruthy();
    }

    // Résultat rendu : plus aucune attente affichée.
    resolveSearch(EMPTY_RESULT);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    await waitFor(() => expect(screen.queryByTestId('lens-search-ring')).toBeNull());
    expect(screen.queryByTestId('lens-search-scan')).toBeNull();
  });

  it('annonce honnêtement la panne du repérage et cherche la photo entière, sans cadre inventé', async () => {
    mockLocalize.mockRejectedValue(new Error('unavailable'));
    mockAnalyzeImage.mockResolvedValue(EMPTY_RESULT);
    render(wrap(<LensScreen />));
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    expect(mockAnalyzeImage.mock.calls[0][1].roi).toBeUndefined();
    expect(screen.queryByTestId('lens-selected-product')).toBeNull();
    expect(screen.getByText('Sélection automatique indisponible. La recherche sur la photo entière reste disponible.')).toBeTruthy();
  });

  it('annule le repérage si on ferme avant sa réponse et ignore sa sélection périmée', async () => {
    let resolveGround!: (value: unknown) => void;
    mockLocalize.mockReturnValue(new Promise(resolve=>{resolveGround=resolve;}));
    render(wrap(<LensScreen />));
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);
    await waitFor(() => expect(mockLocalize).toHaveBeenCalledTimes(1));
    const signal=mockLocalize.mock.calls[0][1].signal;
    fireEvent.press(screen.getByTestId('lens-search-cancel'));
    expect(signal.aborted).toBe(true);
    await act(async()=>resolveGround([{name:'Sac',box:{x:.1,y:.1,w:.3,h:.3}}]));
    expect(mockAnalyzeImage).not.toHaveBeenCalled();
  });

  it('barre des modes sous les boutons, menu ⋮ et Produits interdits', async () => {
    render(wrap(<LensScreen />));
    expect(await screen.findByTestId('lens-capture')).toBeTruthy();
    expect(screen.getByText('Z Lens')).toBeTruthy();
    for (const label of ['Live', 'QR code', 'Lien', 'Mot clé']) expect(screen.getByText(label)).toBeTruthy();

    fireEvent.press(screen.getByTestId('lens-open-menu'));
    expect(await screen.findByTestId('lens-menu')).toBeTruthy();
    fireEvent.press(screen.getByTestId('lens-menu-rules'));
    expect(await screen.findByTestId('lens-rules')).toBeTruthy();
    expect(screen.getByText('Ne photographiez pas et ne soumettez pas les visages de personnes.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('lens-mode-link'));
    expect(await screen.findByTestId('lens-link-search')).toBeTruthy();
    expect(screen.queryByTestId('lens-capture')).toBeNull();
  });
  it('renders streamed cards before done, with remaining loading slots', async () => {
    let finish!: (value: any) => void;
    mockAnalyzeImage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(wrap(<LensScreen />));
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    const candidate = { id: 'streamed', kind: 'external', title: 'Veste bleue', brand: 'Marque', source: 'Boutique', sourceUrl: 'https://www.zalando.fr/product.html', image: '', images: [], sizes: [], colors: [], offers: [], variantOptions: [] };
    await act(async () => mockAnalyzeImage.mock.calls[0][1].onCard(candidate));
    expect(screen.getByTestId('lens-result-streamed')).toBeTruthy();
    expect(screen.getByTestId('lens-stream-pending')).toBeTruthy();
    await act(async () => finish({ ...EMPTY_RESULT, candidates: [candidate] }));
    await waitFor(() => expect(screen.queryByTestId('lens-stream-pending')).toBeNull());
    expect(screen.getByTestId('lens-result-streamed')).toBeTruthy();
  });

});
