/**
 * Feuille des commentaires d'un Reel — barre « En réponse à … » (référence
 * 10/11, 20–24 s) et menu de tri, rendus réels.
 */
import { View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

const mockSend = jest.fn();
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_reel_test' }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedIn', account: { id: 'acc_1' } }) }));
jest.mock('@/features/publications/PublicationAuthSheet', () => ({ PublicationAuthSheet: () => null }));
jest.mock('@/api/social', () => ({
  fetchComments: jest.fn(async () => [
    { id: 'c1', author: 'injcctxoxo', text: 'yeah', createdAt: '2026-11-04T10:00:00Z', parentId: null, likesCount: 1, myReaction: null },
    { id: 'c2', author: '8e40001', text: 'nice', createdAt: '2026-11-09T10:00:00Z', parentId: null, likesCount: 0, myReaction: null },
    { id: 'r1', author: 'zed', text: 'agreed', createdAt: '2026-11-10T10:00:00Z', parentId: 'c1', likesCount: 0, myReaction: null },
  ]),
  sendInteraction: (...args: unknown[]) => mockSend(...args),
}));

import { ReelCommentsModal } from '../../src/features/social/ReelCommentsModal';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <PrefsProvider><I18nProvider><ThemeProvider>
          <View style={{ flex: 1 }}>
            <ReelCommentsModal reel={{ id: 'reel_1' } as never} onClose={jest.fn()} />
          </View>
        </ThemeProvider></I18nProvider></PrefsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  await screen.findByText('nice');
}

it('Répondre ouvre « Réponses » (parent en tête) avec la barre ; ✕ retire la barre sans quitter la vue', async () => {
  await mount();
  expect(screen.queryByTestId('reel-reply-bar')).toBeNull();
  fireEvent.press(screen.getAllByLabelText(/^(Répondre|رد)$/)[0]);
  expect(screen.getByTestId('reel-reply-bar')).toBeTruthy();
  expect(screen.getAllByText('injcctxoxo').length).toBeGreaterThan(0);
  // Vue « Réponses » : le parent et sa réponse, pas l'autre commentaire.
  expect(screen.getByText('yeah')).toBeTruthy();
  expect(screen.getByText('agreed')).toBeTruthy();
  expect(screen.queryByText('nice')).toBeNull();
  fireEvent.press(screen.getByTestId('reel-reply-cancel'));
  expect(screen.queryByTestId('reel-reply-bar')).toBeNull();
  expect(screen.queryByText('nice')).toBeNull();
});

it('le tri par défaut est « populaires » (le plus aimé en tête)', async () => {
  await mount();
  const texts = screen.getAllByText(/^(yeah|nice|agreed)$/).map((node) => node.props.children);
  expect(texts[0]).toBe('yeah');
  expect(screen.getByTestId('comment-sort-button')).toBeTruthy();
});
