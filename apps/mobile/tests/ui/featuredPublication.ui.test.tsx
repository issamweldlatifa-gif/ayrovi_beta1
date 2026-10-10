/**
 * « À la une » de l'accueil — pilotée par l'admin.
 *
 *  • la section affiche ce que le serveur renvoie : image, titre, sous-titre, bouton ;
 *  • « Découvrir » ouvre la page Publications de l'APPLICATION ;
 *  • le libellé du bouton vient de l'admin, sinon le texte par défaut ;
 *  • rien ne s'affiche si la section est masquée, sans publication, ou pendant le chargement ;
 *  • une publication sans image garde son titre et son bouton.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FeaturedPublication } from '../../src/features/home/FeaturedPublication';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// Image native simulée : le contrôle testé ici est la présence de l'image, pas son rendu.
jest.mock('../../src/design/appImage', () => ({
  AppImage: ({ accessibilityLabel }: { accessibilityLabel?: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`image:${accessibilityLabel ?? ''}`}</Text>;
  },
}));

const mockFeatured: { data: unknown; isPending: boolean } = { data: undefined, isPending: false };
jest.mock('../../src/api/hooks', () => ({
  useHomeFeatured: () => mockFeatured,
}));

const shown = {
  publication: {
    id: 'p2',
    title: 'Prêt pour la finale',
    subtitle: 'La tradition sportive rencontre un style moderne.',
    imageUrl: '/m/p2.jpg',
  },
  ctaLabel: '',
};

async function renderSection() {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <FeaturedPublication />
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
  await act(async () => {});
  return view;
}

describe('FeaturedPublication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatured.data = shown;
    mockFeatured.isPending = false;
  });

  it('affiche la publication renvoyée par le serveur : image, titre, sous-titre, « Découvrir »', async () => {
    await renderSection();
    expect(screen.getByTestId('home-featured')).toBeTruthy();
    expect(screen.getByText('image:Prêt pour la finale')).toBeTruthy();
    expect(screen.getByText('Prêt pour la finale')).toBeTruthy();
    expect(screen.getByText('La tradition sportive rencontre un style moderne.')).toBeTruthy();
    expect(screen.getByText('Découvrir')).toBeTruthy();
  });

  it('« Découvrir » ouvre la page Publications de l’application', async () => {
    await renderSection();
    fireEvent.press(screen.getByTestId('home-featured-cta'));
    expect(router.push).toHaveBeenCalledWith('/publications');
  });

  it('le libellé du bouton vient de l’admin quand il est renseigné', async () => {
    mockFeatured.data = { ...shown, ctaLabel: 'Lire le numéro' };
    await renderSection();
    expect(screen.getByText('Lire le numéro')).toBeTruthy();
    expect(screen.queryByText('Découvrir')).toBeNull();
  });

  it('section masquée ou sans publication : rien ne s’affiche sur l’accueil', async () => {
    mockFeatured.data = { publication: null, ctaLabel: '' };
    await renderSection();
    expect(screen.queryByTestId('home-featured')).toBeNull();
    expect(screen.queryByText('Découvrir')).toBeNull();
  });

  it('pendant le chargement, rien ne s’affiche (pas de saut de mise en page)', async () => {
    mockFeatured.data = undefined;
    mockFeatured.isPending = true;
    await renderSection();
    expect(screen.queryByTestId('home-featured')).toBeNull();
  });

  it('une publication sans image garde son titre et son bouton', async () => {
    mockFeatured.data = { ...shown, publication: { ...shown.publication, imageUrl: '' } };
    await renderSection();
    expect(screen.queryByText('image:Prêt pour la finale')).toBeNull();
    expect(screen.getByText('Prêt pour la finale')).toBeTruthy();
    expect(screen.getByTestId('home-featured-cta')).toBeTruthy();
  });
});
