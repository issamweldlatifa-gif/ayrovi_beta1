import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import StoriesScreen from '../../app/stories';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/design/theme';
import { PrefsProvider } from '@/state/prefs';

const mockParams: { id?: string; focus?: string } = {};
jest.mock('expo-router', () => ({ useIsFocused: () => true, useLocalSearchParams: () => mockParams, router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('@/design/motion', () => ({ ...jest.requireActual('@/design/motion'), useReduceMotion: () => true }));
jest.mock('@/features/publications/usePublisherFollow', () => ({ usePublisherFollow: (_id: string, onAuth: () => void) => ({ state: 'idle', press: onAuth }) }));
jest.mock('@/features/stories/EditorialStoryScreen', () => ({ EditorialStoryScreen: 'EditorialStoryScreen' }));
const mockStory = (i: number) => ({ id: `story-${i}`, mediaType: 'IMAGE', mediaUrl: `/media/stories/${i}.jpg`, title: `Story ${i}`, description: 'Description' });
const mockStories = { data: Array.from({ length: 12 }, (_, i) => mockStory(i + 1)), refetch: jest.fn(), isPending: false, isError: false, isRefetching: false };
const mockSettings = { data: { cardCount: 1, enabled: true }, refetch: jest.fn(), isRefetching: false };
let mockStoriesOverride: typeof mockStories | null = null;
jest.mock('@/api/hooks', () => ({ useStories: () => mockStoriesOverride ?? mockStories, useStoriesShowcase: () => mockSettings }));

const wrap = (child: React.ReactElement) => <PrefsProvider><I18nProvider><ThemeProvider>{child}</ThemeProvider></I18nProvider></PrefsProvider>;
beforeEach(() => { jest.clearAllMocks(); mockParams.id = undefined; mockParams.focus = undefined; mockStoriesOverride = null; });

it('opens a pure-black gallery, leads with the selected story, and opens its editorial viewer from the gallery', async () => {
  mockParams.focus = 'story-3';
  render(wrap(<StoriesScreen />));
  expect(StyleSheet.flatten(screen.getByTestId('stories-gallery-page').props.style)).toMatchObject({ backgroundColor: '#000000', paddingTop: 24, paddingBottom: 16 });
  expect(screen.getByText('STORIES SÉLECTIONNÉES')).toBeTruthy();
  const focused = screen.UNSAFE_getAllByType(FlatList)[0]!.props.data[0].story;
  expect(focused.id).toBe('story-3');
  fireEvent.press(screen.getAllByTestId('stories-gallery-card-story-3')[0]!);
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/stories', params: { id: 'story-3' } });
  expect(within(screen.getByTestId('stories-gallery-new')).getByText('NOUVEAU !')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Abonnez-moi' }));
  expect(router.push).toHaveBeenLastCalledWith('/sign-in');
  fireEvent.press(screen.getByTestId('stories-gallery-back'));
  expect(router.back).toHaveBeenCalled();
});

it('loads more archive cards without fetching mock content and offers return-to-top after scrolling', async () => {
  render(wrap(<StoriesScreen />));
  const list = screen.UNSAFE_getAllByType(FlatList)[0]!;
  const count = () => list.props.data.filter((item: { kind: string }) => item.kind === 'archive').length;
  expect(count()).toBe(3);
  fireEvent.press(screen.getByRole('button', { name: 'VOIR PLUS DE STORIES' }));
  expect(count()).toBe(4);
  expect(screen.queryByText('VOIR PLUS DE STORIES')).toBeNull();
  fireEvent.scroll(screen.getByTestId('stories-gallery-list'), { nativeEvent: { contentOffset: { x: 0, y: 700 }, contentSize: { width: 360, height: 2500 }, layoutMeasurement: { width: 360, height: 640 } } });
  expect(screen.getByRole('button', { name: 'Remonter en haut' })).toBeTruthy();
});

it('annonce l’échec avec un bouton Réessayer (une liste vide n’a pas de geste à découvrir)', async () => {
  const refetch = jest.fn();
  mockStoriesOverride = { data: [], refetch, isPending: false, isError: true, isRefetching: false };
  render(wrap(<StoriesScreen />));
  expect(screen.getByText('Impossible de charger les stories pour le moment.')).toBeTruthy();
  fireEvent.press(screen.getByTestId('stories-gallery-retry'));
  expect(refetch).toHaveBeenCalled();
});

it('nomme le bloc d’alertes pour ce qu’il est, pas « les dernières stories »', async () => {
  render(wrap(<StoriesScreen />));
  expect(screen.getByText('NE MANQUEZ AUCUNE STORY')).toBeTruthy();
  expect(screen.queryByText('LES DERNIÈRES STORIES')).toBeNull();
});
