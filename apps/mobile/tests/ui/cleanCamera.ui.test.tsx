import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CleanCameraPanel } from '@/features/sonim/CleanCameraPanel';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
const mockTake = jest.fn(async () => ({ uri: 'file:///photo.jpg', width: 800, height: 600, base64: 'abc' }));
jest.mock('expo-camera', () => {
  const React = require('react'), { View } = require('react-native');
  return { CameraView: React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTake }));
    return <View {...props} testID="mock-camera" />;
  }) };
});
jest.mock('@/design/sheet/AppSheet', () => {
  const React = require('react'), { View } = require('react-native');
  return { AppSheet: ({ children, surfaceColor }: { children: React.ReactNode; surfaceColor: string }) => React.createElement(View, { testID: 'camera-container', style: { backgroundColor: surfaceColor } }, children) };
});
function mount(onPhoto = jest.fn(async () => {}), onClose = jest.fn()) {
  const view = render(<PrefsProvider><ThemeProvider><I18nProvider><CleanCameraPanel onPhoto={onPhoto} onClose={onClose} /></I18nProvider></ThemeProvider></PrefsProvider>);
  return { ...view, onPhoto, onClose };
}
beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true }); });
it('waits for real camera readiness, captures a photo and returns it to the draft', async () => {
  const { onPhoto, onClose } = mount();
  expect(screen.getByTestId('clean-camera-capture')).toBeDisabled();
  fireEvent(screen.getByTestId('mock-camera'), 'cameraReady');
  await act(async () => { fireEvent.press(screen.getByTestId('clean-camera-capture')); });
  expect(mockTake).toHaveBeenCalledWith(expect.objectContaining({ base64: true }));
  expect(onPhoto).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' }));
  expect(onClose).toHaveBeenCalled();
});
it('expands flash and camera-switch controls without removing the shutter', () => {
  mount(); fireEvent.press(screen.getByLabelText('Options de la caméra'));
  expect(screen.getByLabelText('Activer ou désactiver le flash')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Changer de caméra'));
  expect(screen.getByTestId('mock-camera').props.facing).toBe('front');
  expect(screen.getByLabelText('Activer ou désactiver le flash')).toBeDisabled();
  expect(screen.getByTestId('clean-camera-capture')).toBeTruthy();
});
it('does not deliver a capture that completes after the camera was closed', async () => {
  let resolve!: (value: { uri: string; width: number; height: number; base64: string }) => void;
  mockTake.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { unmount, onPhoto } = mount(); fireEvent(screen.getByTestId('mock-camera'), 'cameraReady');
  fireEvent.press(screen.getByTestId('clean-camera-capture')); unmount();
  await act(async () => { resolve({ uri: 'file:///stale.jpg', width: 1, height: 1, base64: 'abc' }); });
  expect(onPhoto).not.toHaveBeenCalled();
});

it('keeps the outer camera container transparent, not a white sheet', () => {
  mount();
  expect(screen.getByTestId('camera-container')).toHaveStyle({ backgroundColor: 'transparent' });
  expect(screen.getByTestId('clean-camera-panel')).toHaveStyle({ borderRadius: 28, overflow: 'hidden' });
});
