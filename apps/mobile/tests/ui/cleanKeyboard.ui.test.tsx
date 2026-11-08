import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, type KeyboardEvent, type View } from 'react-native';
import { useCleanKeyboard } from '@/features/sonim/useCleanKeyboard';
it('measures the real overlap and clears it after resize/hide instead of hiding or double-lifting the composer', () => {
  const events: Record<string, (event: KeyboardEvent) => void> = {};
  const remove = jest.fn();
  const listener = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => { events[name] = callback; return { remove } as unknown as ReturnType<typeof Keyboard.addListener>; });
  const hook = renderHook(useCleanKeyboard);
  let height = 844;
  hook.result.current.root.current = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 390, height) } as unknown as View;
  act(() => { (events.keyboardDidShow ?? events.keyboardWillChangeFrame)({ endCoordinates: { screenY: 524 } } as KeyboardEvent); });
  expect(hook.result.current.overlap).toBe(320); expect(hook.result.current.open).toBe(true);
  height = 524;
  act(() => hook.result.current.measure()); expect(hook.result.current.overlap).toBe(0);
  act(() => { (events.keyboardDidHide ?? events.keyboardWillHide)({} as KeyboardEvent); });
  expect(hook.result.current.open).toBe(false); expect(hook.result.current.overlap).toBe(0);
  hook.unmount(); expect(remove).toHaveBeenCalledTimes(2); listener.mockRestore();
});
