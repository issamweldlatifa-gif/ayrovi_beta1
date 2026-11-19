/**
 * Modèle `media` — planches « Felix Hardy », « Tommy Hilfiger », « sascha.xtz ».
 *
 *   Sponsorisé ⓘ                       ← seulement si le CRM le coche
 *   ┌──────────────────────────────┐
 *   │ (Z) zayrovi team   ( Suivre ) │   ← 15/11 : posé SUR le média, comme Instagram
 *   │   image (≈ 2:1) ou vidéo 1:1  │   ← même modèle pour les deux
 *   └──────────────────────────────┘
 *   Titre                              ← gras, 2 lignes max
 *   Sous-titre                         ← régulier, 2 lignes max
 *   [ carte ][ carte ] ou [ carte ][ carte ][ carte ]
 *
 * 19/11 : une collection de 3+ produits utilise une rangée compacte et un
 * visuel photo 4:3 ; les vidéos restent carrées et les petites sélections
 * gardent la carte large. Les photos produit restent entières (`contain`).
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { editorialRailMetrics } from '@/design/cardSystem';
import { RHYTHM, veil } from '@/design/tokens.mobile';
import { FOLLOW_ON_MEDIA, PublicationFollow } from '../PublicationFollow';
import { PUBLICATION_PALETTE as P, PublicationSponsored, PublicationText } from '../publicationDesign';
import { blockInks, hasTintedBackground } from './blockColors';
import { PublicationVideo } from './PublicationVideo';
import { BlockProductCard } from './BlockProductCard';
import { PUBLICATION_TEMPLATE as T, type PublicationTemplateMetrics } from './templateMetrics';
import { useT } from '@/i18n';

export function MediaTemplate({
  block,
  metrics,
  active,
  onOpenProduct,
}: {
  block: PublicationBlock;
  metrics: PublicationTemplateMetrics;
  active: boolean;
  onOpenProduct: (id: string) => void;
}) {
  const t = useT();
  const inks = blockInks(block.bgColor, P.ink, P.paper);
  const tinted = hasTintedBackground(block.bgColor);
  const media = block.media;
  const video = media?.type === 'video';
  const collection = block.products.length >= 3;
  const rail = collection ? editorialRailMetrics(metrics.width, block.products.length) : null;
  const height = video ? metrics.media.videoHeight
    : collection ? Math.round(metrics.media.width / T.collectionImageAspect) : metrics.media.imageHeight;
  const label = block.subtitle ? `${block.title}. ${block.subtitle}` : block.title;
  const reserveReference = block.products.some((product) => product.compareAtPrice != null && product.compareAtPrice > product.price);

  return (
    <View
      testID={`publication-block-${block.id}`}
      style={[styles.block, { backgroundColor: block.bgColor }, tinted ? styles.tinted : null]}
    >
      {media ? (
        block.sponsored ? (
          <View style={styles.head}>
            <PublicationSponsored color={inks.muted} testID={`publication-block-${block.id}-sponsored`} />
          </View>
        ) : null
      ) : (
        <View style={styles.head}>
          <PublicationFollow
            look="inline"
            publisherId={block.publisher.id}
            publisherName={block.publisher.name}
            ink={inks.ink}
            muted={inks.muted}
            testID={`publication-block-${block.id}-follow`}
          />
          {block.sponsored ? <PublicationSponsored color={inks.muted} testID={`publication-block-${block.id}-sponsored`} /> : null}
        </View>
      )}

      {media ? (
        <View testID={`publication-block-${block.id}-media`} style={[styles.media, { height }]}>
          {video ? (
            <PublicationVideo
              uri={media.url}
              poster={media.poster}
              active={active}
              label={label}
              testID={`publication-block-${block.id}-video`}
            />
          ) : (
            <AppImage uri={mediaUrl(media.url)} accessibilityLabel={label} contentFit="cover" style={styles.fill} />
          )}
          {/* 15/11 (Instagram 002046) : éditeur + « Suivre » posés EN HAUT du média, blanc sur voile dégradé. */}
          <View pointerEvents="box-none" style={styles.overlay} testID={`publication-block-${block.id}-follow-overlay`}>
            <LinearGradient
              pointerEvents="none"
              colors={[FOLLOW_ON_MEDIA.scrim, veil(0)]}
              style={StyleSheet.absoluteFill}
            />
            <PublicationFollow
              look="media"
              publisherId={block.publisher.id}
              publisherName={block.publisher.name}
              ink={inks.ink}
              muted={inks.muted}
              testID={`publication-block-${block.id}-follow`}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.caption}>
        <PublicationText variant={collection ? "h3" : "bodyStrong"} color={inks.ink} numberOfLines={2}>{block.title}</PublicationText>
        {block.subtitle ? (
          <PublicationText variant="body" color={inks.muted} numberOfLines={2}>{block.subtitle}</PublicationText>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={t('publication.products', { title: block.title })}
        testID={`publication-block-${block.id}-row`}
        style={[styles.row, collection && styles.collectionViewport]}
        contentContainerStyle={collection ? styles.collectionTrack : styles.rowContent}
        decelerationRate="fast"
        snapToInterval={rail?.snap ?? metrics.container.snap}
        snapToAlignment="start"
        disableIntervalMomentum
      >
        {block.products.map((product) => (
          <BlockProductCard
            key={product.id}
            product={product}
            width={rail?.cardWidth ?? metrics.media.tileWidth}
            imageHeight={rail?.imageHeight ?? metrics.media.tileHeight}
            compact={collection}
            sponsored={false}
            inks={inks}
            reserveReference={reserveReference}
            onOpen={onOpenProduct}
            testID={`publication-block-${block.id}-product-${product.id}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  tinted: { paddingVertical: 16 },
  head: { paddingHorizontal: T.mediaInset, paddingBottom: 8 },
  media: {
    marginHorizontal: T.mediaInset,
    borderRadius: T.mediaRadius,
    overflow: 'hidden',
    backgroundColor: P.neutral,
  },
  fill: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
  },
  // La rangée part de la même marge que le média et la légende.
  row: { marginTop: T.rowSpacing, flexGrow: 0 },
  collectionViewport: { marginHorizontal: T.mediaInset },
  collectionTrack: { gap: T.cardSpacing },
  rowContent: { paddingHorizontal: T.mediaInset, gap: T.cardSpacing },
  caption: { paddingHorizontal: T.mediaInset, paddingTop: RHYTHM.related, gap: RHYTHM.inline },
});
