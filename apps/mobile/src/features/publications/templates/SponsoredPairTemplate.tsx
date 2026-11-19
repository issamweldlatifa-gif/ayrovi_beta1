import { distinctPublicationSubtitle, EDITORIAL_CAMPAIGN as C } from '../../../../../../shared/publicationEditorial';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { PUBLICATION_TEMPLATE as T, type PublicationTemplateMetrics } from './templateMetrics';

export function SponsoredPairTemplate({
  block,
  metrics,
  onOpenProduct,
}: {
  block: PublicationBlock;
  metrics: PublicationTemplateMetrics;
  onOpenProduct: (id: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const products = block.products.slice(0, 2);
  const first = products[0];
  if (!first || !block.media) return null;
  const band = blockInks(block.bgColor, P.ink, P.paper);
  const paper = blockInks(P.paper, P.ink, P.paper);
  const heading = { fontFamily: publicationBlockFont(locale, 'heading') };
  const subtitle = distinctPublicationSubtitle(block.title, block.subtitle);
  const label = [block.sponsored ? t('publication.sponsored') : '', block.title, block.subtitle].filter(Boolean).join('. ');
  const direction = theme.isRTL ? 'row-reverse' : 'row';
  const reserveReference = products.some((product) => product.compareAtPrice != null && product.compareAtPrice > product.price);
  return (
    <View testID={`publication-block-${block.id}`} style={styles.block}>
      <View testID={`publication-block-${block.id}-band`} style={[styles.band, { backgroundColor: block.bgColor }]}>
        <View style={styles.bandText}>
          {/* 16/11 : comme les autres modèles, l'éditeur (pastille + nom + « Suivre ») ouvre le
              bloc — sur le bandeau, dans l'encre que sa couleur supporte ; « Sponsorisé » dessous. */}
          <View style={styles.publisher}>
            <PublicationFollow
              look="inline"
              publisherId={block.publisher.id}
              publisherName={block.publisher.name}
              ink={band.ink}
              muted={band.muted}
              testID={`publication-block-${block.id}-follow`}
            />
          </View>
          {block.sponsored ? (
            <PublicationSponsored color={band.muted} testID={`publication-block-${block.id}-sponsored`} />
          ) : null}
          <View style={styles.titles}>
            <PublicationText testID={`publication-block-${block.id}-title`} variant="h2" color={band.ink} numberOfLines={2} style={[styles.title, heading]}>
              {block.title}
            </PublicationText>
            {subtitle ? (
              <PublicationText variant="body" color={band.muted} numberOfLines={2} style={styles.subtitle}>{subtitle}</PublicationText>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          testID={`publication-block-${block.id}-sponsor`}
          onPress={() => onOpenProduct(first.id)}
          style={({ pressed }) => [
            styles.media,
            { width: metrics.pair.mediaWidth, height: metrics.pair.mediaHeight },
            pressed ? { opacity: theme.opacity.subtle } : null,
          ]}
        >
          <AppImage testID={`publication-block-${block.id}-media`} uri={mediaUrl(block.media.url)} decorative contentFit="cover" style={styles.fill} />
        </Pressable>
      </View>

      <View testID={`publication-block-${block.id}-cards`} style={[styles.cards, { flexDirection: direction }]}>
        {products.map((product) => (
          <BlockProductCard
            key={product.id}
            product={product}
            width={metrics.pair.tileWidth}
            imageHeight={metrics.pair.cardImageHeight}
            compact
            sponsored={false}
            inks={paper}
            reserveReference={reserveReference}
            onOpen={onOpenProduct}
            testID={`publication-block-${block.id}-product-${product.id}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  band: { paddingTop: T.bandPaddingTop },
  bandText: { paddingHorizontal: T.bandInset },
  publisher: { paddingBottom: 2 },
  titles: { gap: 2 },
  subtitle: { fontSize: C.description, lineHeight: C.descriptionLine },
  title: { fontSize: C.title, lineHeight: C.titleLine },
  media: { marginTop: T.pairTitleGap, marginBottom: T.bandPaddingBottom, alignSelf: 'center', borderRadius: T.mediaRadius, backgroundColor: P.neutral, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  cards: { paddingHorizontal: T.pairInset, paddingTop: T.pairCardsTop, gap: T.pairSpacing },
});
