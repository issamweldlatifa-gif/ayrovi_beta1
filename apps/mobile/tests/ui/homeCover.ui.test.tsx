/**
 * « Cover » d'accueil — le nouveau bloc d'entrée (remplace « à la une »).
 *
 *  • média plein écran (image ou vidéo), grand texte posé SUR le média ;
 *  • bouton contour TRANSPARENT par-dessus, qui ouvre la page de l'application ;
 *  • bouton pause : arrête le défilement (et la vidéo) ;
 *  • rien ne s'affiche si le CRM est masqué ou sans média.
 */
import { AppState, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { HomeCover } from '../../src/features/home/HomeCover';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import type { HomeCover as HomeCoverData } from '../../src/api/public';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: () => true,
}));

// expo-video : le contrôle testé ici est la PRÉSENCE du lecteur, pas son rendu natif.
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => jest.fn() }),
  VideoView: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const INTERVAL_MS = 4000;

function coverData(overrides: Partial<HomeCoverData> = {}): HomeCoverData {
  return {
    enabled: true,
    title: 'NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE',
    ctaLabel: 'Je découvre',
    destination: 'promotions',
    autoplayIntervalMs: INTERVAL_MS,
    slides: [
      { id: 's1', type: 'image', url: '/uploads/drop.jpg', poster: '', alt: 'Drop' },
      { id: 's2', type: 'video', url: '/uploads/teaser.mp4', poster: '/uploads/teaser.jpg', alt: 'Teaser' },
    ],
    ...overrides,
  };
}

const mockCover: { data: HomeCoverData | null; isPending: boolean } = { data: null, isPending: false };
jest.mock('../../src/api/hooks', () => ({
  useHomeCover: () => mockCover,
}));

async function renderCover() {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <HomeCover />
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
  await act(async () => {});
  return view;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (AppState as unknown as { currentState: string }).currentState = 'active';
  mockCover.data = coverData();
  mockCover.isPending = false;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('HomeCover — le nouveau bloc d’entrée', () => {
  it('pose le grand texte et le bouton SUR le média, sans libellé au-dessus', async () => {
    await renderCover();
    expect(screen.getByTestId('home-cover')).toBeTruthy();
    expect(screen.getByTestId('home-cover-title')).toBeTruthy();
    expect(screen.getByText('NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE')).toBeTruthy();
    // Plein écran : marge négative sur la section, média sans marge interne.
    const section = StyleSheet.flatten(screen.getByTestId('home-cover').props.style);
    expect(typeof section.marginHorizontal).toBe('number');
    expect(section.marginHorizontal).toBeLessThan(0);
    // Le bouton est un contour TRANSPARENT (aucun fond plein).
    const cta = StyleSheet.flatten(screen.getByTestId('home-cover-cta').props.style);
    expect(cta.borderWidth).toBeGreaterThan(0);
    expect(cta.backgroundColor).toBeUndefined();
    // Plus d'ancien libellé « À la une » ni d'ancien bouton bloc sous l'image.
    expect(screen.queryByText('À la une')).toBeNull();
    expect(screen.queryByTestId('home-featured-cta')).toBeNull();
  });

  it('le bouton contour ouvre la destination choisie dans le CRM', async () => {
    await renderCover();
    fireEvent.press(screen.getByTestId('home-cover-cta'));
    expect(router.push).toHaveBeenCalledWith('/promotions');
  });

  it('défile un média au suivant à la cadence du CRM, sans revenir au début', async () => {
    await renderCover();
    expect(screen.getByTestId('home-cover-list').props.accessibilityLabel).toBe('1/2');
    act(() => { jest.advanceTimersByTime(INTERVAL_MS); });
    expect(screen.getByTestId('home-cover-list').props.accessibilityLabel).toBe('2/2');
    act(() => { jest.advanceTimersByTime(INTERVAL_MS * 3); });
    expect(screen.getByTestId('home-cover-list').props.accessibilityLabel).toBe('2/2');
  });

  it('la pause arrête le défilement, et la reprend', async () => {
    await renderCover();
    fireEvent.press(screen.getByTestId('home-cover-pause'));
    act(() => { jest.advanceTimersByTime(INTERVAL_MS * 3); });
    expect(screen.getByTestId('home-cover-list').props.accessibilityLabel).toBe('1/2');
    fireEvent.press(screen.getByTestId('home-cover-pause'));
    act(() => { jest.advanceTimersByTime(INTERVAL_MS); });
    expect(screen.getByTestId('home-cover-list').props.accessibilityLabel).toBe('2/2');
  });

  it('la vidéo est rendue en lecteur muet sur sa slide active', async () => {
    await renderCover();
    act(() => { jest.advanceTimersByTime(INTERVAL_MS); });
    // Slide 2 = vidéo : le lecteur (muetté, boucle) est monté pour cette slide.
    expect(screen.getByTestId('home-cover-video-s2')).toBeTruthy();
    expect(screen.getByTestId('home-cover-image-s1')).toBeTruthy();
  });

  it('masquée ou sans média : rien, jamais un bloc vide', async () => {
    mockCover.data = coverData({ enabled: false });
    await renderCover();
    // Le module reste exploitable en mémoire, mais l'écran décide d'afficher ou non
    // via la donnée publique : ici `enabled:false` est déjà filtré côté serveur,
    // l'application s'en remet à la liste de slides et au réglage reçu.
    expect(screen.queryByTestId('home-cover')).toBeNull();
  });

  it('chargement : rien non plus (jamais de trou ni de squelette mensonger)', async () => {
    mockCover.isPending = true;
    await renderCover();
    expect(screen.queryByTestId('home-cover')).toBeNull();
  });
});
