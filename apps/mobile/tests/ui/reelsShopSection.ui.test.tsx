import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../../src/state/session';
/**
 * Section « Reels • Shop » de l'accueil et logo de la marque.
 *  • rien ne s'affiche sans Reel publié (pas de bloc vide) ;
 *  • une vignette par Reel, ratio 9:16 ;
 *  • toucher une vignette ouvre la visionneuse plein écran à ce Reel ;
 *  • le logo affiche « Reels » puis « Shop ».
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { ReelsShopSection } from '../../src/features/home/ReelsShopSection';
import { ReelsShopMark } from '../../src/features/reels/ReelsShopMark';
import { MEDIA_RATIO } from '../../src/design/tokens.mobile';

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: {
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn(),
  },
}));

jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: () => null,
}));
jest.mock('../../src/features/reels/useReelPreviewActivity', () => ({
  useReelPreviewActivity: () => ({ visible: mockVisible, autoplay: true }),
}));

let mockVisible = true;
const mockUseReels = jest.fn();
const mockReels: { data: unknown } = { data: undefined };
jest.mock('../../src/api/hooks', () => ({
  useReels: (enabled: boolean) => { mockUseReels(enabled); return mockReels; },
}));

function wrap(node: React.ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <SessionProvider>
          <PrefsProvider>
            <I18nProvider>
              <ThemeProvider>{node}</ThemeProvider>
            </I18nProvider>
          </PrefsProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const reel = (id: string, title = '') => ({
  id,
  title,
  channelId: 'c',
  description: '',
  videoUrl: `/v/${id}.mp4`,
  durationSeconds: 12,
  publishAt: '2026-10-01T00:00:00Z',
  views: 0,
  likes: 0,
});

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  mockReels.data = undefined;
  mockVisible = true;
  mockUseReels.mockClear();
});

describe('section Reels • Shop (accueil)', () => {
  it('ne rend rien sans Reel publié', () => {
    mockReels.data = [];
    render(wrap(<ReelsShopSection />));
    expect(screen.queryByTestId('home-reels-shop')).toBeNull();
  });

  it('une vignette par Reel, au ratio 9:16', () => {
    mockReels.data = [reel('r1', 'Nouveauté'), reel('r2')];
    render(wrap(<ReelsShopSection />));
    expect(screen.getByTestId('home-reels-shop')).toBeTruthy();
    const tile = screen.getByTestId('home-reel-tile-r1');
    const style = StyleSheet.flatten(tile.props.style);
    expect(style.height / style.width).toBeCloseTo(1 / MEDIA_RATIO.reel, 1);
    expect(screen.getByTestId('home-reel-tile-r2')).toBeTruthy();
  });

  it('conserve une couverture uniquement en repli derrière la vraie vidéo', () => {
    mockReels.data = [
      { ...reel('r1'), posterUrl: '/uploads/cover-r1.jpg' },
      reel('r2'),
    ];
    render(wrap(<ReelsShopSection />));
    const withPoster = screen.getByTestId('home-reel-tile-r1');
    const without = screen.getByTestId('home-reel-tile-r2');
    expect(
      withPoster.findAll((n: any) =>
        n.props?.source?.uri?.includes('cover-r1.jpg')
      ).length
    ).toBeGreaterThan(0);
    expect(
      without.findAll((n: any) => n.props?.source?.uri?.includes('cover-'))
    ).toHaveLength(0);
  });

  it('toucher une vignette ouvre la visionneuse à ce Reel', () => {
    mockReels.data = [reel('r1'), reel('r2')];
    render(wrap(<ReelsShopSection />));
    fireEvent.press(screen.getByTestId('home-reel-tile-r2'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/reels-viewer',
      params: { id: 'r2' },
    });
  });
});

describe('logo Reels • Shop', () => {
  it('affiche « Reels » et « Shop » avec le libellé d’accessibilité de la marque', () => {
    render(wrap(<ReelsShopMark />));
    expect(screen.getByText('Reels')).toBeTruthy();
    expect(screen.getByText('Shop')).toBeTruthy();
    expect(screen.getByLabelText('Reels, Shop')).toBeTruthy();
  });
});

it('renders official publisher outside the video, a small media mark and a working options sheet', () => {
  mockReels.data = [reel('r1', 'Do not overlay this title')];
  render(wrap(<ReelsShopSection />));
  expect(screen.getByText('Zayrovi Team')).toBeTruthy();
  expect(screen.queryByText('Do not overlay this title')).toBeNull();
  fireEvent.press(screen.getByTestId('home-reel-options-r1'));
  expect(screen.getByTestId('reel-options')).toBeTruthy();
  expect(screen.getByText('Masquer sur cet appareil')).toBeTruthy();
  fireEvent.press(screen.getByText('+ Suivre'));
  expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
});


it('defers the below-fold Reel request, but keeps a measurable anchor for scrolling', () => {
  mockVisible = false;
  const section = render(wrap(<ReelsShopSection />));
  expect(mockUseReels).toHaveBeenLastCalledWith(false);
  expect(section.toJSON()).not.toBeNull();
  mockVisible = true;
  section.rerender(wrap(<ReelsShopSection />));
  expect(mockUseReels).toHaveBeenLastCalledWith(true);
});
