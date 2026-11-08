import { act, render, fireEvent } from '@testing-library/react-native';
import { Animated } from 'react-native';
import Svg from 'react-native-svg';
import { BrandEntrance } from '@/design/BrandEntrance';
import { TabHomeIcon } from '@/design/TabNavIcons';
let mockReduce = false;
let mockMode = 'light';
jest.mock('@/design/motion', () => ({ useReduceMotion: () => mockReduce }));
jest.mock('@/design/theme', () => ({ useTheme: () => ({ mode: mockMode, colors: { ink: '#0A0A0A', muted: '#666666', line: '#E5E5E5' }, iconSize: { md: 24 } }) }));
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); mockReduce = false; mockMode = 'light'; });
it('keeps the Home symbol monochrome in both selection states and themes', () => {
  const tree = render(<TabHomeIcon color="black" focused={false} />);
  expect(tree.UNSAFE_getByType(Svg).props.stroke).toBe('#0A0A0A');
  tree.rerender(<TabHomeIcon color="black" focused />);
  expect(tree.UNSAFE_getByType(Svg).props.stroke).toBe('#0A0A0A');
  mockMode = 'dark';
  tree.rerender(<TabHomeIcon color="black" focused={false} />);
  expect(tree.UNSAFE_getByType(Svg).props.stroke).toBe('#FFFFFF');
  tree.rerender(<TabHomeIcon color="black" focused />);
  expect(tree.UNSAFE_getByType(Svg).props.stroke).toBe('#FFFFFF');
});
it('releases the native splash after paint, waits for readiness and completes once even if animation callbacks are lost', () => {
  jest.useFakeTimers();
  jest.spyOn(Animated, 'sequence').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  const onDone = jest.fn(), onShown = jest.fn();
  const tree = render(<BrandEntrance ready={false} onShown={onShown} onDone={onDone} />);
  expect(onShown).not.toHaveBeenCalled();
  fireEvent(tree.getByTestId('brand-entrance'), 'layout', { nativeEvent: { layout: { width: 390, height: 800, x: 0, y: 0 } } });
  expect(onShown).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1100));
  expect(onDone).not.toHaveBeenCalled();
  tree.rerender(<BrandEntrance ready onShown={onShown} onDone={onDone} />);
  act(() => jest.advanceTimersByTime(300));
  expect(onDone).toHaveBeenCalledTimes(1);
  tree.unmount();
  act(() => jest.advanceTimersByTime(2000));
  expect(onDone).toHaveBeenCalledTimes(1);
});
it('skips the expanding motion with reduced motion and never blocks a ready app', () => {
  mockReduce = true;
  const onDone = jest.fn();
  const sequence = jest.spyOn(Animated, 'sequence');
  const tree = render(<BrandEntrance ready onShown={() => {}} onDone={onDone} />);
  fireEvent(tree.getByTestId('brand-entrance'), 'layout', { nativeEvent: { layout: { width: 390, height: 800, x: 0, y: 0 } } });
  expect(sequence).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('centers the blue fill on the measured overlay and does not replay on rotation', () => {
  const onShown = jest.fn();
  const tree = render(<BrandEntrance ready={false} onShown={onShown} onDone={() => {}} />);
  const layout = (width: number, height: number) => fireEvent(tree.getByTestId('brand-entrance'), 'layout', { nativeEvent: { layout: { width, height, x: 0, y: 0 } } });
  layout(390, 780); layout(780, 390);
  expect(onShown).toHaveBeenCalledTimes(1);
  expect(tree.getByTestId('brand-blue-fill').props.style).toMatchObject({ left: '50%', top: '50%', marginLeft: -48, marginTop: -48 });
});
