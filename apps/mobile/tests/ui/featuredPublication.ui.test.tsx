/**
 * « À la une » de l'accueil — la dernière publication, avec « Découvrir ».
 *
 *  • la section affiche la publication la plus récente (date illisible = la plus ancienne) ;
 *  • « Découvrir » ouvre la page Publications de l'APPLICATION ;
 *  • rien ne s'affiche sans publication (pas de bloc vide sur l'accueil) ;
 *  • une publication sans image garde son titre et son bouton.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FeaturedPublication, latestPublication } from '../../src/features/home/FeaturedPublication';
import type { Publication } from '../../src/api/social';
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

const mockPublications = { data: undefined as Publication[] | undefined, isPending: false };
jest.mock('../../src/api/hooks', () => ({
  usePublications: () => mockPublications,
}));

const older: Publication = {
  id: 'p1', title: 'Ancien numéro', subtitle: 'Vieux', channelId: 'c', imageUrl: '/m/p1.jpg', publishAt: '2026-09-01T10:00:00Z',
};
const newest: Publication = {
  id: 'p2', title: 'Prêt pour la finale', subtitle: 'La tradition sportive rencontre un style moderne.', channelId: 'c', imageUrl: '/m/p2.jpg', publishAt: '2026-10-08T09:00:00Z',
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

describe('latestPublication', () => {
  it('prend la publication la plus récente, quel que soit l’ordre de la liste', () => {
    expect(latestPublication([older, newest])?.id).toBe('p2');
    expect(latestPublication([newest, older])?.id).toBe('p2');
  });

  it('une date illisible passe après les dates valides', () => {
    const broken = { ...newest, id: 'p3', publishAt: 'n’importe quoi' };
    expect(latestPublication([broken, older])?.id).toBe('p1');
  });

  it('aucune publication ⇒ rien', () => {
    expect(latestPublication([])).toBeNull();
    expect(latestPublication(undefined)).toBeNull();
  });
});

describe('FeaturedPublication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublications.data = [older, newest];
    mockPublications.isPending = false;
  });

  it('affiche la dernière publication : image, titre, sous-titre, et « Découvrir »', async () => {
    await renderSection();
    expect(screen.getByTestId('home-featured')).toBeTruthy();
    expect(screen.getByText('image:Prêt pour la finale')).toBeTruthy();
    expect(screen.getByText('Prêt pour la finale')).toBeTruthy();
    expect(screen.getByText('La tradition sportive rencontre un style moderne.')).toBeTruthy();
    expect(screen.getByText('Découvrir')).toBeTruthy();
    expect(screen.queryByText('Ancien numéro')).toBeNull();
  });

  it('« Découvrir » ouvre la page Publications de l’application', async () => {
    await renderSection();
    fireEvent.press(screen.getByTestId('home-featured-cta'));
    expect(router.push).toHaveBeenCalledWith('/publications');
  });

  it('sans publication, rien ne s’affiche sur l’accueil', async () => {
    mockPublications.data = [];
    await renderSection();
    expect(screen.queryByTestId('home-featured')).toBeNull();
    expect(screen.queryByText('Découvrir')).toBeNull();
  });

  it('pendant le chargement, rien ne s’affiche (pas de saut de mise en page)', async () => {
    mockPublications.data = undefined;
    mockPublications.isPending = true;
    await renderSection();
    expect(screen.queryByTestId('home-featured')).toBeNull();
  });

  it('une publication sans image garde son titre et son bouton', async () => {
    mockPublications.data = [{ ...newest, imageUrl: '' }];
    await renderSection();
    expect(screen.queryByText('image:Prêt pour la finale')).toBeNull();
    expect(screen.getByText('Prêt pour la finale')).toBeTruthy();
    expect(screen.getByTestId('home-featured-cta')).toBeTruthy();
  });
});
