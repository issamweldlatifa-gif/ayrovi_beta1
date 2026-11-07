import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import {
  hideReelOnDevice,
  restoreHiddenReels,
  useHiddenReels,
} from '../../src/features/reels/reelVisibility';
import { shareReel } from '../../src/features/reels/shareReel';
import { sendInteraction } from '../../src/api/social';
import type { Reel } from '../../src/api/social';
jest.mock('../../src/api/social', () => ({
  sendInteraction: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/session/session', () => ({
  getSessionId: async () => 'qa-reel-session',
}));
afterEach(() => jest.restoreAllMocks());
it('persists device hiding, restores it and never hides after a failed write', async () => {
  await restoreHiddenReels();
  const { result } = renderHook(useHiddenReels);
  await act(async () => {
    await hideReelOnDevice('r1');
  });
  expect(result.current).toEqual(['r1']);
  expect(
    JSON.parse((await AsyncStorage.getItem('ayrovi.reels.hidden.device.v1'))!)
  ).toEqual(['r1']);
  jest
    .spyOn(AsyncStorage, 'setItem')
    .mockRejectedValueOnce(new Error('Storage unavailable'));
  await act(async () => {
    await expect(hideReelOnDevice('r2')).rejects.toThrow('Storage unavailable');
  });
  expect(result.current).toEqual(['r1']);
  await act(async () => {
    await restoreHiddenReels();
  });
  expect(result.current).toEqual([]);
});
it('shares a real deep link and records only a system-reported share', async () => {
  const reel = { id: 'r1', title: 'A real Reel' } as Reel;
  const share = jest.spyOn(Share, 'share');
  (sendInteraction as jest.Mock).mockClear();
  share.mockResolvedValueOnce({ action: Share.dismissedAction });
  await shareReel(reel);
  expect(sendInteraction).not.toHaveBeenCalled();
  share.mockResolvedValueOnce({ action: Share.sharedAction });
  await shareReel(reel);
  expect(share).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('/reels-viewer?id=r1'),
    })
  );
  expect(sendInteraction).toHaveBeenCalledTimes(1);
  expect(sendInteraction).toHaveBeenCalledWith({
    type: 'share',
    targetId: 'r1',
    sessionId: 'qa-reel-session',
  });
});
