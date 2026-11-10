import { useMemo } from 'react';
/**
 * Hooks de données de la page d'accueil (react-query).
 *
 * Un seul endroit décide des clés de requête et des durées de cache : les écrans
 * ne parlent jamais à `fetch` directement.
 */
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchHeroCarouselSettings, fetchHeroSlides, fetchHomeCover,
  fetchNavigation,
  type HeroCarouselSettings, type HeroSlide, type HomeCover,
  type NavLink,
} from './public';
import { fetchCatalogBrands } from './catalog';
import {
  fetchNews, fetchPromotions, fetchStories,
  type NewsItem, type Promotion, type StoryItem,
} from './sections';
import { fetchStoriesShowcase } from './storiesShowcase';
import { fetchFooterInfo, type FooterInfo } from './footer';
import { HERO_DEMO_ENABLED, COVER_DEMO_ENABLED } from '@/features/home/heroDemo';
import { demoHeroSlides } from '@/features/home/heroDemoSlides';
import { demoHomeCover } from '@/features/home/homeCoverDemo';
import {
  fetchPublications, fetchReelPage, fetchSocialCounts, fetchStoryPublishers,
  type Publication, type ReelPage, type SocialCounts, type StoryPublisher,
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
  homeCover: ['home', 'cover'] as const,
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
 * donc on le rafraîchit après expiration du cache plutôt que de le garder une
 * heure. `staleTime` court + refetch au montage = contenu frais sans marteler
 * le serveur à chaque rendu.
 */
const CONTENT = { staleTime: 60_000, refetchOnMount: true } as const;

export const useHomeCover = (): UseQueryResult<HomeCover | null> =>
  useQuery({
    queryKey: queryKeys.homeCover,
    queryFn: async ({ signal }) => {
      if (!COVER_DEMO_ENABLED) return fetchHomeCover({ signal });
      // Démo : une cover publiée dans le CRM gagne ; sinon les visuels embarqués.
      const live = await fetchHomeCover({ signal }).catch(() => null);
      return live ?? demoHomeCover();
    },
    ...CONTENT,
  });

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
const CATALOG = { staleTime: 120_000, refetchOnMount: true } as const;

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

export const reelPagesKey = (anchor?: string) => [...queryKeys.reels, 'pages', anchor ?? ''] as const;
export function useReels(enabled = true, anchor?: string) {
  const client = useQueryClient();
  const result = useInfiniteQuery({
    enabled, queryKey: reelPagesKey(anchor), initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => fetchReelPage(pageParam, { signal }, anchor),
    getNextPageParam: last => last.nextCursor ?? undefined,
    // Presentation-only handoff; never borrow another query's pagination cursor.
    placeholderData: anchor ? () => {
      const state = client.getQueryState<InfiniteData<ReelPage>>(reelPagesKey());
      if (!state?.data || state.isInvalidated || Date.now() - state.dataUpdatedAt > CONTENT.staleTime) return undefined;
      for (const page of state.data.pages) {
        const item = page.items.find(row => row.id === anchor);
        if (item) return { pages: [{ items: [item], nextCursor: null }], pageParams: [null] };
      }
      return undefined;
    } : undefined,
    ...CONTENT,
  });
  const data = useMemo(() => result.data?.pages.flatMap(page => page.items), [result.data]);
  return { ...result, data };
}

export const usePublications = (): UseQueryResult<Publication[]> =>
  useQuery({ queryKey: queryKeys.publications, queryFn: ({ signal }) => fetchPublications({ signal }), ...CONTENT });

export const useStoryPublishers = (): UseQueryResult<StoryPublisher[]> =>
  useQuery({ queryKey: queryKeys.publishers, queryFn: ({ signal }) => fetchStoryPublishers({ signal }), ...CONTENT });

export const useSocialCounts = (ids: string[]): UseQueryResult<Record<string, SocialCounts>> =>
  useQuery({ queryKey: queryKeys.socialCounts(ids), queryFn: ({ signal }) => fetchSocialCounts(ids, { signal }), ...CONTENT, enabled: ids.length > 0 });


export const useStoriesShowcase = () => useQuery({ queryKey: ['home', 'stories-showcase'], queryFn: ({ signal }) => fetchStoriesShowcase({ signal }), ...CONTENT });
