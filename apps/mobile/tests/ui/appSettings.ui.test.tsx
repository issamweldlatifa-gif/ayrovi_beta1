import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Settings from '../../app/account/settings/index';
import Language from '../../app/account/settings/language';
import Appearance from '../../app/account/settings/appearance';
import Tracking from '../../app/account/settings/tracking';
import Notifications from '../../app/account/preferences';
import Newsletter from '../../app/account/settings/newsletter';
import Privacy from '../../app/legal/privacy';
import { fetchOverview, fetchPreferences, saveNewsletterPreference, savePreferences } from '@/api/account';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PlaybackWifiProvider, PrefsProvider, useOptionalAnalytics, usePrefs, useVideoAutoplay } from '@/state/prefs';
import type { ReactElement, ReactNode } from 'react';
import { LEGAL_DOCS } from '@/legal/legalDocs';

const mockSession = jest.fn();
jest.mock('@/state/session', () => ({ useSession: () => mockSession() }));
jest.mock('@/api/account', () => ({ fetchPreferences: jest.fn(), savePreferences: jest.fn(), fetchOverview: jest.fn(), saveNewsletterPreference: jest.fn() }));
jest.mock('@/api/hooks', () => ({ useFooterInfo: () => ({ data: { channels: [] } }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));

const owner = { id: 'viewer', displayName: 'Test', marketingOptIn: false } as Awaited<ReturnType<typeof saveNewsletterPreference>>;
const channels = { darkMode: false, orderUpdates: true, paymentUpdates: true, shippingUpdates: true, invoiceUpdates: false };
let client: QueryClient;
const tree = (element: ReactElement) => <QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>
  {element}
</ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>;
async function mount(element: ReactElement) {
  const view = render(tree(element));
  await act(async () => {});
  return view;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mockSession.mockReturnValue({ status: 'signedOut' });
  jest.mocked(fetchPreferences).mockResolvedValue(channels);
  jest.mocked(fetchOverview).mockResolvedValue({ account: owner } as Awaited<ReturnType<typeof fetchOverview>>);
});

it('offers device settings to guests, keeps notification preferences gated and persists the video switch', async () => {
  await mount(<Settings />);
  expect(screen.getByRole('header', { name: 'Paramètres de l’application' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: /Langue · Français/ }));
  expect(router.push).toHaveBeenLastCalledWith('/account/settings/language');
  fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
  expect(router.push).toHaveBeenLastCalledWith('/account/preferences');
  expect(fetchPreferences).not.toHaveBeenCalled();
  fireEvent(screen.getByLabelText('Lecture automatique des vidéos'), 'valueChange', false);
  expect(screen.queryByText('Wi-Fi uniquement')).toBeNull();
  expect(JSON.parse((await AsyncStorage.getItem('zayrovi.prefs.v1'))!).videoAutoplay).toBe(false);
});

it('changes the real app language and appearance', async () => {
  const view = await mount(<Language />);
  fireEvent.press(screen.getByRole('radio', { name: 'العربية' }));
  expect(screen.getByRole('header', { name: 'اختار اللغة' })).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
  view.rerender(tree(<Appearance />));
  fireEvent.press(screen.getByRole('radio', { name: 'Sombre' }));
  expect(screen.getByRole('radio', { name: 'Sombre' }).props.accessibilityState.checked).toBe(true);
});

it('counts the actual channels and saves only the switched notification preference', async () => {
  mockSession.mockReturnValue({ status: 'signedIn', account: owner });
  const view = await mount(<Settings />);
  expect(await screen.findByText('3/4 catégories activées')).toBeTruthy();
  view.rerender(tree(<Notifications />));
  const ui = screen.getAllByRole('switch');
  expect(ui).toHaveLength(4);
  fireEvent(ui[3], 'valueChange', true);
  await waitFor(() => expect(savePreferences).toHaveBeenCalledWith({ invoiceUpdates: true }));
});

it('records the newsletter preference without claiming an email was sent', async () => {
  mockSession.mockReturnValue({ status: 'signedIn', account: owner });
  jest.mocked(saveNewsletterPreference).mockResolvedValue({ ...owner, marketingOptIn: true });
  await mount(<Newsletter />);
  fireEvent(await screen.findByLabelText('Recevoir les actualités et offres ZAYROVI'), 'valueChange', true);
  expect(await screen.findByText('Préférence enregistrée.')).toBeTruthy();
  expect(saveNewsletterPreference).toHaveBeenCalledWith(true);
});

it('saves analytics only on confirmation and offers the actual privacy chapters', async () => {
  const view = await mount(<Tracking />);
  const toggle = screen.getByLabelText('Statistiques facultatives');
  expect(toggle.props.value).toBe(false);
  fireEvent(toggle, 'valueChange', true);
  expect(await AsyncStorage.getItem('zayrovi.prefs.v1')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));
  expect(JSON.parse((await AsyncStorage.getItem('zayrovi.prefs.v1'))!).optionalAnalytics).toBe(true);
  expect(router.back).toHaveBeenCalled();
  view.rerender(tree(<Privacy />));
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Choisir un chapitre' }));
  const heading = LEGAL_DOCS.privacy.fr!.blocks.find(block => block.kind === 'h2')!;
  fireEvent.press(screen.getByRole('button', { name: heading.text }));
  expect(screen.queryByRole('button', { name: heading.text })).toBeNull();
});

it('uses Wi-Fi state for the constrained playback preference and fails closed for optional analytics', async () => {
  await AsyncStorage.setItem('zayrovi.prefs.v1', JSON.stringify({ autoplayWifiOnly: true, optionalAnalytics: true }));
  let wifi = false;
  const { result, rerender } = renderHook(() => ({ autoplay: useVideoAutoplay(), analytics: useOptionalAnalytics(), prefs: usePrefs() }), {
    wrapper: ({ children }: { children: ReactNode }) => <PrefsProvider><PlaybackWifiProvider connected={wifi}>{children}</PlaybackWifiProvider></PrefsProvider>,
  });
  expect(result.current.analytics).toBe(false);
  await act(async () => {});
  expect(result.current).toMatchObject({ autoplay: false, analytics: true });
  wifi = true;
  rerender({});
  expect(result.current.autoplay).toBe(true);
  act(() => { result.current.prefs.setVideoAutoplay(false); result.current.prefs.setOptionalAnalytics(false); });
  expect(result.current).toMatchObject({ autoplay: false, analytics: false });
});
