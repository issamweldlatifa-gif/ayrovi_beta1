/**
 * أقسام الموقع على الرئيسية (Q2، 08/10/2026).
 *
 * الفكرة اللي تمنع الرجوع للورا: **الترتيب قرار الإدارة، موش قرارنا.**
 * `/home-blocks` يعطي `{id, sortOrder, visible}` — قسم مخفي هناك ⇒ مخفي هنا،
 * وترتيبنا يتبع ترتيبهم. كي نسقط نحن في قائمة ثابتة، نرجع نخترع المحتوى.
 *
 * وقاعدة ثانية: **قسم يفشل ما يطيّحش الصفحة.** كل قسم عندو حالته المستقلّة
 * (تحميل · خطأ · فارغ)، والباقي يكمل يخدم.
 */
import { useCallback } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Button } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import {
  useCatalogArrivals, useCatalogProducts,
  useHomeBlocks, useNews, usePromotions, useStories,
} from '@/api/hooks';
import type { CatalogArrival, CatalogProduct } from '@/api/catalog';
import type { NewsItem, Promotion, StoryItem } from '@/api/sections';
import { ProductCard } from '@/features/catalog/ProductCard';
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

/** هدف الستوري: منتوج ⇒ صفحتو؛ وصولة ⇒ المتجر مفلتر؛ رابط ⇒ المتصفّح. */
function openStory(story: StoryItem) {
  if (story.productId) {
    router.push({ pathname: '/product/[id]', params: { id: story.productId } });
    return;
  }
  if (story.arrivalId) {
    router.push({ pathname: '/catalog', params: { arrivalId: story.arrivalId } });
    return;
  }
  if (story.targetUrl) Linking.openURL(story.targetUrl).catch(() => null);
}

function storyActionable(story: StoryItem): boolean {
  return Boolean(story.productId || story.arrivalId || story.targetUrl);
}

export function PublicSections() {
  const theme = useTheme();
  const t = useT();

  const blocks = useHomeBlocks();
  const products = useCatalogProducts();
  const arrivals = useCatalogArrivals();
  const promotions = usePromotions();
  const stories = useStories();
  const news = useNews();

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

  // لين يجي ترتيب الإدارة: التحميل يبان مرة وحدة، موش خمسة.
  if (blocks.isPending) return <LoadingBlock />;
  if (blocks.isError) return <ErrorBlock error={blocks.error} onRetry={() => blocks.refetch()} />;

  const visible = (blocks.data ?? []).filter((block) => block.visible);

  const body: Record<keyof typeof TITLES, { pending: boolean; failed: boolean; empty: boolean; node: React.ReactNode }> = {
    products: {
      pending: products.isPending,
      failed: products.isError,
      empty: (products.data ?? []).length === 0,
      node: (
        <View style={styles.grid}>
          {(products.data ?? []).slice(0, 6).map((product) => (
            <ProductCard key={product.id} product={product} onOpen={openProduct} />
          ))}
        </View>
      ),
    },
    arrivals: {
      pending: arrivals.isPending,
      failed: arrivals.isError,
      empty: (arrivals.data ?? []).length === 0,
      node: (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail}>
          {(arrivals.data ?? []).map((arrival) => (
            <Button key={arrival.id} label={arrival.name} onPress={() => openArrival(arrival)} />
          ))}
        </ScrollView>
      ),
    },
    promotions: {
      pending: promotions.isPending,
      failed: promotions.isError,
      empty: (promotions.data ?? []).length === 0,
      node: (
        <View style={styles.grid}>
          {(promotions.data ?? []).slice(0, 4).map((promotion) => (
            <PromotionCard key={promotion.id} promotion={promotion} onOpen={openPromotion} />
          ))}
        </View>
      ),
    },
    stories: {
      pending: stories.isPending,
      failed: stories.isError,
      empty: (stories.data ?? []).length === 0,
      node: (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail}>
          {(stories.data ?? []).map((story) => (
            <StoryCard key={story.id} story={story} onOpen={openStory} actionable={storyActionable(story)} />
          ))}
        </ScrollView>
      ),
    },
    news: {
      pending: news.isPending,
      failed: news.isError,
      empty: (news.data ?? []).length === 0,
      node: <View>{(news.data ?? []).slice(0, 4).map((item) => (
        <NewsCard key={item.id} item={item} onOpen={openNewsItem} />
      ))}</View>,
    },
  };

  return (
    <View style={styles.wrap}>
      {visible.map((block) => {
        const section = body[block.id];
        if (!section) return null;
        return (
          <View key={block.id} style={styles.section}>
            <View style={styles.header}>
              <AppText variant="title" weight="bold">{t(TITLES[block.id])}</AppText>
              {block.id === 'products' ? (
                <Button label={t('catalog.seeAll')} onPress={() => router.push('/catalog')} />
              ) : null}
            </View>
            {section.pending ? <LoadingBlock /> : null}
            {section.failed ? (
              <AppText variant="caption" color={theme.colors.danger}>{t('sections.error')}</AppText>
            ) : section.empty ? (
              <EmptyBlock>{t('sections.empty')}</EmptyBlock>
            ) : (
              section.node
            )}
          </View>
        );
      })}
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
