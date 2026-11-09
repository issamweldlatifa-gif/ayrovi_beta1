import { render, screen } from '@testing-library/react-native';
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
