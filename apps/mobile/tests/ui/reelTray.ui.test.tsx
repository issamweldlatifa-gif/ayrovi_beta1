/**
 * Reel — tiroir « articles » (24/10/2026).
 *
 *  • un Reel avec un produit : un SEUL bouton, ouvert par défaut, qui bascule
 *    « Masquer les articles » ⇄ « Voir les articles » sans changer d'écran ;
 *  • les articles sont dans un carrousel horizontal (une carte par produit) ;
 *  • un Reel sans produit : aucun bouton (pas de porte qui n'ouvre rien) ;
 *  • ouvrir/fermer ne démonte pas le lecteur : la vidéo ne repart pas de zéro.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { REEL_FOLLOW_SURFACE } from '../../src/design/tokens.mobile';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { SessionProvider } from '../../src/state/session';
import * as session from '../../src/state/session';
import { fetchPublisherFollow, followPublisher } from '../../src/api/publisherFollow';

jest.mock('../../src/api/publisherFollow', () => ({ fetchPublisherFollow: jest.fn(), followPublisher: jest.fn() }));
import { useVideoPlayer } from 'expo-video';
import { ReelCard } from '../../src/features/social/ReelCard';
import type { LinkedProduct } from '../../src/api/linkedProduct';
import type { Reel } from '../../src/api/social';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));

// Le lecteur vidéo n'existe pas en test : on vérifie la mécanique, pas le décodage.
jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: jest.fn(() => null),
}));

const product = (id: string, name: string): LinkedProduct => ({
  id, name, image: '/m/x.jpg', price: 89, currency: 'TND', stockStatus: 'AVAILABLE', available: true,
});

const reel = (over: Partial<Reel> = {}): Reel => ({
  id: 'r1', title: 'Essai', channelId: 'c', description: '', videoUrl: '/v/r1.mp4',
  durationSeconds: 12, publishAt: '2026-10-24T00:00:00.000Z', views: 0, likes: 0,
  product: product('p1', 'Pantalon large'), posterUrl: '', ...over,
});

// Métriques fixes : la géométrie du tiroir dépend de la zone sûre.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  return (
    <QueryClientProvider client={client}>
    <SafeAreaProvider initialMetrics={METRICS}>
      <PrefsProvider>
        <SessionProvider>
          <I18nProvider>
            <ThemeProvider>{node}</ThemeProvider>
          </I18nProvider>
        </SessionProvider>
      </PrefsProvider>
    </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const renderCard = (over: Partial<Reel> = {}, fill?: { width: number; height: number }) =>
  render(wrap(
    <ReelCard reel={reel(over)} active counts={undefined} onOpenComments={jest.fn()} fill={fill} />,
  ));

describe('Reel — tiroir des articles', () => {
  it('colle la légende au-dessus du tiroir sans carte, avec « Voir plus » inline seulement si elle déborde', () => {
    const description = 'Une longue description publiée pour accompagner cette vidéo.';
    renderCard({ description }, { width: 390, height: 844 });
    const caption = screen.getByTestId('reel-media-caption');
    expect(StyleSheet.flatten(caption.props.style)?.backgroundColor).toBeUndefined();
    expect(screen.queryByText('Essai')).toBeNull();
    expect(screen.getByText(description).props.numberOfLines).toBe(1);
    expect(screen.queryByText('Voir plus')).toBeNull();
    fireEvent(screen.getByTestId('reel-measure-caption', { includeHiddenElements: true }), 'textLayout', {
      nativeEvent: { lines: [{ text: 'Une longue description publiée' }, { text: 'pour accompagner cette vidéo.' }] },
    });
    fireEvent.press(screen.getByRole('button', { name: `${description} — Voir plus` }));
    expect(screen.getByText(description).props.numberOfLines).toBeUndefined();
    const less = screen.getByRole('button', { name: 'Voir moins' });
    expect(less.props.accessibilityState.expanded).toBe(true);
    fireEvent.press(less);
    expect(screen.getByText(description).props.numberOfLines).toBe(1);
  });

  it('montre la description française du Reel Chaussures sans titre séparé', () => {
    renderCard({ id: 'reel_owner_shoes_v1', title: 'أحذية' }, { width: 390, height: 844 });
    expect(screen.queryByText('Chaussures')).toBeNull();
    expect(screen.getByText('Des baskets pour les petits pas du quotidien.')).toBeTruthy();
    expect(screen.queryByText('أحذية')).toBeNull();
  });

  it('ne montre pas « Voir plus » pour un titre court sans description', () => {
    renderCard({}, { width: 390, height: 844 });
    fireEvent(screen.getByTestId('reel-measure-caption', { includeHiddenElements: true }), 'textLayout', { nativeEvent: { lines: [{ text: 'Essai' }] } });
    expect(screen.getByText('Essai')).toBeTruthy();
    expect(screen.queryByText('Voir plus')).toBeNull();
  });

  it('ne laisse aucune légende vide sans titre ni description', () => {
    renderCard({ title: ' ', description: '' }, { width: 390, height: 844 });
    expect(screen.queryByTestId('reel-media-caption')).toBeNull();
  });

  it('un seul bouton, ouvert par défaut, qui annonce son état', () => {
    renderCard();
    const toggle = screen.getByTestId('reel-tray-toggle-r1');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
    expect(toggle.props.accessibilityLabel).toBe('Masquer les articles');
    // Le produit est visible dès l'ouverture de la carte (comportement existant).
    expect(screen.getByText('Pantalon large')).toBeTruthy();
  });

  it('bascule vers « Voir les articles » et masque le tiroir sans quitter l’écran', () => {
    // Plein écran : le tiroir reste monté (il glisse), donc on peut vérifier son état.
    renderCard({}, { width: 390, height: 844 });
    fireEvent.press(screen.getByTestId('reel-tray-toggle-r1'));
    const toggle = screen.getByTestId('reel-tray-toggle-r1');
    expect(toggle.props.accessibilityLabel).toBe('Voir les articles');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });

    // Fermé : le tiroir est retiré de l'arbre d'ACCESSIBILITÉ (pas seulement décalé).
    const tray = screen.getByTestId('reel-tray-r1', { includeHiddenElements: true });
    expect(tray.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('reel-tray-r1')).toBeNull();

    // Re-presser ramène l'état ouvert : le bouton est le seul chemin.
    fireEvent.press(toggle);
    expect(screen.getByTestId('reel-tray-toggle-r1').props.accessibilityState).toMatchObject({ expanded: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('« Masquer » fait réellement DESCENDRE les cartes, et la pastille reste au-dessus (régression 12/11)', () => {
    // Le ressort natif n'avance pas sous jest : on le remplace par un ressort
    // qui arrive tout de suite à sa cible, sur le MÊME Animated.Value.
    const spy = jest.spyOn(Animated, 'spring').mockImplementation(((value: Animated.Value, config: { toValue: number }) => ({
      start: (done?: (result: { finished: boolean }) => void) => { value.setValue(config.toValue); done?.({ finished: true }); },
      stop: () => undefined,
      reset: () => undefined,
    })) as unknown as typeof Animated.spring);
    try {
      renderCard({}, { width: 390, height: 844 });
      const translateY = () => {
        const tray = screen.getByTestId('reel-tray-r1', { includeHiddenElements: true });
        const style = StyleSheet.flatten(tray.props.style) as { transform?: Array<{ translateY?: unknown }> };
        return style.transform?.find((entry) => 'translateY' in entry)?.translateY;
      };
      // Une View simple garderait l'objet d'interpolation : la carte ne bougerait jamais.
      expect(translateY()).toBe(0);
      fireEvent.press(screen.getByTestId('reel-tray-toggle-r1'));
      expect(screen.getByText('Essai')).toBeTruthy();
      const closed = translateY();
      expect(typeof closed).toBe('number');
      // Fermé : la carte sort entièrement par le bas (hauteur carte + vide + zone sûre).
      expect(closed as number).toBeGreaterThan(150);
      fireEvent.press(screen.getByTestId('reel-tray-toggle-r1'));
      expect(translateY()).toBe(0);
      expect(screen.getByText('Essai')).toBeTruthy();

      // Ordre de dessin : les cartes AVANT la pastille (sinon elles la recouvrent).
      const json = JSON.stringify(screen.toJSON());
      expect(json.indexOf('reel-tray-r1')).toBeGreaterThan(-1);
      expect(json.indexOf('reel-tray-r1')).toBeLessThan(json.indexOf('reel-tray-toggle-r1'));
      expect(json.indexOf('reel-tray-r1')).toBeLessThan(json.indexOf('reel-rail-sound-r1'));
    } finally {
      spy.mockRestore();
    }
  });

  it('fermé, le tiroir n’est plus rendu du tout dans la liste (rien de caché)', () => {
    renderCard();
    expect(screen.getByTestId('reel-tray-r1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('reel-tray-toggle-r1'));
    expect(screen.queryByTestId('reel-tray-r1')).toBeNull();
  });

  it('les articles sont un carrousel horizontal, une carte par produit', () => {
    renderCard({
      product: product('p1', 'Pantalon large'),
      products: [product('p1', 'Pantalon large'), product('p2', 'Veste simili cuir')],
    });
    const scroll = screen.getByTestId('reel-tray-scroll-r1');
    expect(scroll.props.horizontal).toBe(true);
    expect(screen.getByTestId('reel-product-r1-p1')).toBeTruthy();
    expect(screen.getByTestId('reel-product-r1-p2')).toBeTruthy();
  });

  it('sans produit : aucun bouton, aucun tiroir', () => {
    renderCard({ product: null, products: [] });
    expect(screen.queryByTestId('reel-tray-toggle-r1')).toBeNull();
    expect(screen.queryByTestId('reel-tray-r1')).toBeNull();
  });
});


it('allocates no video player for offscreen cards; mounts playback only when active', () => {
  const usePlayer = useVideoPlayer as jest.Mock;
  usePlayer.mockClear();
  const props = { reel: reel(), onOpenComments: jest.fn() };
  const card = render(wrap(<ReelCard {...props} active={false} />));
  expect(usePlayer).not.toHaveBeenCalled();
  card.rerender(wrap(<ReelCard {...props} active />));
  expect(usePlayer).toHaveBeenCalled();
  const calls = usePlayer.mock.calls.length;
  // A stable null-source player is created by the active child, then loaded asynchronously.
  expect(usePlayer.mock.calls[0][0]).toBeNull();
  card.rerender(wrap(<ReelCard {...props} active={false} />));
  expect(usePlayer).toHaveBeenCalledTimes(calls);
});

it('does not re-render a stable player when only equal parent objects change', () => {
  const item = reel();
  const onOpenComments = jest.fn();
  const node = (likes: number) => wrap(<ReelCard reel={item} active
    onOpenComments={onOpenComments} fill={{ width: 390, height: 844 }}
    counts={{ likes, comments: 0, views: 0, shares: 0 }} />);
  const card = render(node(1));
  const renders = (useVideoPlayer as jest.Mock).mock.calls.length;
  card.rerender(node(1));
  expect((useVideoPlayer as jest.Mock).mock.calls.length).toBe(renders);
  card.rerender(node(2));
  expect((useVideoPlayer as jest.Mock).mock.calls.length).toBeGreaterThan(renders);
});

it('confirme le suivi en bas seulement après une écriture serveur acceptée', async () => {
  const sessionSpy = jest.spyOn(session, 'useSession').mockReturnValue({ status: 'signedIn', account: { id: 'buyer' } } as ReturnType<typeof session.useSession>);
  jest.mocked(fetchPublisherFollow).mockResolvedValue({ following: false });
  jest.mocked(followPublisher).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ following: true });
  try {
    renderCard({ channelId: 'real-publisher' }, { width: 390, height: 844 });
    const follow = await screen.findByRole('button', { name: 'Suivre' });
    expect(StyleSheet.flatten(follow.props.style).borderWidth ?? 0).toBe(0);
    expect(screen.getByText('· Suivre')).toBeTruthy();
    fireEvent.press(screen.getByTestId('reel-follow'));
    await screen.findByRole('alert');
    expect(screen.queryByTestId('reel-follow-confirmation')).toBeNull();
    fireEvent.press(screen.getByTestId('reel-follow'));
    const banner = await screen.findByTestId('reel-follow-confirmation');
    expect(StyleSheet.flatten(banner.props.style)).toMatchObject({ bottom: 0, start: 0, end: 0, backgroundColor: REEL_FOLLOW_SURFACE.background });
    expect(screen.getByText('Vous suivez cette marque ! Retrouvez ses nouveautés dans ses publications et ses Reels.')).toBeTruthy();
    expect(followPublisher).toHaveBeenLastCalledWith('real-publisher', true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Suivi' })).toBeTruthy());
  } finally {
    sessionSpy.mockRestore();
  }
});
