/**
 * Page Publication — refonte du 13/11/2026.
 *
 * Consigne du propriétaire : la page est VIDÉE (plus de fil de posts, de
 * réactions, de commentaires, de partage ni de visionneuse) ; seul l'en-tête
 * reste. Le corps empile les blocs composés dans le CRM (Contenu → Social →
 * Publication), d'après les planches Zalando : `container`, `media` (image ou
 * vidéo) et `sponsored_pair`. Données : `GET /api/public/social/publication-blocks`.
 *
 * Une seule vidéo tourne à la fois : celle du bloc le plus visible, et
 * seulement quand l'écran est au premier plan.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchPublicationBlocks, type PublicationBlock } from '@/api/publicationBlocks';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { PublicationFavoritesProvider } from './PublicationFavorites';
import { PublicationHeader } from './PublicationHeader';
import { PUBLICATION_PALETTE as P, PublicationText } from './publicationDesign';
import { ContainerTemplate } from './templates/ContainerTemplate';
import { MediaTemplate } from './templates/MediaTemplate';
import { SponsoredPairTemplate } from './templates/SponsoredPairTemplate';
import { PUBLICATION_TEMPLATE as T, publicationTemplateMetrics, type PublicationTemplateMetrics } from './templates/templateMetrics';

export const PUBLICATION_BLOCKS_QUERY_KEY = ['publication-blocks'] as const;

function openProduct(id: string) {
  router.push({ pathname: '/product/[id]', params: { id } });
}

export function PublicationBlockView({
  block,
  metrics,
  active,
}: {
  block: PublicationBlock;
  metrics: PublicationTemplateMetrics;
  active: boolean;
}) {
  if (block.kind === 'container') return <ContainerTemplate block={block} metrics={metrics} onOpenProduct={openProduct} />;
  if (block.kind === 'sponsored_pair') return <SponsoredPairTemplate block={block} metrics={metrics} onOpenProduct={openProduct} />;
  return <MediaTemplate block={block} metrics={metrics} active={active} onOpenProduct={openProduct} />;
}

const hasVideo = (block: PublicationBlock) => block.media?.type === 'video';

export function PublicationTemplatesScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => publicationTemplateMetrics(width), [width]);
  const [focused, setFocused] = useState(true);
  const [activeId, setActiveId] = useState('');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setStatusBarStyle('dark');
      return () => {
        setFocused(false);
        setStatusBarStyle(theme.mode === 'dark' ? 'light' : 'dark');
      };
    }, [theme.mode])
  );

  const blocks = useQuery({
    queryKey: PUBLICATION_BLOCKS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPublicationBlocks({ signal }),
    staleTime: 30_000,
  });
  const rows = blocks.data ?? [];

  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<ViewToken<PublicationBlock>> }) => {
    const first = viewableItems.find((entry) => entry.item && hasVideo(entry.item));
    setActiveId(first?.item?.id ?? '');
  }).current;

  return (
    <View testID="publication-page" style={[styles.screen, { paddingTop: insets.top }]}>
      <PublicationHeader />
      <PublicationFavoritesProvider>
      <FlatList
        testID="publication-blocks"
        data={rows}
        keyExtractor={(item) => item.id}
        extraData={`${activeId}:${focused}:${metrics.width}`}
        renderItem={({ item }) => (
          <View style={[styles.column, { width: metrics.width }]}>
            <PublicationBlockView block={item} metrics={metrics} active={focused && activeId === item.id} />
          </View>
        )}
        ItemSeparatorComponent={Separator}
        viewabilityConfig={viewability}
        onViewableItemsChanged={onViewable}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        refreshing={blocks.isRefetching}
        onRefresh={() => void blocks.refetch()}
        ListEmptyComponent={
          blocks.isPending ? (
            <LoadingBlock />
          ) : blocks.isError ? (
            <ErrorBlock error={blocks.error} onRetry={() => void blocks.refetch()} />
          ) : (
            <EmptyBlock>
              <PublicationText color={P.muted}>{t('publication.empty')}</PublicationText>
            </EmptyBlock>
          )
        }
      />
      </PublicationFavoritesProvider>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper },
  content: { paddingTop: 16 },
  column: { alignSelf: 'center' },
  separator: { height: T.blockSpacing },
});
