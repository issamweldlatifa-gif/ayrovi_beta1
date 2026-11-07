import { act, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { usePublicationTransition } from '../../src/features/publications/usePublicationTransition';
let mockReduced = false;
jest.mock('../../src/design/motion', () => ({
  useReduceMotion: () => mockReduced,
}));
beforeEach(() => {
  mockReduced = false;
  jest.useFakeTimers();
  jest
    .spyOn(Animated, 'timing')
    .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it('completes one close even if a native animation is interrupted or its callback is lost', () => {
  const close = jest.fn();
  const { result, unmount } = renderHook(() => usePublicationTransition(close));
  act(() => {
    result.current.close();
    result.current.close();
    jest.advanceTimersByTime(200);
  });
  expect(close).toHaveBeenCalledTimes(1);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
it('closes immediately without tweening for reduced motion', () => {
  mockReduced = true;
  const close = jest.fn();
  const { result } = renderHook(() => usePublicationTransition(close));
  act(() => result.current.close());
  expect(close).toHaveBeenCalledTimes(1);
  expect(Animated.timing).not.toHaveBeenCalled();
});
it('does not strand a close if motion preference changes during it', () => {
  const close = jest.fn();
  const { result, rerender } = renderHook(() =>
    usePublicationTransition(close)
  );
  act(() => result.current.close());
  mockReduced = true;
  rerender({});
  act(() => jest.advanceTimersByTime(1000));
  expect(close).toHaveBeenCalledTimes(1);
});
