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
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));

const mockReels: { data: unknown } = { data: undefined };
jest.mock('../../src/api/hooks', () => ({
  useReels: () => mockReels,
}));

function wrap(node: React.ReactNode) {
  return (
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>{node}</ThemeProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}

const reel = (id: string, title = '') => ({
  id, title, channelId: 'c', description: '', videoUrl: `/v/${id}.mp4`,
  durationSeconds: 12, publishAt: '2026-10-01T00:00:00Z', views: 0, likes: 0,
});

beforeEach(async () => {
  (router.push as jest.Mock).mockClear();
  mockReels.data = undefined;
});

describe('section Reels • Shop (accueil)', () => {
  it('ne rend rien sans Reel publié', async () => {
    mockReels.data = [];
    await render(wrap(<ReelsShopSection />));
    expect(screen.queryByTestId('home-reels-shop')).toBeNull();
  });

  it('une vignette par Reel, au ratio 9:16', async () => {
    mockReels.data = [reel('r1', 'Nouveauté'), reel('r2')];
    await render(wrap(<ReelsShopSection />));
    expect(screen.getByTestId('home-reels-shop')).toBeTruthy();
    const tile = screen.getByTestId('home-reel-tile-r1');
    const style = StyleSheet.flatten(tile.props.style);
    expect(style.height / style.width).toBeCloseTo(1 / MEDIA_RATIO.reel, 1);
    expect(screen.getByTestId('home-reel-tile-r2')).toBeTruthy();
  });

  it('affiche la couverture du Reel sur la vignette quand elle existe', async () => {
    mockReels.data = [{ ...reel('r1'), posterUrl: '/uploads/cover-r1.jpg' }, reel('r2')];
    await render(wrap(<ReelsShopSection />));
    const withPoster = screen.getByTestId('home-reel-tile-r1');
    const without = screen.getByTestId('home-reel-tile-r2');
    // Test Renderer expose expo-image en hôte `ViewManagerAdapter_ExpoImage`
    // dont la prop `source` est un tableau de sources.
    const sourceUris = (node: any): string[] => {
      const source = node.props?.source;
      if (!source) return [];
      return (Array.isArray(source) ? source : [source]).map((entry: any) => entry?.uri).filter(Boolean);
    };
    expect(withPoster.queryAll((n: any) => sourceUris(n).some((uri) => uri.includes('cover-r1.jpg'))).length).toBeGreaterThan(0);
    expect(without.queryAll((n: any) => sourceUris(n).some((uri) => uri.includes('cover-')))).toHaveLength(0);
  });

  it('toucher une vignette ouvre la visionneuse à ce Reel', async () => {
    mockReels.data = [reel('r1'), reel('r2')];
    await render(wrap(<ReelsShopSection />));
    await fireEvent.press(screen.getByTestId('home-reel-tile-r2'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/reels-viewer', params: { id: 'r2' } });
  });
});

describe('logo Reels • Shop', () => {
  it('affiche « Reels » et « Shop » avec le libellé d’accessibilité de la marque', async () => {
    await render(wrap(<ReelsShopMark />));
    expect(screen.getByText('Reels')).toBeTruthy();
    expect(screen.getByText('Shop')).toBeTruthy();
    expect(screen.getByLabelText('Reels, Shop')).toBeTruthy();
  });
});
