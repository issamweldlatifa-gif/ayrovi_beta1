/**
 * Carrousel Hero — tests de composant (RNTL + jest-expo).
 *
 * Couvre les correctifs du lot « refonte » :
 *  • l'autoplay reprend après un glissement relâché SANS élan ;
 *  • l'autoplay s'arrête à la dernière carte (pas de retour brusque) ;
 *  • l'index suit le défilement (onMomentumScrollEnd) ;
 *  • le CTA est un bouton réel, distinct de la carte.
 */
import { AppState, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { HeroCarousel } from '../../src/features/home/HeroCarousel';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { carouselGeometry } from '../../src/features/home/heroCarouselLogic';
import type { HeroSlide } from '../../src/api/public';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: () => true,
}));

jest.mock('../../src/api/public', () => {
  const actual = jest.requireActual('../../src/api/public');
  return { ...actual, trackHeroEvent: jest.fn() };
});

const INTERVAL_MS = 1000;
const SCREEN_WIDTH = 390; // jest-expo : largeur d'écran par défaut proche d'un téléphone
const { stride } = carouselGeometry(SCREEN_WIDTH);

function slide(id: string, index: number): HeroSlide {
  return {
    id,
    image: `/media/${id}.jpg`,
    title: `Titre ${index + 1}`,
    titleAr: '',
    subtitle: '',
    subtitleAr: '',
    cta: 'Voir',
    ctaAr: '',
    href: `/shop/${id}`,
    destinationType: 'product',
    background: '#112233',
    dominant: '#112233',
  };
}

const SLIDES = [slide('a', 0), slide('b', 1), slide('c', 2)];

function query<T>(data: T) {
  return { isPending: false, isError: false, data } as never;
}

const SETTINGS = {
  enabled: true,
  maxCards: 6,
  autoplay: true,
  autoplayIntervalMs: INTERVAL_MS,
  transitionMs: 0,
  paginationVisible: true,
};

async function renderCarousel(settings = SETTINGS, slides = SLIDES) {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <HeroCarousel
            settings={query(settings)}
            slides={query(slides)}
          />
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
  // Laisse se terminer le chargement asynchrone des préférences (hors act sinon).
  await act(async () => {});
  return view;
}

/** Indice courant lu depuis le libellé de pagination (« Carte N sur T »). */
function currentCard(): number {
  const dots = screen.getByTestId('hero-carousel-dots');
  const label = dots.props.accessibilityLabel as string;
  const match = /(\d+)/.exec(label);
  return match ? Number(match[1]) : NaN;
}

const list = () => screen.getByTestId('hero-carousel-list');

/** Déclenche la mesure réelle de la section (comme le moteur de mise en page). */
function measureSection(width: number) {
  act(() => {
    fireEvent(screen.getByTestId('hero-carousel'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 400 } },
    });
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // jest-expo ne fournit pas un état d'application réel : on le fixe à « actif ».
  (AppState as unknown as { currentState: string }).currentState = 'active';
});

afterEach(() => {
  jest.useRealTimers();
});

describe('autoplay', () => {
  it('avance au fil de l’intervalle', async () => {
    await renderCarousel();
    expect(currentCard()).toBe(1);
    act(() => { jest.advanceTimersByTime(INTERVAL_MS); });
    expect(currentCard()).toBe(2);
  });

  it('reprend après un glissement relâché SANS élan (pause non bloquée)', async () => {
    await renderCarousel();
    fireEvent(list(), 'scrollBeginDrag');
    // Pendant le toucher : aucune avance.
    act(() => { jest.advanceTimersByTime(INTERVAL_MS * 2); });
    expect(currentCard()).toBe(1);

    // Relâché sans vitesse : RN n'envoie pas onMomentumScrollEnd.
    fireEvent(list(), 'scrollEndDrag', {
      nativeEvent: { velocity: { x: 0, y: 0 }, contentOffset: { x: 0, y: 0 } },
    });
    act(() => { jest.advanceTimersByTime(INTERVAL_MS); });
    expect(currentCard()).toBe(2);
  });

  it('s’arrête à la dernière carte, sans revenir à la première', async () => {
    await renderCarousel();
    // Un tick à la fois, comme sur l'appareil (un rendu entre deux tics).
    for (let i = 0; i < 5; i += 1) {
      act(() => { jest.advanceTimersByTime(INTERVAL_MS); });
    }
    expect(currentCard()).toBe(3);
    act(() => { jest.advanceTimersByTime(INTERVAL_MS * 3); });
    expect(currentCard()).toBe(3);
  });

  it('désactivé dans les réglages : aucune avance', async () => {
    await renderCarousel({ ...SETTINGS, autoplay: false });
    act(() => { jest.advanceTimersByTime(INTERVAL_MS * 3); });
    expect(currentCard()).toBe(1);
  });
});

describe('défilement manuel', () => {
  it('l’index suit l’offset à la fin de l’élan (carte centrée)', async () => {
    await renderCarousel({ ...SETTINGS, autoplay: false });
    fireEvent(list(), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: stride, y: 0 } },
    });
    expect(currentCard()).toBe(2);
  });

  it('un offset hors plage est borné à la dernière carte', async () => {
    await renderCarousel({ ...SETTINGS, autoplay: false });
    fireEvent(list(), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: stride * 10, y: 0 } },
    });
    expect(currentCard()).toBe(3);
  });
});

describe('CTA', () => {
  it('le CTA est un bouton réel et ouvre la destination', async () => {
    await renderCarousel({ ...SETTINGS, autoplay: false });
    const cta = screen.getByTestId('hero-card-a-cta');
    expect(cta.props.accessibilityRole).toBe('button');
    fireEvent.press(cta);
    expect(router.push).toHaveBeenCalledWith('/shop/a');
  });

  it('la carte reste cliquable indépendamment du CTA', async () => {
    await renderCarousel({ ...SETTINGS, autoplay: false });
    fireEvent.press(screen.getByTestId('hero-card-a'));
    expect(router.push).toHaveBeenCalledWith('/shop/a');
  });
});

describe('géométrie et fond', () => {
  it('la carte active est centrée : le retrait vient de la largeur MESURÉE, pas de la fenêtre', async () => {
    await renderCarousel();
    measureSection(360);
    const { sideInset } = carouselGeometry(360);
    const padding = StyleSheet.flatten(list().props.contentContainerStyle).paddingHorizontal;
    expect(padding).toBe(sideInset);
  });

  it('getItemLayout inclut le retrait : scrollToIndex vise la carte, pas un décalage', async () => {
    await renderCarousel();
    measureSection(360);
    const { sideInset, stride: measuredStride } = carouselGeometry(360);
    const layout = list().props.getItemLayout(null, 1);
    expect(layout.offset).toBe(sideInset + measuredStride);
  });

  it('les cartes n’ont pas de fond propre : la couleur continue passe derrière les voisines', async () => {
    await renderCarousel();
    const style = StyleSheet.flatten(screen.getByTestId('hero-card-b').props.style);
    expect(style.backgroundColor).toBeUndefined();
  });

  it('le titre est posé SUR le visuel (façon Amazon), dans la même carte', async () => {
    await renderCarousel();
    const card = screen.getByTestId('hero-card-a');
    expect(within(card).getByText('Titre 1')).toBeTruthy();
    expect(within(card).getByTestId('hero-card-a-image')).toBeTruthy();
  });
});
