import { act, renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { useDeepLinkRouting } from '@/features/links/useDeepLinkRouting';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
let receive: (event: { url: string }) => void;
let resolveInitial: (url: string | null) => void;
const remove = jest.fn();
beforeEach(() => {
  jest.spyOn(Linking, 'getInitialURL').mockImplementation(() => new Promise(resolve => { resolveInitial = resolve; }));
  jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, listener) => { receive = listener; return { remove } as unknown as ReturnType<typeof Linking.addEventListener>; });
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });
it('queues a warm link received before the navigator mounts and flushes it exactly once', async () => {
  const hook = renderHook<void, { enabled: boolean }>(({ enabled }) => useDeepLinkRouting(enabled), { initialProps: { enabled: false } });
  act(() => receive({ url: 'https://zayrovi.com/news' }));
  expect(router.push).not.toHaveBeenCalled();
  hook.rerender({ enabled: true });
  expect(router.push).toHaveBeenCalledWith('/news');
  await act(async () => resolveInitial('https://zayrovi.com/orders'));
  expect(router.push).toHaveBeenCalledTimes(1);
  hook.unmount(); expect(remove).toHaveBeenCalledTimes(1);
});
it('retains cold links, rejects foreign hosts, and ignores late OS replies after unmount', async () => {
  const hook = renderHook<void, { enabled: boolean }>(({ enabled }) => useDeepLinkRouting(enabled), { initialProps: { enabled: false } });
  act(() => receive({ url: 'https://attacker.example/catalog' }));
  await act(async () => resolveInitial('https://zayrovi.com/orders'));
  hook.rerender({ enabled: true });
  expect(router.push).toHaveBeenCalledWith('/orders');
  hook.unmount();
  const next = renderHook(() => useDeepLinkRouting(true));
  next.unmount();
  await act(async () => resolveInitial('https://zayrovi.com/catalog'));
  expect(router.push).toHaveBeenCalledTimes(1);
});

it('leaves exact HTTPS item shares to Expo Router and drops any older queued navigation', async () => {
  const hook = renderHook<void, { enabled: boolean }>(({ enabled }) => useDeepLinkRouting(enabled), { initialProps: { enabled: false } });
  act(() => receive({ url: 'https://zayrovi.com/news' }));
  act(() => receive({ url: 'https://zayrovi.com/ar/r/reel_1' }));
  hook.rerender({ enabled: true });
  await act(async () => resolveInitial('https://zayrovi.com/orders'));
  expect(router.push).not.toHaveBeenCalled();
});

it('leaves legacy Boutique links to the native publisher redirect without a duplicate push', async () => {
  renderHook(() => useDeepLinkRouting(true));
  act(() => receive({ url: 'https://zayrovi.com/catalog?arrivalId=arr_1' }));
  await act(async () => resolveInitial(null));
  expect(router.push).not.toHaveBeenCalled();
});
