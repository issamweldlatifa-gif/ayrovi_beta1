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
  expect(video.props.surfaceType).toBe('textureView');
  expect(useVideoPlayer).toHaveBeenCalledWith(null, expect.any(Function));
  expect(reloadReelVideo).toHaveBeenCalledWith(mockPlayer, null, expect.stringContaining('/media/reels/real.mp4'));
  preview.rerender(<ReelPreview uri="/media/reels/real.mp4" playing={false} />);
  expect(mockPlayer.pause).toHaveBeenCalled();
});
