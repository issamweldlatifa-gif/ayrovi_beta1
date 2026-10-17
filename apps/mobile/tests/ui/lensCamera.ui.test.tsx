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
    // Cadre manuel, cadre = toute la photo → recherche sur toute la photo, sans `roi`.
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    expect(mockAnalyzeImage.mock.calls[0][1].roi).toBeUndefined();
    // Une seule requête de reconnaissance visuelle : pas de détection séparée.
    expect(mockDetect).not.toHaveBeenCalled();

    const signal = mockAnalyzeImage.mock.calls[0][1].signal as AbortSignal;
    fireEvent.press(screen.getByTestId('lens-search-cancel'));
    await waitFor(() => expect(screen.getByTestId('lens-camera-experience')).toBeTruthy());
    expect(signal.aborted).toBe(true);

    resolveSearch(EMPTY_RESULT);
    await waitFor(() => expect(screen.queryByTestId('lens-results-grid')).toBeNull());
    expect(mockAnalyzeImage).toHaveBeenCalledTimes(1);
  });

  it('cherche sur toute la photo : le cadre reste manuel, à l’utilisateur', async () => {
    mockDetect.mockResolvedValue(MATCHES);
    mockAnalyzeImage.mockResolvedValue(EMPTY_RESULT);

    render(wrap(<LensScreen />));
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);

    // SerpApi ne rend pas de boîtes : le cadre part sur TOUTE la photo.
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    expect(mockAnalyzeImage.mock.calls[0][1].roi).toBeUndefined();
    expect(await screen.findByTestId('lens-selection-frame')).toBeTruthy();
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
});
