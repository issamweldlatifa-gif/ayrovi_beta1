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
import {
  fetchCatalogArrivals, fetchCatalogBrands, fetchCatalogProducts,
  type CatalogArrival, type CatalogProduct,
} from './catalog';
import {
  fetchHomeBlocks, fetchNews, fetchPromotions, fetchStories,
  type HomeBlock, type NewsItem, type Promotion, type StoryItem,
} from './sections';
import { fetchFooterInfo, type FooterInfo } from './footer';

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
  // الكتالوج أثقل من المحتوى التحريري ⇒ نخفّف الطلبات بشوية.
  catalog: ['catalog'] as const,
  catalogProducts: (arrivalId = '') => ['catalog', 'products', arrivalId] as const,
  catalogArrivals: ['catalog', 'arrivals'] as const,
  catalogBrands: ['catalog', 'brands'] as const,
  // أقسام الموقع: ترتيبها قرار إداري ⇒ نفس معاملة المحتوى التحريري.
  homeBlocks: ['sections', 'home-blocks'] as const,
  promotions: ['sections', 'promotions'] as const,
  stories: ['sections', 'stories'] as const,
  news: ['sections', 'news'] as const,
  footer: ['shell', 'footer'] as const,
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

/** الكتالوج (Q1) — منتوجات المتجر، الوصولات، الماركات. */
const CATALOG = { staleTime: 120_000, refetchOnMount: 'always' } as const;

export const useCatalogProducts = (arrivalId = ''): UseQueryResult<CatalogProduct[]> =>
  useQuery({
    queryKey: queryKeys.catalogProducts(arrivalId),
    queryFn: ({ signal }) => fetchCatalogProducts({ signal, arrivalId: arrivalId || undefined, limit: 50 }),
    ...CATALOG,
  });

export const useCatalogArrivals = (): UseQueryResult<CatalogArrival[]> =>
  useQuery({ queryKey: queryKeys.catalogArrivals, queryFn: ({ signal }) => fetchCatalogArrivals({ signal }), ...CATALOG });

export const useCatalogBrands = (): UseQueryResult<string[]> =>
  useQuery({ queryKey: queryKeys.catalogBrands, queryFn: ({ signal }) => fetchCatalogBrands({ signal }), ...CATALOG });

export const useHomeBlocks = (): UseQueryResult<HomeBlock[]> =>
  useQuery({ queryKey: queryKeys.homeBlocks, queryFn: ({ signal }) => fetchHomeBlocks({ signal }), ...CONTENT });

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
