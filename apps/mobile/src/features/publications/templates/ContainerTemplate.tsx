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
 * gras, bandeau resserré.
 * 14/11 (planche GBox Vans) : cartes `BlockProductCard` — cadre gris arrondi,
 * photo ENTIÈRE, rond blanc du cœur, texte sous le cadre ; titre du bandeau en
 * Zalando Sans « Heading » ; la rangée s'aimante carte par carte.
 * 13/11 (captures 073653/073658) : SYSTÈME DE CARTES — deux cartes ENTIÈRES qui
 * se partagent l'écran à parts égales (12 · carte · 8 · carte · 12) ; titre,
 * cartes et « Suivre » sur la même marge ; la rangée s'arrête toujours sur la
 * marge (aimantation d'une carte, sans élan qui saute une carte).
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { useI18n, useT } from '@/i18n';
import { PublicationFollow } from '../PublicationFollow';
import { PUBLICATION_PALETTE as P, PUBLICATION_TYPE, PublicationSponsored, PublicationText } from '../publicationDesign';
import { publicationBlockFont } from '../publicationTokens';
import { blockInks } from './blockColors';
import { BlockProductCard } from './BlockProductCard';
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
  const { locale } = useI18n();
  const heading = { fontFamily: publicationBlockFont(locale, 'heading') };
  const band = blockInks(block.bgColor, P.ink, P.paper);
  const panel = blockInks(block.panelColor, P.ink, P.paper);
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
          {block.subtitle ? (
            <PublicationText variant="h2" color={band.ink} numberOfLines={2} style={[styles.title, heading]}>{block.subtitle}</PublicationText>
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
              sponsored={block.sponsored}
              inks={panel}
              reserveReference={reserveReference}
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
