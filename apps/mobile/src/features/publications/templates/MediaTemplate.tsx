/**
 * Modèle `media` — planches « Felix Hardy », « Tommy Hilfiger », « sascha.xtz ».
 *
 *   zayrovi team • Suivre              ← éditeur + « Suivre » (même relation que les Reels)
 *   Sponsorisé ⓘ                       ← seulement si le CRM le coche
 *   ┌──────────────────────────────┐
 *   │   image (≈ 2:1) ou vidéo 1:1  │   ← même modèle pour les deux
 *   └──────────────────────────────┘
 *   [■][■][■][▌                         ← rangée de photos produit qui défile
 *   Titre                              ← gras, 2 lignes max
 *   Sous-titre                         ← régulier, 2 lignes max
 *
 * 13/11 : « Suivre » ajouté (consigne du propriétaire). Ni cœur ni « ⋯ » : aucune
 * action réelle derrière pour l'instant. La carte « Découvrir plus » est reportée.
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { PublicationFollow } from '../PublicationFollow';
import { PUBLICATION_PALETTE as P, PublicationSponsored, PublicationText } from '../publicationDesign';
import { blockInks, hasTintedBackground } from './blockColors';
import { PublicationVideo } from './PublicationVideo';
import { RowProductTile } from './RowProductTile';
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
  const height = video ? metrics.media.videoHeight : metrics.media.imageHeight;
  const label = block.subtitle ? `${block.title}. ${block.subtitle}` : block.title;

  return (
    <View
      testID={`publication-block-${block.id}`}
      style={[styles.block, { backgroundColor: block.bgColor }, tinted ? styles.tinted : null]}
    >
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
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={t('publication.products', { title: block.title })}
        testID={`publication-block-${block.id}-row`}
        style={styles.row}
        contentContainerStyle={styles.rowContent}
      >
        {block.products.map((product) => (
          <RowProductTile
            key={product.id}
            product={product}
            width={metrics.media.tileWidth}
            height={metrics.media.tileHeight}
            onOpen={onOpenProduct}
            testID={`publication-block-${block.id}-product-${product.id}`}
          />
        ))}
      </ScrollView>

      <View style={styles.caption}>
        <PublicationText variant="bodyStrong" color={inks.ink} numberOfLines={2}>{block.title}</PublicationText>
        {block.subtitle ? (
          <PublicationText variant="body" color={inks.ink} numberOfLines={2}>{block.subtitle}</PublicationText>
        ) : null}
      </View>
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
  // La rangée est rognée sur le même retrait que le média (planche : x = 24 px des deux côtés).
  row: { marginHorizontal: T.mediaInset, marginTop: T.rowSpacing, flexGrow: 0 },
  rowContent: { gap: T.rowSpacing },
  caption: { paddingHorizontal: T.mediaInset, paddingTop: 8 },
});
