/**
 * Page Publication — refonte du 13/11/2026, interactions rétablies le 14/11.
 *
 * 13/11 : la page est VIDÉE (plus de fil de posts ni de visionneuse) ; seul
 * l'en-tête reste. 14/11 (refonte des interactions approuvée) : chaque bloc NON
 * sponsorisé reçoit la barre Facebook — résumé, J'aime · Commenter · Partager —
 * et sa feuille de commentaires (`PublicationEngagement`), reliées au serveur.
 * Le corps empile les blocs composés dans le CRM (Contenu → Social →
 * Publication), d'après les planches Zalando : `container`, `media` (image ou
 * vidéo), `sponsored_pair` et `cinema` (16/11 : vidéo bord à bord + panneau noir). Données : `GET /api/public/social/publication-blocks`.
 *
 * Une seule vidéo tourne à la fois : celle du bloc le plus visible, et
 * seulement quand l'écran est au premier plan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchPublicationBlocks, type PublicationBlock } from '@/api/publicationBlocks';
import { fetchSocialEngagement, ZERO_COUNTS, type SocialEngagement } from '@/api/social';
import { useSession } from '@/state/session';
import { PublicationBar, publicationEngagementKey } from './PublicationEngagement';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { nextChromeTravel } from '@/design/chromeLogic';
import { useReduceMotion } from '@/design/motion';
import { useT } from '@/i18n';
import { PublicationFavoritesProvider } from './PublicationFavorites';
import { PublicationSavedProvider } from './PublicationSaved';
import { SheetPortalHost } from '@/design/sheet/SheetPortal';
import { RHYTHM } from '@/design/tokens.mobile';
import { PublicationHeader, PUBLICATION_HEADER_HEIGHT } from './PublicationHeader';
import { PUBLICATION_PALETTE as P, PublicationText } from './publicationDesign';
import { ContainerTemplate } from './templates/ContainerTemplate';
import { MediaTemplate } from './templates/MediaTemplate';
import { SponsoredPairTemplate } from './templates/SponsoredPairTemplate';
import { CinemaTemplate } from './templates/CinemaTemplate';
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
  if (block.kind === 'cinema') return <CinemaTemplate block={block} metrics={metrics} active={active} onOpenProduct={openProduct} />;
  return <MediaTemplate block={block} metrics={metrics} active={active} onOpenProduct={openProduct} onOpenCollection={(id) => router.push({ pathname: '/publication-collection/[id]', params: { id } })} />;
}

const hasVideo = (block: PublicationBlock) => block.media?.type === 'video';

export function PublicationTemplatesScreen() {
  const reduceMotion = useReduceMotion();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const metrics = useMemo(() => publicationTemplateMetrics(width), [width]);
  const [focused, setFocused] = useState(true);
  const [activeId, setActiveId] = useState('');

  // Accumulate directional travel so small scroll deltas and overscroll do not flicker the bar.
  const travel = useRef({ hidden: false, anchor: 0 });
  const [headerHidden, setHeaderHidden] = useState(false);
  const translation = useRef(new Animated.Value(0)).current;
  const onScroll = useCallback(({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const before = travel.current;
    travel.current = nextChromeTravel(before, contentOffset.y, {
      maxY: Math.max(0, contentSize.height - layoutMeasurement.height), travel: 22, topZone: 30,
    });
    if (before.hidden !== travel.current.hidden) setHeaderHidden(travel.current.hidden);
  }, []);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const target = headerHidden ? -PUBLICATION_HEADER_HEIGHT : 0;
    if (reduceMotion) { translation.setValue(target); return; }
    const animation = Animated.timing(translation, { toValue: target, duration: 180, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [headerHidden, reduceMotion, translation]);

  const blocks = useQuery({
    queryKey: PUBLICATION_BLOCKS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPublicationBlocks({ signal }),
    staleTime: 30_000,
  });
  const rows = blocks.data ?? [];
  // Engagement (compteurs + réaction du compte) de TOUS les blocs (16/11 :
  // sponsorisés compris — « chaque publication » a ses boutons), en une requête ; la clé suit le compte pour ne jamais montrer la réaction
  // d'un autre utilisateur après un changement de session.
  const session = useSession();
  const owner = session.status === 'signedIn' ? session.account?.id || 'member' : 'guest';
  const socialIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const engagementKey = useMemo(() => [...publicationEngagementKey(socialIds), owner], [socialIds, owner]);
  const engagement = useQuery<SocialEngagement>({
    queryKey: engagementKey,
    queryFn: ({ signal }) => fetchSocialEngagement(socialIds, { signal }),
    enabled: socialIds.length > 0,
    staleTime: 15_000,
  });

  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<ViewToken<PublicationBlock>> }) => {
    const first = viewableItems.find((entry) => entry.item && hasVideo(entry.item));
    setActiveId(first?.item?.id ?? '');
  }).current;

  return (
    <View testID="publication-page" style={styles.screen}>
      {/* Hôte des feuilles (commentaires) : elles couvrent l'écran entier,
          au-dessus de la liste — jamais la seule rangée qui les déclare. */}
      <SheetPortalHost>
        {focused ? <StatusBar style="dark" /> : null}
        <View style={[styles.safeContent, { paddingTop: insets.top }]}>
          <PublicationFavoritesProvider>
            <PublicationSavedProvider>
              <FlatList
                testID="publication-blocks"
                data={rows}
                keyExtractor={(item) => item.id}
                extraData={`${activeId}:${focused}:${metrics.width}:${engagement.dataUpdatedAt}`}
                renderItem={({ item }) => (
                  <View style={[styles.column, { width: metrics.width }]}>
                    <PublicationBlockView block={item} metrics={metrics} active={focused && activeId === item.id} />
                    <PublicationBar
                      blockId={item.id}
                      title={item.title}
                      counts={engagement.data?.counts?.[item.id] ?? ZERO_COUNTS}
                      mine={engagement.data?.mine?.[item.id] ?? null}
                      engagementKey={engagementKey}
                    />
                  </View>
                )}
                ItemSeparatorComponent={Separator}
                viewabilityConfig={viewability}
                onViewableItemsChanged={onViewable}
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentInsetAdjustmentBehavior="never"
                automaticallyAdjustContentInsets={false}
                contentContainerStyle={{ paddingTop: PUBLICATION_HEADER_HEIGHT + RHYTHM.group, paddingBottom: insets.bottom + RHYTHM.section }}
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={5}
                progressViewOffset={PUBLICATION_HEADER_HEIGHT}
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
            </PublicationSavedProvider>
          </PublicationFavoritesProvider>
          <View testID="publication-scroll-header" pointerEvents={headerHidden ? 'none' : 'box-none'}
            accessibilityElementsHidden={headerHidden} importantForAccessibility={headerHidden ? 'no-hide-descendants' : 'auto'}
            style={[styles.headerClip, { top: insets.top }]}>
            <Animated.View style={{ transform: [{ translateY: translation }] }}>
              <PublicationHeader />
            </Animated.View>
          </View>
        </View>
      </SheetPortalHost>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper },
  safeContent: { flex: 1 },
  headerClip: { position: 'absolute', left: 0, right: 0, height: PUBLICATION_HEADER_HEIGHT, overflow: 'hidden' },
  column: { alignSelf: 'center' },
  separator: { height: T.blockSpacing },
});
