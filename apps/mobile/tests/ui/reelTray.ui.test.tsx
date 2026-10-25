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
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { SessionProvider } from '../../src/state/session';
import { ReelCard } from '../../src/features/social/ReelCard';
import type { LinkedProduct } from '../../src/api/linkedProduct';
import type { Reel } from '../../src/api/social';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));

// Le lecteur vidéo n'existe pas en test : on vérifie la mécanique, pas le décodage.
jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: () => null,
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
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PrefsProvider>
        <SessionProvider>
          <I18nProvider>
            <ThemeProvider>{node}</ThemeProvider>
          </I18nProvider>
        </SessionProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

const renderCard = async (over: Partial<Reel> = {}, fill?: { width: number; height: number }) =>
  render(wrap(
    <ReelCard reel={reel(over)} active counts={undefined} onOpenComments={jest.fn()} fill={fill} />,
  ));

describe('Reel — tiroir des articles', () => {
  it('un seul bouton, ouvert par défaut, qui annonce son état', async () => {
    await renderCard();
    const toggle = screen.getByTestId('reel-tray-toggle-r1');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
    expect(toggle.props.accessibilityLabel).toBe('Masquer les articles');
    // Le produit est visible dès l'ouverture de la carte (comportement existant).
    expect(screen.getByText('Pantalon large')).toBeTruthy();
  });

  it('bascule vers « Voir les articles » et masque le tiroir sans quitter l’écran', async () => {
    // Plein écran : le tiroir reste monté (il glisse), donc on peut vérifier son état.
    await renderCard({}, { width: 390, height: 844 });
    await fireEvent.press(screen.getByTestId('reel-tray-toggle-r1'));
    const toggle = screen.getByTestId('reel-tray-toggle-r1');
    expect(toggle.props.accessibilityLabel).toBe('Voir les articles');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });

    // Fermé : le tiroir est retiré de l'arbre d'ACCESSIBILITÉ (pas seulement décalé).
    const tray = screen.getByTestId('reel-tray-r1', { includeHiddenElements: true });
    expect(tray.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('reel-tray-r1')).toBeNull();

    // Re-presser ramène l'état ouvert : le bouton est le seul chemin.
    await fireEvent.press(toggle);
    expect(screen.getByTestId('reel-tray-toggle-r1').props.accessibilityState).toMatchObject({ expanded: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('fermé, le tiroir n’est plus rendu du tout dans la liste (rien de caché)', async () => {
    await renderCard();
    expect(screen.getByTestId('reel-tray-r1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reel-tray-toggle-r1'));
    expect(screen.queryByTestId('reel-tray-r1')).toBeNull();
  });

  it('les articles sont un carrousel horizontal, une carte par produit', async () => {
    await renderCard({
      product: product('p1', 'Pantalon large'),
      products: [product('p1', 'Pantalon large'), product('p2', 'Veste simili cuir')],
    });
    const scroll = screen.getByTestId('reel-tray-scroll-r1');
    expect(scroll.props.horizontal).toBe(true);
    expect(screen.getByTestId('reel-product-r1-p1')).toBeTruthy();
    expect(screen.getByTestId('reel-product-r1-p2')).toBeTruthy();
  });

  it('sans produit : aucun bouton, aucun tiroir', async () => {
    await renderCard({ product: null, products: [] });
    expect(screen.queryByTestId('reel-tray-toggle-r1')).toBeNull();
    expect(screen.queryByTestId('reel-tray-r1')).toBeNull();
  });
});
