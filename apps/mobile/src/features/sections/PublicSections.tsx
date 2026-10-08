/**
 * أقسام الموقع على الرئيسية (Q2 — وQ4 ضاف قسم LENS، 08/10/2026).
 *
 * الفكرة اللي تمنع الرجوع للورا: **الترتيب قرار الإدارة، موش قرارنا.**
 * `/home-blocks` يعطي `{id, sortOrder, visible}`، و`/lens-hero` يعطي
 * `sortOrder` كذلك — فنرتبو الكل **بمفتاح واحد**، ونفس القاعدة تنطبق على
 * الإثنين: قسم مخفي ⇒ مخفي، وترتيبهم يسبق ترتيبنا.
 *
 * وقاعدة ثانية: **قسم يفشل ما يطيّحش الصفحة.** كل قسم عندو حالته المستقلّة
 * (تحميل · خطأ · فارغ)، والباقي يكمل يخدم.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';

import { AppText, Button } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import {
  useCatalogArrivals, useCatalogProducts,
  useHomeBlocks, useLensHero, useNews, usePromotions, useStories,
} from '@/api/hooks';
import type { CatalogArrival, CatalogProduct } from '@/api/catalog';
import type { NewsItem, Promotion, StoryItem } from '@/api/sections';
import { ProductCard } from '@/features/catalog/ProductCard';
import { LensHero } from '@/features/lens/LensHero';
import { StoryViewer } from '@/features/social/StoryViewer';
import { openStoryTarget, storyHasTarget } from '@/features/social/storyTarget';
import { PromotionCard } from './PromotionCard';
import { StoryCard } from './StoryCard';
import { NewsCard } from './NewsCard';

const TITLES = {
  products: 'sections.products',
  arrivals: 'sections.arrivals',
  promotions: 'sections.promotions',
  stories: 'sections.stories',
  news: 'sections.news',
} as const;

type BlockId = keyof typeof TITLES;

export function PublicSections() {
  const theme = useTheme();
  const t = useT();

  const blocks = useHomeBlocks();
  const products = useCatalogProducts();
  const arrivals = useCatalogArrivals();
  const promotions = usePromotions();
  const stories = useStories();
  const news = useNews();
  const lensHero = useLensHero();

  const openProduct = useCallback((product: CatalogProduct) => {
    router.push({ pathname: '/product/[id]', params: { id: product.id } });
  }, []);

  const openPromotion = useCallback((promotion: Promotion) => {
    // العرض يوصل لمنتوجاتو؛ وما عندو حتى منتوج ⇒ المتجر مفلتر على وصولاتو.
    if (promotion.productIds.length > 0) {
      router.push({ pathname: '/product/[id]', params: { id: promotion.productIds[0]! } });
      return;
    }
    if (promotion.arrivalIds.length > 0) {
      router.push({ pathname: '/catalog', params: { arrivalId: promotion.arrivalIds[0]! } });
    }
  }, []);

  const openNewsItem = useCallback((item: NewsItem) => {
    router.push({ pathname: '/news/[id]', params: { id: item.id } });
  }, []);

  const openArrival = useCallback((arrival: CatalogArrival) => {
    router.push({ pathname: '/catalog', params: { arrivalId: arrival.id } });
  }, []);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const storyRows = stories.data ?? [];

  /** حالة كل قسم: pending / failed / empty / العقدة. */
  const section = (id: BlockId): { pending: boolean; failed: boolean; empty: boolean; node: ReactNode } => {
    switch (id) {
      case 'products':
        return {
          pending: products.isPending, failed: products.isError, empty: (products.data ?? []).length === 0,
          node: (
            <View style={styles.grid}>
              {(products.data ?? []).slice(0, 6).map((product) => (
                <ProductCard key={product.id} product={product} onOpen={openProduct} />
              ))}
            </View>
          ),
        };
      case 'arrivals':
        return {
          pending: arrivals.isPending, failed: arrivals.isError, empty: (arrivals.data ?? []).length === 0,
          node: (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail}>
              {(arrivals.data ?? []).map((arrival) => (
                <Button key={arrival.id} label={arrival.name} onPress={() => openArrival(arrival)} />
              ))}
            </ScrollView>
          ),
        };
      case 'promotions':
        return {
          pending: promotions.isPending, failed: promotions.isError, empty: (promotions.data ?? []).length === 0,
          node: (
            <View style={styles.grid}>
              {(promotions.data ?? []).slice(0, 4).map((promotion) => (
                <PromotionCard key={promotion.id} promotion={promotion} onOpen={openPromotion} />
              ))}
            </View>
          ),
        };
      case 'stories':
        return {
          pending: stories.isPending, failed: stories.isError, empty: storyRows.length === 0,
          node: (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail}>
              {storyRows.map((story, position) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  onOpen={() => setViewerIndex(position)}
                  viewed={viewed.has(story.id)}
                />
              ))}
            </ScrollView>
          ),
        };
      case 'news':
        return {
          pending: news.isPending, failed: news.isError, empty: (news.data ?? []).length === 0,
          node: (
            <View>
              {(news.data ?? []).slice(0, 4).map((item) => (
                <NewsCard key={item.id} item={item} onOpen={openNewsItem} />
              ))}
            </View>
          ),
        };
      default:
        return { pending: false, failed: false, empty: true, node: null };
    }
  };

  // لين يجي ترتيب الإدارة: التحميل يبان مرة وحدة، موش خمسة.
  if (blocks.isPending) return <LoadingBlock />;
  if (blocks.isError) return <ErrorBlock error={blocks.error} onRetry={() => blocks.refetch()} />;

  const visible = (blocks.data ?? []).filter((block) => block.visible);

  /**
   * الكل بـ`sortOrder` — الأقسام الخمسة **وقسم LENS**: ترتيب واحد، قرار واحد.
   *
   * قسم LENS ما عندوش عنوان من القاموس: العنوان يجي من الخادم (`lens-hero`).
   */
  type Slide = {
    key: string;
    sortOrder: number;
    title?: string;
    seeAll?: boolean;
    body?: ReturnType<typeof section>;
    raw?: ReactNode;
  };
  const slides: Slide[] = [
    ...visible.map((block) => ({
      key: block.id,
      sortOrder: block.sortOrder,
      title: t(TITLES[block.id as BlockId]),
      seeAll: block.id === 'products',
      body: section(block.id as BlockId),
    })),
    ...(lensHero.data?.enabled
      ? [{ key: 'lens', sortOrder: lensHero.data.sortOrder, raw: <LensHero /> }]
      : []),
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <View style={styles.wrap}>
      {slides.map((slide) => (
        <View key={slide.key} style={styles.section}>
          {slide.raw ? (
            slide.raw
          ) : slide.body ? (
            <>
              <View style={styles.header}>
                {slide.title ? <AppText variant="title" weight="bold">{slide.title}</AppText> : null}
                {slide.seeAll ? (
                  <Button label={t('catalog.seeAll')} onPress={() => router.push('/catalog')} />
                ) : null}
              </View>
              {slide.body.pending ? <LoadingBlock /> : null}
              {slide.body.failed ? (
                <AppText variant="caption" color={theme.colors.danger}>{t('sections.error')}</AppText>
              ) : slide.body.empty ? (
                <EmptyBlock>{t('sections.empty')}</EmptyBlock>
              ) : (
                slide.body.node
              )}
            </>
          ) : null}
        </View>
      ))}

      <StoryViewer
        stories={storyRows}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
        onStorySeen={(story) => setViewed((previous) => new Set(previous).add(story.id))}
        onOpenTarget={(story) => {
          if (storyHasTarget(story)) openStoryTarget(story);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 22 },
  section: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  rail: { marginHorizontal: -2 },
});
