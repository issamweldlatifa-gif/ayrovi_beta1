import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { StoriesSection } from '@/features/home/StoriesSection';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { CARD_ASPECT } from '@/features/home/heroCarouselLogic';

const mockStories = { data: [] as any[], isError: false };
const mockSettings = { data: null as any, isError: false };
jest.mock('@/api/hooks', () => ({ useStories: () => mockStories, useStoriesShowcase: () => mockSettings }));
jest.mock('@/design/appImage', () => ({ AppImage: ({ accessibilityLabel }: any) => {
  const { View } = require('react-native'); return <View accessibilityLabel={accessibilityLabel} />;
} }));
const block = { title: 'Stories sur ZAYROVI', subtitle: 'Le meilleur de la semaine', titleAr: 'قصص', ctaLabel: 'Explorez toutes les stories', cardCount: 7, enabled: true };
const card = (i: number) => ({ id: `s${i}`, mediaType: 'IMAGE', mediaUrl: `/media/stories/${i}.jpg`, title: `Card ${i}`, description: 'Description' });
async function mount() {
  const result = render(<PrefsProvider><I18nProvider><ThemeProvider><StoriesSection /></ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {}); return result;
}
beforeEach(() => { mockStories.data = []; mockStories.isError = false; mockSettings.data = block; mockSettings.isError = false; });
describe('official editorial Stories gallery', () => {
  it('shows nothing for empty, disabled or unavailable CMS content', async () => {
    await mount(); expect(screen.queryByTestId('home-stories')).toBeNull();
    mockStories.data = [card(1)]; mockSettings.data = { ...block, enabled: false };
    await mount(); expect(screen.queryAllByTestId('home-stories')).toHaveLength(0);
  });
  it('uses Hero card geometry and keeps Explore non-interactive', async () => {
    mockStories.data = [card(1), card(2)];
    await mount();
    expect(screen.getByText(block.title)).toBeTruthy();
    expect(screen.getByText(block.subtitle)).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('editorial-story-s1').props.style).aspectRatio).toBe(CARD_ASPECT);
    expect(screen.getByTestId('stories-explore-placeholder').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('honours the CMS card limit and renders text over each image', async () => {
    mockSettings.data = { ...block, cardCount: 1 }; mockStories.data = [card(1), card(2)];
    await mount();
    expect(screen.getByTestId('editorial-story-s1')).toBeTruthy();
    expect(screen.queryByTestId('editorial-story-s2')).toBeNull();
    expect(screen.getByText('Card 1')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
  });
});
