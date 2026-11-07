import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, AppState } from 'react-native';
import { useReelPreviewActivity } from '../../src/features/reels/useReelPreviewActivity';
const originalState = AppState.currentState;
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  AppState.currentState = originalState;
  mockFocused = true;
});
it('plays only on-screen and focused; pauses for background, scrolling away and reduced motion', async () => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  let app: (value: import('react-native').AppStateStatus) => void = () => {},
    motion: (value: boolean) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, callback) => {
      app = callback;
      return { remove: jest.fn() };
    });
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_type, callback) => {
      motion = callback as unknown as (value: boolean) => void;
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
  let y = 20;
  const ref = {
    current: {
      measureInWindow: (callback: Function) => callback(0, y, 200, 300),
    },
  } as any;
  const { result, rerender, unmount } = renderHook(() =>
    useReelPreviewActivity(ref)
  );
  await act(async () => {});
  expect(result.current).toEqual({ visible: true, autoplay: true });
  act(() => {
    y = 5000;
    jest.advanceTimersByTime(500);
  });
  expect(result.current.visible).toBe(false);
  act(() => {
    y = 20;
    jest.advanceTimersByTime(500);
    motion(true);
  });
  expect(result.current).toEqual({ visible: true, autoplay: false });
  act(() => app('background'));
  expect(result.current.visible).toBe(false);
  act(() => {
    app('active');
    motion(false);
  });
  mockFocused = false;
  rerender({});
  expect(result.current.visible).toBe(false);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
