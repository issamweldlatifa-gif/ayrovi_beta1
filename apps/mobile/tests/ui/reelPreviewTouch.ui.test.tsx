import { AppState, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useVideoPlayer } from 'expo-video';
import { ReelPreview } from '../../src/features/reels/ReelPreview';
import { reloadReelVideo } from '../../src/features/reels/playReelVideo';
const mockPlayer = { pause: jest.fn(), muted: false, loop: false };
jest.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: jest.fn(() => mockPlayer),
}));
jest.mock('../../src/features/reels/useReelPlaybackStatus', () => ({
  useReelPlaybackStatus: () => ({ status: 'readyToPlay', reportError: mockReportError }),
}));
const mockReportError = jest.fn();
// Le filet de chargement est une boucle Animated : en test on le fige (réduction
// des animations) pour que le décompte des minuteries ne mesure que l'échéance.
jest.mock('../../src/design/motion', () => ({ ...jest.requireActual('../../src/design/motion'), useReduceMotion: () => true }));
jest.mock('../../src/features/reels/playReelVideo', () => ({
  playReelVideo: jest.fn(), reloadReelVideo: jest.fn(async () => {}),
}));
it('leaves touches to the navigation tile and loads the source asynchronously', () => {
  const preview = render(<ReelPreview uri="/media/reels/real.mp4" playing />);
  const video = screen.getByTestId('reel-preview-video');
  expect(video.props.pointerEvents).toBe('none');
  const surface = screen.getByTestId('reel-preview-surface');
  expect(surface.props.pointerEvents).toBe('none');
  expect(surface.props.collapsable).toBe(false);
  expect(video.props.surfaceType).toBe('textureView');
  expect(useVideoPlayer).toHaveBeenCalledWith(null, expect.any(Function));
  expect(reloadReelVideo).toHaveBeenCalledWith(mockPlayer, null, expect.stringContaining('/media/reels/real.mp4'));
  preview.rerender(<ReelPreview uri="/media/reels/real.mp4" playing={false} />);
  expect(mockPlayer.pause).toHaveBeenCalled();
});

jest.mock('../../src/design/theme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('../../src/i18n', () => ({ useT: () => (key: string) => key, useI18n: () => ({ locale: 'ar' }) }));
it('fills fullscreen video without stretching and preserves contain for embedded cards', () => {
  const { ReelPlayback } = require('../../src/features/reels/ReelPlayback');
  const { VideoView } = require('expo-video');
  const props = { id: 'r1', uri: '/real.mp4', paused: false, onPausedChange: jest.fn(), soundOn: false, blocked: false };
  const player = render(<ReelPlayback {...props} contentFit="cover" />);
  expect(screen.UNSAFE_getByType(VideoView).props.contentFit).toBe('cover');
  player.rerender(<ReelPlayback {...props} />);
  expect(screen.UNSAFE_getByType(VideoView).props.contentFit).toBe('contain');
});

jest.mock('../../src/design/LoadingScreen', () => ({ BrandLoadingIndicator: () => null }));
it('keeps loading until the native first-frame callback, not just readyToPlay', () => {
  const original = AppState.currentState;
  AppState.currentState = 'active';
  jest.useFakeTimers();
  try {
    const { ReelPlayback } = require('../../src/features/reels/ReelPlayback');
    const { VideoView } = require('expo-video');
    const player = render(<ReelPlayback id="frame" uri="/real.mp4" paused={false} onPausedChange={jest.fn()} soundOn={false} blocked={false} />);
    expect(screen.queryByTestId('reel-loading-frame')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('reel-video-surface-frame').props.style).opacity).toBe(0);
    act(() => jest.advanceTimersByTime(699));
    expect(screen.queryByTestId('reel-loading-frame')).toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId('reel-loading-frame')).toBeTruthy();
    fireEvent(screen.UNSAFE_getByType(VideoView), 'firstFrameRender');
    expect(screen.queryByTestId('reel-loading-frame')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('reel-video-surface-frame').props.style).opacity).toBe(1);
    player.unmount();
  } finally { AppState.currentState = original; jest.useRealTimers(); }
});
it('reports a ready-but-no-frame stall and clears its deadline on unmount', () => {
  jest.useFakeTimers(); mockReportError.mockClear();
  const original = AppState.currentState; AppState.currentState = 'active';
  try {
    const { ReelPlayback } = require('../../src/features/reels/ReelPlayback');
    const player = render(<ReelPlayback id="stall" uri="/real.mp4" paused={false} onPausedChange={jest.fn()} soundOn={false} blocked={false} />);
    act(() => jest.advanceTimersByTime(20_000));
    expect(mockReportError).toHaveBeenCalledTimes(1);
    player.unmount();
    expect(jest.getTimerCount()).toBe(0);
  } finally { AppState.currentState = original; jest.useRealTimers(); }
});

it('never flashes the loading indicator when the first frame arrives during the grace period', () => {
  jest.useFakeTimers(); const original = AppState.currentState; AppState.currentState = 'active';
  try {
    const { ReelPlayback } = require('../../src/features/reels/ReelPlayback');
    const { VideoView } = require('expo-video');
    const player = render(<ReelPlayback id="fast" uri="/fast.mp4" paused={false} onPausedChange={jest.fn()} soundOn={false} blocked={false} />);
    act(() => jest.advanceTimersByTime(100));
    fireEvent(screen.UNSAFE_getByType(VideoView), 'firstFrameRender');
    act(() => jest.advanceTimersByTime(500));
    expect(screen.queryByTestId('reel-loading-fast')).toBeNull();
    player.unmount(); expect(jest.getTimerCount()).toBe(0);
  } finally { AppState.currentState = original; jest.useRealTimers(); }
});
