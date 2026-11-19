import { distinctPublicationSubtitle, EDITORIAL_CAMPAIGN as C } from '../../../../../../shared/publicationEditorial';
import { ScrollView, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { PublicationFollow } from '../PublicationFollow';
import { PUBLICATION_PALETTE as P, PublicationSponsored, PublicationText } from '../publicationDesign';
import { publicationBlockFont } from '../publicationTokens';
import { blockInks } from './blockColors';
import { BlockProductCard } from './BlockProductCard';
import { publicationRailDirection } from './railDirection';
import { PUBLICATION_TEMPLATE as T, type PublicationTemplateMetrics } from './templateMetrics';

export function ContainerTemplate({
  block,
  metrics,
  onOpenProduct,
}: {
  block: PublicationBlock;
  metrics: PublicationTemplateMetrics;
  onOpenProduct: (id: string) => void;
}) {
  const t = useT();
  const orientation = publicationRailDirection(useTheme().isRTL);
  const { locale } = useI18n();
  const heading = { fontFamily: publicationBlockFont(locale, 'heading') };
  const band = blockInks(block.bgColor, P.ink, P.paper);
  const panel = blockInks(block.panelColor, P.ink, P.paper);
  const subtitle = distinctPublicationSubtitle(block.title, block.subtitle);
  const label = block.subtitle ? `${block.title}. ${block.subtitle}` : block.title;
  const reserveReference = block.products.some((product) => product.compareAtPrice != null && product.compareAtPrice > product.price);
  return (
    <View testID={`publication-block-${block.id}`} style={styles.block}>
      <View testID={`publication-block-${block.id}-band`} style={[styles.band, { backgroundColor: block.bgColor }]}>
        {block.sponsored ? <PublicationSponsored color={band.muted} testID={`publication-block-${block.id}-sponsored`} /> : null}
        <View style={styles.titles}>
          <PublicationText testID={`publication-block-${block.id}-title`} variant="h2" color={band.ink} numberOfLines={2} style={[styles.title, heading]}>
            {block.title}
          </PublicationText>
          {subtitle ? (
            <PublicationText variant="body" color={band.muted} numberOfLines={2} style={styles.subtitle}>{subtitle}</PublicationText>
          ) : null}
        </View>
      </View>

      {block.media ? (
        <View style={[styles.mediaBand, { backgroundColor: block.bgColor }]}>
          <View testID={`publication-block-${block.id}-media`} style={[styles.banner, { height: metrics.container.mediaHeight }]}>
            <AppImage uri={mediaUrl(block.media.url)} accessibilityLabel={label} contentFit="cover" style={styles.fill} />
          </View>
        </View>
      ) : null}

      <View testID={`publication-block-${block.id}-panel`} style={[styles.panel, { backgroundColor: block.panelColor }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel={t('publication.products', { title: block.title })}
          testID={`publication-block-${block.id}-row`}
          style={orientation.viewport}
          contentContainerStyle={styles.rowContent}
          decelerationRate="fast"
          snapToInterval={metrics.container.snap}
          snapToAlignment="start"
          disableIntervalMomentum
        >
          {block.products.map((product) => (
            <BlockProductCard
              key={product.id}
              product={product}
              width={metrics.container.cardWidth}
              imageHeight={metrics.container.cardImageHeight}
              railTileStyle={orientation.tile}
              compact
              sponsored={false}
              inks={panel}
              reserveReference={reserveReference}
              onOpen={onOpenProduct}
              testID={`publication-block-${block.id}-product-${product.id}`}
            />
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <PublicationFollow
            look="inline"
            publisherId={block.publisher.id}
            publisherName={block.publisher.name}
            ink={panel.ink}
            muted={panel.muted}
            testID={`publication-block-${block.id}-follow`}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  band: { paddingHorizontal: T.bandInset, paddingTop: T.bandPaddingTop, paddingBottom: T.bandPaddingBottom },
  titles: { gap: 2 },
  subtitle: { fontSize: C.description, lineHeight: C.descriptionLine },
  title: { fontSize: C.title, lineHeight: C.titleLine },
  mediaBand: { paddingHorizontal: T.bandInset, paddingBottom: T.bandPaddingBottom },
  banner: { borderRadius: T.mediaRadius, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  panel: { paddingTop: T.panelPaddingTop, paddingBottom: T.panelPaddingBottom },
  rowContent: { paddingHorizontal: T.bandInset, gap: T.cardSpacing },
  footer: { paddingHorizontal: T.bandInset, paddingTop: T.followTop },
});
