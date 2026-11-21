import { ZAYROVI_NEWS_GUIDES } from '../../../../shared/zayroviNewsGuides';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DailyOfferCard } from '@/features/home/DailyOfferCard';
import { useZayroviNews } from '@/api/zayroviNews';
import ZayroviNews from '../../app/zayrovi-news';
import { DEFAULT_ZAYROVI_NEWS, type NewsCard, type ZayroviNewsFeed } from '../../../../shared/zayroviNews';
import { PrefsProvider } from '@/state/prefs';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/design/theme';

const mockParams = jest.fn((): { view?: string; item?: string } => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => mockParams() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 12, left: 0, right: 0 }) }));
jest.mock('@/api/zayroviNews', () => ({ useZayroviNews: jest.fn() }));
const item = (id: string, kind: NewsCard['kind'], title: string) => ({ id, kind, title: { fr: title, ar: '' }, body: { fr: 'Texte épreuve', ar: '' }, image: '', targetId: id });
const feed: ZayroviNewsFeed = { daily: { ...DEFAULT_ZAYROVI_NEWS.daily, day: 6, percent: 3 }, guides: ZAYROVI_NEWS_GUIDES, entries: [
  item('update', 'notice', 'Annonce'), item('s1', 'story', 'Une Story'), item('r1', 'reel', 'Un Reel'), item('p1', 'publication', 'Un post'), item('n1', 'article', 'Un article'),
] };
async function mount(body: React.ReactNode) {
  const result = render(<PrefsProvider><I18nProvider><ThemeProvider>{body}</ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {});
  return result;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({});
  jest.mocked(useZayroviNews).mockReturnValue({ data: feed, isPending: false } as ReturnType<typeof useZayroviNews>);
});

test('the home card uses the engine percentage and separates info from the newsroom link', async () => {
  await mount(<DailyOfferCard daily={feed.daily} />);
  expect(screen.getByText(/3 % sur le prix produit converti/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('home-daily-offer-open'));
  expect(router.push).toHaveBeenLastCalledWith('/zayrovi-news?view=daily');
  fireEvent.press(screen.getByRole('link', { name: 'Zayrovi News' }));
  expect(router.push).toHaveBeenLastCalledWith('/zayrovi-news');
});

test('the newsroom opens exact native media routes and a notice inside the newsroom', async () => {
  await mount(<ZayroviNews />);
  fireEvent.press(screen.getByRole('link', { name: 'Une Story' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/stories', params: { id: 's1' } });
  fireEvent.press(screen.getByRole('link', { name: 'Un Reel' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/reels-viewer', params: { id: 'r1', shared: '1' } });
  fireEvent.press(screen.getByRole('link', { name: 'Un post' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/publication-look/[id]', params: { id: 'p1' } });
  fireEvent.press(screen.getByRole('link', { name: 'Un article' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/news/[id]', params: { id: 'n1' } });
  fireEvent.press(screen.getByRole('link', { name: 'Annonce' }));
  expect(router.push).toHaveBeenLastCalledWith('/zayrovi-news?item=update');
});

test('the info page shows CRM text and no fabricated offers on an inactive day', async () => {
  mockParams.mockReturnValue({ view: 'daily' });
  jest.mocked(useZayroviNews).mockReturnValue({ data: { ...feed, daily: { ...feed.daily, percent: null, body: { fr: 'Règles du CRM', ar: '' } } }, isPending: false } as ReturnType<typeof useZayroviNews>);
  await mount(<ZayroviNews />);
  expect(screen.getByText('Aucune remise du jour active')).toBeTruthy();
  expect(screen.getByText('Règles du CRM')).toBeTruthy();
  expect(screen.queryByText(/3 %/)).toBeNull();
});


test('a rewritten or hidden detail cannot fall back to an unrelated offer', async () => {
  mockParams.mockReturnValue({ view: 'daily' });
  jest.mocked(useZayroviNews).mockReturnValue({ data: { ...feed, daily: { ...feed.daily, showHome: false, showNews: false } }, isPending: false } as ReturnType<typeof useZayroviNews>);
  await mount(<ZayroviNews />);
  expect(screen.queryByTestId('zayrovi-daily-detail')).toBeNull();
  expect(screen.queryByText('Annonce')).toBeNull();
});


test('shows editorial section headings and a full tool article with a native CTA', async () => {
  await mount(<ZayroviNews />);
  expect(screen.getByRole('header', { name: 'Dernières actualités' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Nos outils' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'À propos de Zayrovi' })).toBeTruthy();
  fireEvent.press(screen.getByTestId('zayrovi-news-entry-guide-z-lens'));
  expect(router.push).toHaveBeenLastCalledWith('/zayrovi-news?item=guide-z-lens');
});

test('a guide detail shows its intertitles and opens the tool from its article', async () => {
  mockParams.mockReturnValue({ item: 'guide-z-lens' });
  await mount(<ZayroviNews />);
  expect(screen.getByRole('header', { name: 'Commencer la recherche' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Examiner les résultats' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Ouvrir Z Lens' }));
  expect(router.push).toHaveBeenLastCalledWith('/z-lens');
});

test('menu opens a section and search filters real newsroom content', async () => {
  await mount(<ZayroviNews />);
  fireEvent.press(screen.getByRole('button', { name: 'Menu Zayrovi News' }));
  fireEvent.press(screen.getByRole('button', { name: 'Nos outils' }));
  expect(screen.getByTestId('zayrovi-news-section-tools')).toBeTruthy();
  expect(screen.queryByTestId('zayrovi-news-section-news')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Rechercher dans Zayrovi News' }));
  fireEvent.changeText(screen.getByTestId('zayrovi-news-search-input'), 'aywebs');
  expect(screen.getByTestId('zayrovi-news-entry-guide-aywebs')).toBeTruthy();
  expect(screen.queryByTestId('zayrovi-news-entry-update')).toBeNull();
});
