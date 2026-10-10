/**
 * Hooks de données de la page d'accueil (react-query).
 *
 * Un seul endroit décide des clés de requête et des durées de cache : les écrans
 * ne parlent jamais à `fetch` directement.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchHeroCarouselSettings, fetchHeroSlides,
  fetchNavigation,
  type HeroCarouselSettings, type HeroSlide,
  type NavLink,
} from './public';
import { fetchCatalogBrands } from './catalog';
import {
  fetchNews, fetchPromotions, fetchStories,
  type NewsItem, type Promotion, type StoryItem,
} from './sections';
import { fetchFooterInfo, type FooterInfo } from './footer';
import { HERO_DEMO_ENABLED } from '@/features/home/heroDemo';
import { demoHeroSlides } from '@/features/home/heroDemoSlides';
import {
  fetchPublications, fetchReels, fetchSocialCounts, fetchStoryPublishers,
  type Publication, type Reel, type SocialCounts, type StoryPublisher,
} from './social';

/**
 * Clés de requête. `home` en préfixe : une invalidation globale du contenu
 * public reste possible sans connaître chaque écran.
 */
export const queryKeys = {
  home: ['home'] as const,
  // Carrousel Hero : contenu éditorial Admin ⇒ même traitement que le hero.
  heroSlides: ['home', 'hero-slides'] as const,
  heroCarouselSettings: ['home', 'hero-carousel-settings'] as const,
  navigation: ['home', 'navigation'] as const,
  // الكتالوج أثقل من المحتوى التحريري ⇒ نخفّف الطلبات بشوية.
  catalog: ['catalog'] as const,
  catalogBrands: ['catalog', 'brands'] as const,
  // أقسام الموقع: ترتيبها قرار إداري ⇒ نفس معاملة المحتوى التحريري.
  promotions: ['sections', 'promotions'] as const,
  stories: ['sections', 'stories'] as const,
  news: ['sections', 'news'] as const,
  footer: ['shell', 'footer'] as const,
  reels: ['social', 'reels'] as const,
  publications: ['social', 'publications'] as const,
  publishers: ['social', 'publishers'] as const,
  socialCounts: (ids: string[]) => ['social', 'counts', [...ids].sort().join(',')] as const,
};

/**
 * Le contenu éditorial est piloté depuis l'Admin : il change sans déploiement,
 * donc on le rafraîchit à chaque ouverture d'écran plutôt que de le garder une
 * heure. `staleTime` court + refetch au montage = contenu frais sans marteler
 * le serveur à chaque rendu.
 */
const CONTENT = { staleTime: 60_000, refetchOnMount: 'always' } as const;

export const useHeroSlides = (): UseQueryResult<HeroSlide[]> =>
  useQuery({
    queryKey: queryKeys.heroSlides,
    queryFn: async ({ signal }) => {
      if (!HERO_DEMO_ENABLED) return fetchHeroSlides({ signal });
      // Démo : une carte publiée par l'Admin gagne ; sinon les visuels embarqués.
      const live = await fetchHeroSlides({ signal }).catch(() => [] as HeroSlide[]);
      return live.length > 0 ? live : demoHeroSlides();
    },
    ...CONTENT,
  });

export const useHeroCarouselSettings = (): UseQueryResult<HeroCarouselSettings> =>
  useQuery({
    queryKey: queryKeys.heroCarouselSettings,
    queryFn: async ({ signal }) => {
      const settings = await fetchHeroCarouselSettings({ signal });
      // Démo : défilement automatique pour que le carrousel se voie vivre.
      return HERO_DEMO_ENABLED ? { ...settings, autoplay: true } : settings;
    },
    ...CONTENT,
  });

export const useNavigation = (): UseQueryResult<NavLink[]> =>
  useQuery({ queryKey: queryKeys.navigation, queryFn: ({ signal }) => fetchNavigation({ signal }), ...CONTENT });

/** الكتالوج (Q1) — الماركات. */
const CATALOG = { staleTime: 120_000, refetchOnMount: 'always' } as const;

export const useCatalogBrands = (): UseQueryResult<string[]> =>
  useQuery({ queryKey: queryKeys.catalogBrands, queryFn: ({ signal }) => fetchCatalogBrands({ signal }), ...CATALOG });

export const usePromotions = (): UseQueryResult<Promotion[]> =>
  useQuery({ queryKey: queryKeys.promotions, queryFn: ({ signal }) => fetchPromotions({ signal }), ...CONTENT });

export const useStories = (): UseQueryResult<StoryItem[]> =>
  useQuery({ queryKey: queryKeys.stories, queryFn: ({ signal }) => fetchStories({ signal }), ...CONTENT });

export const useNews = (): UseQueryResult<NewsItem[]> =>
  useQuery({ queryKey: queryKeys.news, queryFn: ({ signal }) => fetchNews({ signal }), ...CONTENT });

/**
 * الفوتر يقرا نفس `commerce-config` — بس **بدون أن يرمي**: عنصر زينة،
 * ونقصو ما يمنعش التصفّح.
 */
export const useFooterInfo = (): UseQueryResult<FooterInfo> =>
  useQuery({ queryKey: queryKeys.footer, queryFn: ({ signal }) => fetchFooterInfo({ signal }), ...CONTENT });

export const useReels = (): UseQueryResult<Reel[]> =>
  useQuery({ queryKey: queryKeys.reels, queryFn: ({ signal }) => fetchReels({ signal }), ...CONTENT });

export const usePublications = (): UseQueryResult<Publication[]> =>
  useQuery({ queryKey: queryKeys.publications, queryFn: ({ signal }) => fetchPublications({ signal }), ...CONTENT });

export const useStoryPublishers = (): UseQueryResult<StoryPublisher[]> =>
  useQuery({ queryKey: queryKeys.publishers, queryFn: ({ signal }) => fetchStoryPublishers({ signal }), ...CONTENT });

export const useSocialCounts = (ids: string[]): UseQueryResult<Record<string, SocialCounts>> =>
  useQuery({ queryKey: queryKeys.socialCounts(ids), queryFn: ({ signal }) => fetchSocialCounts(ids, { signal }), ...CONTENT });

