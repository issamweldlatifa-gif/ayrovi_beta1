/**
 * Modèle `container` — planches « Nike Hybrid RN », « Vans », « The North Face ».
 *
 *   ┌───────────── bandeau (couleur du CRM) ─────────────┐
 *   │ Sponsorisé ⓘ                                        │
 *   │ Titre                       (gros, gras, 2 lignes)  │
 *   │ Sous-titre                                          │
 *   ├────────── image large facultative (même fond) ──────┤
 *   ├──── panneau (teinte voisine, calculée ou du CRM) ───┤
 *   │  [carte][carte][▌    ← rangée de cartes produit     │
 *   │  (+ Suivre)  zayrovi team                           │
 *   └─────────────────────────────────────────────────────┘
 *
 * 13/11 : « + Suivre » ajouté (consigne du propriétaire), titre agrandi et en
 * gras, bandeau resserré. La carte « Découvrir plus » reste reportée.
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { PublicationFollow } from '../PublicationFollow';
import { PUBLICATION_PALETTE as P, PUBLICATION_TYPE, PublicationSponsored, PublicationText } from '../publicationDesign';
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
        {block.sponsored ? <PublicationSponsored color={band.muted} testID={`publication-block-${block.id}-sponsored`} /> : null}
        <View style={styles.titles}>
          <PublicationText testID={`publication-block-${block.id}-title`} variant="h2" color={band.ink} numberOfLines={2} style={styles.title}>
            {block.title}
          </PublicationText>
          {block.subtitle ? (
            <PublicationText variant="h2" color={band.ink} numberOfLines={2} style={styles.title}>{block.subtitle}</PublicationText>
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
        <View style={styles.footer}>
          <PublicationFollow
            look="pill"
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
  titles: { paddingTop: 8 },
  title: { fontSize: PUBLICATION_TYPE.bandTitleSize, lineHeight: PUBLICATION_TYPE.bandTitleLine },
  mediaBand: { paddingHorizontal: T.bandInset, paddingBottom: T.bandPaddingBottom },
  fill: { width: '100%', height: '100%' },
  panel: { paddingTop: T.panelPaddingTop, paddingBottom: T.panelPaddingBottom },
  rowContent: { paddingHorizontal: T.bandInset, gap: T.cardSpacing },
  footer: { paddingHorizontal: T.bandInset, paddingTop: T.followTop },
});
