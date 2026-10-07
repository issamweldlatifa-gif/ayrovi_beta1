/**
 * Hooks de données de la page d'accueil (react-query).
 *
 * Un seul endroit décide des clés de requête et des durées de cache : les écrans
 * ne parlent jamais à `fetch` directement.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchAnnouncements, fetchHeroContent, fetchHeroVisual, fetchNavigation,
  type Announcement, type HeroContent, type HeroVisual, type NavLink,
} from './public';

/**
 * Clés de requête. `home` en préfixe : une invalidation globale du contenu
 * public reste possible sans connaître chaque écran.
 */
export const queryKeys = {
  home: ['home'] as const,
  heroContent: ['home', 'hero-content'] as const,
  heroVisual: ['home', 'hero-visual'] as const,
  navigation: ['home', 'navigation'] as const,
  announcements: ['home', 'announcements'] as const,
};

/**
 * Le contenu éditorial est piloté depuis l'Admin : il change sans déploiement,
 * donc on le rafraîchit à chaque ouverture d'écran plutôt que de le garder une
 * heure. `staleTime` court + refetch au montage = contenu frais sans marteler
 * le serveur à chaque rendu.
 */
const CONTENT = { staleTime: 60_000, refetchOnMount: 'always' } as const;

export const useHeroContent = (): UseQueryResult<HeroContent | null> =>
  useQuery({ queryKey: queryKeys.heroContent, queryFn: ({ signal }) => fetchHeroContent({ signal }), ...CONTENT });

export const useHeroVisual = (): UseQueryResult<HeroVisual | null> =>
  useQuery({ queryKey: queryKeys.heroVisual, queryFn: ({ signal }) => fetchHeroVisual({ signal }), ...CONTENT });

export const useNavigation = (): UseQueryResult<NavLink[]> =>
  useQuery({ queryKey: queryKeys.navigation, queryFn: ({ signal }) => fetchNavigation({ signal }), ...CONTENT });

export const useAnnouncements = (): UseQueryResult<Announcement[]> =>
  useQuery({ queryKey: queryKeys.announcements, queryFn: ({ signal }) => fetchAnnouncements({ signal }), ...CONTENT });
