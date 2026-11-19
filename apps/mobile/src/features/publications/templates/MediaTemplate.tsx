import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { distinctPublicationSubtitle, editorialFeedRail, editorialHeroHeight, EDITORIAL_FEED as E } from '../../../../../../shared/publicationEditorial';
import { PublicationFollow } from '../PublicationFollow';
import { PUBLICATION_PALETTE as P, PublicationIcon, PublicationSponsored, PublicationText } from '../publicationDesign';
import { blockInks } from './blockColors';
import { BlockProductCard } from './BlockProductCard';
import { publicationRailDirection } from './railDirection';
import { PublicationVideo } from './PublicationVideo';
import type { PublicationTemplateMetrics } from './templateMetrics';

export function MediaTemplate({ block, metrics, active, onOpenProduct, onOpenCollection }: {
  block: PublicationBlock;
  metrics: PublicationTemplateMetrics;
  active: boolean;
  onOpenProduct: (id: string) => void;
  onOpenCollection: (id: string) => void;
}) {
  const t = useT();
  const theme = useTheme();
  const orientation = publicationRailDirection(theme.isRTL);
  const inks = blockInks(block.bgColor, P.ink, P.paper);
  const media = block.media;
  const rail = editorialFeedRail(metrics.width, block.products.length);
  const height = editorialHeroHeight(metrics.media.width, media?.type, media?.format);
  const subtitle = distinctPublicationSubtitle(block.title, block.subtitle);
  const label = t('publication.openCollection', { title: block.title });
  const open = () => onOpenCollection(block.id);
  const direction = theme.isRTL ? 'row-reverse' : 'row';

  return (
    <View testID={`publication-block-${block.id}`} style={[styles.block, { backgroundColor: block.bgColor }]}>
      <View style={styles.head}>
        <PublicationFollow look="inline" publisherId={block.publisher.id} publisherName={block.publisher.name}
          ink={inks.ink} muted={inks.muted} testID={`publication-block-${block.id}-follow`} />
        {block.sponsored ? <PublicationSponsored color={inks.muted} testID={`publication-block-${block.id}-sponsored`} /> : null}
      </View>
      {media ? (
        <View testID={`publication-block-${block.id}-media`} style={[styles.media, { height }]}>
          {media.type === 'video' ? (
            <PublicationVideo uri={media.url} poster={media.poster} active={active} label={block.title} testID={`publication-block-${block.id}-video`} />
          ) : (
            <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={open} style={styles.fill} testID={`publication-block-${block.id}-cover`}>
              <AppImage uri={mediaUrl(media.url)} decorative contentFit="cover" style={styles.fill} />
            </Pressable>
          )}
        </View>
      ) : null}
      <ScrollView horizontal scrollEnabled={rail.scroll} showsHorizontalScrollIndicator={false}
        accessibilityLabel={t('publication.products', { title: block.title })} testID={`publication-block-${block.id}-row`}
        style={[styles.rail, orientation.viewport]} contentContainerStyle={styles.track} decelerationRate="fast" snapToInterval={rail.snap} snapToAlignment="start" disableIntervalMomentum>
        {block.products.map((product) => (
          <BlockProductCard key={product.id} product={product} width={rail.cardWidth} imageHeight={rail.imageHeight}
            railTileStyle={orientation.tile} photoOnly sponsored={false} inks={inks} onOpen={onOpenProduct} testID={`publication-block-${block.id}-product-${product.id}`} />
        ))}
      </ScrollView>
      <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={open} testID={`publication-block-${block.id}-collection`}
        style={({ pressed }) => [styles.caption, { flexDirection: direction, opacity: pressed ? theme.opacity.subtle : 1 }]}>
        <View style={styles.copy}>
          <PublicationText variant="bodyStrong" color={inks.ink} numberOfLines={2} style={styles.title}>{block.title}</PublicationText>
          {subtitle ? <PublicationText variant="body" color={inks.muted} numberOfLines={1} style={styles.description}>{subtitle}</PublicationText> : null}
        </View>
        <PublicationIcon name={theme.isRTL ? 'chevron-back-outline' : 'chevron-forward-outline'} size={18} color={inks.ink} />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  block: { width: '100%', paddingTop: 2 },
  head: { marginHorizontal: E.gutter, paddingBottom: 4 },
  media: { marginHorizontal: E.gutter, borderRadius: E.radius, overflow: 'hidden', backgroundColor: P.neutral },
  fill: { width: '100%', height: '100%' },
  rail: { marginHorizontal: E.gutter, marginTop: E.gap, flexGrow: 0 },
  track: { gap: E.gap },
  caption: { marginHorizontal: E.gutter, paddingVertical: 6, minHeight: 44, gap: 8, alignItems: 'center' },
  copy: { flex: 1 },
  title: { fontSize: E.title, lineHeight: E.titleLine },
  description: { fontSize: E.description, lineHeight: E.descriptionLine },
});
