/**
 * Modèle `container` — planches « Vans », « adidas Performance », « WE Fashion ».
 *
 *   ┌───────────── bandeau (couleur du CRM) ─────────────┐
 *   │ Sponsorisé                                          │
 *   │ Titre                         (deux grandes lignes) │
 *   │ Sous-titre                                          │
 *   ├────────── image large facultative (même fond) ──────┤
 *   ├──── panneau (teinte voisine, calculée ou du CRM) ───┤
 *   │  [carte][carte][▌    ← rangée de cartes produit     │
 *   │  zayrovi team        ← éditeur (à la place de « + Follow ») │
 *   └─────────────────────────────────────────────────────┘
 *
 * Le bouton « + Follow » de la planche n'est PAS repris (aucun bouton
 * d'interaction pour l'instant) ; la carte « Découvrir plus » est reportée.
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { PUBLICATION_PALETTE as P, PublicationText } from '../publicationDesign';
import { blockInks } from './blockColors';
import { ContainerProductCard } from './ContainerProductCard';
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
  const band = blockInks(block.bgColor, P.ink, P.paper);
  const panel = blockInks(block.panelColor, P.ink, P.paper);
  const label = block.subtitle ? `${block.title}. ${block.subtitle}` : block.title;
  return (
    <View testID={`publication-block-${block.id}`} style={styles.block}>
      <View testID={`publication-block-${block.id}-band`} style={[styles.band, { backgroundColor: block.bgColor }]}>
        {block.sponsored ? (
          <PublicationText variant="caption" color={band.muted}>{t('publication.sponsored')}</PublicationText>
        ) : null}
        <View style={styles.titles}>
          <PublicationText variant="h3" color={band.ink} numberOfLines={2}>{block.title}</PublicationText>
          {block.subtitle ? (
            <PublicationText variant="h3" color={band.ink} numberOfLines={2}>{block.subtitle}</PublicationText>
          ) : null}
        </View>
      </View>

      {block.media ? (
        <View style={[styles.mediaBand, { backgroundColor: block.bgColor }]}>
          <View testID={`publication-block-${block.id}-media`} style={{ height: metrics.container.mediaHeight }}>
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
          contentContainerStyle={styles.rowContent}
        >
          {block.products.map((product) => (
            <ContainerProductCard
              key={product.id}
              product={product}
              width={metrics.container.cardWidth}
              imageHeight={metrics.container.cardImageHeight}
              sponsored={block.sponsored}
              inks={panel}
              onOpen={onOpenProduct}
              testID={`publication-block-${block.id}-product-${product.id}`}
            />
          ))}
        </ScrollView>
        <View style={styles.publisher}>
          <PublicationText testID={`publication-block-${block.id}-publisher`} variant="label" color={panel.ink} numberOfLines={1}>
            {block.publisher.name}
          </PublicationText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  band: { paddingHorizontal: T.bandInset, paddingTop: T.bandPaddingTop, paddingBottom: T.bandPaddingBottom },
  titles: { paddingTop: 8 },
  mediaBand: { paddingHorizontal: T.bandInset, paddingBottom: T.bandPaddingBottom },
  fill: { width: '100%', height: '100%' },
  panel: { paddingTop: T.panelPaddingTop, paddingBottom: 24 },
  rowContent: { paddingHorizontal: T.bandInset, gap: T.cardSpacing },
  publisher: { paddingHorizontal: T.bandInset, paddingTop: 24 },
});
