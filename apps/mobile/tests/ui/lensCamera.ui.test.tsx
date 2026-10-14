import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LensScreen from '@/../app/lens';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockTakePicture = jest.fn(async () => ({ uri: 'file:///lens-capture.jpg' }));
const mockAnalyzeImage = jest.fn();
const mockRequestPermission = jest.fn(async () => ({ granted: true }));

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

jest.mock('@/api/lens', () => ({
  analyzeImage: (...args: unknown[]) => mockAnalyzeImage(...args),
  analyzeUrl: jest.fn(),
  analyzeCode: jest.fn(),
  analyzeBarcode: jest.fn(),
  analyzeText: jest.fn(),
  markChosen: jest.fn(async () => undefined),
}));

jest.mock('@/api/account', () => ({ addExternalFavorite: jest.fn(async () => undefined) }));
jest.mock('@/api/cart', () => ({ addExternalToCart: jest.fn(async () => undefined) }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
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

describe('caméra Lens directe', () => {
  beforeEach(() => {
    mockTakePicture.mockClear();
    mockAnalyzeImage.mockReset();
    mockRequestPermission.mockClear();
  });

  it('capture une seule fois, garde la photo sous les squelettes et annule sans résultat périmé', async () => {
    let resolveSearch!: (value: { candidates: never[]; eventId: string; excluded: { count: number; reasons: Record<string, number> } }) => void;
    mockAnalyzeImage.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));

    render(wrap(<LensScreen />));

    expect(await screen.findByTestId('lens-camera-experience')).toBeTruthy();
    const capture = await screen.findByTestId('lens-capture');
    await waitFor(() => expect(capture.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(capture);

    expect(await screen.findByTestId('lens-search-skeleton')).toBeTruthy();
    expect(screen.getByTestId('lens-captured-preview')).toBeTruthy();
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeImage).toHaveBeenCalledTimes(1);

    const signal = mockAnalyzeImage.mock.calls[0][1].signal as AbortSignal;
    fireEvent.press(screen.getByTestId('lens-search-cancel'));
    await waitFor(() => expect(screen.getByTestId('lens-camera-experience')).toBeTruthy());
    expect(signal.aborted).toBe(true);

    resolveSearch({ candidates: [], eventId: 'late', excluded: { count: 0, reasons: {} } });
    await waitFor(() => expect(screen.queryByTestId('lens-results-grid')).toBeNull());
    expect(mockAnalyzeImage).toHaveBeenCalledTimes(1);
  });
});
