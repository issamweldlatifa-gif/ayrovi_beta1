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
  detectProducts: (...args: unknown[]) => mockDetect(...args),
  analyzeUrl: jest.fn(),
  analyzeCode: jest.fn(),
  analyzeBarcode: jest.fn(),
  analyzeText: jest.fn(),
  fetchLensHistory: jest.fn(async () => []),
  markChosen: jest.fn(async () => undefined),
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

const OUTFIT = {
  products: [
    { name: 'Jogging jaune', category: 'clothing', box: { x: 0.34, y: 0.43, w: 0.4, h: 0.3 } },
    { name: 'Sweat à capuche jaune', category: 'clothing', box: { x: 0.12, y: 0.17, w: 0.74, h: 0.29 } },
    { name: 'Baskets blanches', category: 'shoes', box: { x: 0.33, y: 0.62, w: 0.4, h: 0.21 } },
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
    mockDetect.mockResolvedValue({ products: [], width: null, height: null });
    mockAnalyzeImage.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));

    render(wrap(<LensScreen />));

    expect(await screen.findByTestId('lens-camera-experience')).toBeTruthy();
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);

    expect(await screen.findByTestId('lens-search-skeleton')).toBeTruthy();
    expect(screen.getByTestId('lens-captured-preview')).toBeTruthy();
    expect(shutterCalls()).toHaveLength(1);
    // Aucun produit repéré → recherche sur toute la photo, sans `roi`.
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    expect(mockAnalyzeImage.mock.calls[0][1].roi).toBeUndefined();

    const signal = mockAnalyzeImage.mock.calls[0][1].signal as AbortSignal;
    fireEvent.press(screen.getByTestId('lens-search-cancel'));
    await waitFor(() => expect(screen.getByTestId('lens-camera-experience')).toBeTruthy());
    expect(signal.aborted).toBe(true);

    resolveSearch(EMPTY_RESULT);
    await waitFor(() => expect(screen.queryByTestId('lens-results-grid')).toBeNull());
    expect(mockAnalyzeImage).toHaveBeenCalledTimes(1);
  });

  it('pose le cadre sur le plus grand produit, puis relance la recherche sur le produit touché', async () => {
    mockDetect.mockResolvedValue(OUTFIT);
    mockAnalyzeImage.mockResolvedValue(EMPTY_RESULT);

    render(wrap(<LensScreen />));
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);

    // Plusieurs produits → le plus grand (le sweat, index 1) est cherché d'office.
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(1));
    const firstRoi = mockAnalyzeImage.mock.calls[0][1].roi;
    expect(firstRoi.x).toBeCloseTo(10.5, 0);
    expect(firstRoi.w).toBeCloseTo(77, 0);
    expect(await screen.findByTestId('lens-selection-frame')).toBeTruthy();

    // Toucher le point des baskets : le cadre saute dessus et la recherche se relance.
    fireEvent.press(await screen.findByTestId('lens-product-dot-2'));
    await waitFor(() => expect(mockAnalyzeImage).toHaveBeenCalledTimes(2));
    const secondRoi = mockAnalyzeImage.mock.calls[1][1].roi;
    expect(secondRoi.y).toBeCloseTo(60.5, 0);
    expect(secondRoi.h).toBeCloseTo(24, 0);

    // Revenir au sweat ne relance pas de recherche : le résultat est déjà connu.
    fireEvent.press(await screen.findByTestId('lens-product-dot-1'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(mockAnalyzeImage).toHaveBeenCalledTimes(2);
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
