/**
 * Z-Reactions sur les stories (12/11/2026) :
 *  • l'état EXISTANT et le compteur sont chargés (`/social/counts` + `mine`) ;
 *  • double-tap dans la bande centrale = J'adore (cœurs) ;
 *  • les bandes gauche/droite gardent leur toucher simple sans retard.
 */
import { View } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { StoryViewer } from '../../src/features/social/StoryViewer';
import type { StoryItem } from '../../src/api/sections';

const mockSend = jest.fn();
const mockEngagement = jest.fn();
jest.mock('../../src/api/social', () => ({
  sendInteraction: (...args: unknown[]) => mockSend(...args),
  fetchSocialEngagement: (...args: unknown[]) => mockEngagement(...args),
}));
jest.mock('../../src/state/session', () => ({ useSession: () => ({ status: 'signedIn', account: { id: 'story-owner' } }) }));
jest.mock('../../src/session/session', () => ({ useSessionId: () => 'story-session', getSessionId: async () => 'story-session' }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../src/features/shopping/LinkedProductCard', () => ({ LinkedProductCard: () => null }));
jest.mock('expo-video', () => ({ useVideoPlayer: () => null, VideoView: 'VideoView' }));
jest.mock('../../src/design/motion', () => ({
  ...jest.requireActual('../../src/design/motion'),
  useReduceMotion: () => true,
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function story(id: string): StoryItem {
  return {
    id, product: null, mediaType: 'IMAGE', mediaUrl: `/media/${id}.jpg`, title: `Story ${id}`, description: '',
    cta: '', targetUrl: '', productId: '', arrivalId: '', promotionId: '', publishAt: '', expiresAt: '', priority: 0, status: 'PUBLISHED',
  };
}

async function mount() {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <View style={{ flex: 1 }}>
              <StoryViewer stories={[story('s1'), story('s2')]} visible onClose={jest.fn()} />
            </View>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {});
}

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({});
  mockEngagement.mockReset().mockResolvedValue({
    counts: { s1: { likes: 3, loves: 2, comments: 0, views: 9, shares: 0 }, s2: { likes: 0, loves: 0, comments: 0, views: 0, shares: 0 } },
    mine: { s1: 'like' },
  });
});

it('opens on the viewer’s existing reaction with the positive count', async () => {
  await mount();
  expect(mockEngagement).toHaveBeenCalledWith(['s1', 's2']);
  await waitFor(() => expect(screen.getByTestId('story-reaction').props.accessibilityState).toMatchObject({ selected: true }));
  expect(screen.getByText('5')).toBeTruthy();
});

it('double-tap in the centre band loves the story', async () => {
  mockSend.mockResolvedValue({ reaction: 'love', loved: true, liked: false, disliked: false, likesCount: 2, reactionsCount: 6 });
  await mount();
  const centre = screen.getByTestId('story-center-zone');
  fireEvent.press(centre, { nativeEvent: { locationX: 60, locationY: 300 } });
  fireEvent.press(centre, { nativeEvent: { locationX: 60, locationY: 300 } });
  await waitFor(() =>
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'reaction', reaction: 'love', targetId: 's1' })),
  );
});
