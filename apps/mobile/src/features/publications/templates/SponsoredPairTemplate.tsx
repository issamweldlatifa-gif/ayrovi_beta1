/**
 * Modèle `sponsored_pair` — planches « Fred Perry », « GUESS ».
 *
 *   ┌──────────┐ ┌──────────┐
 *   │  image   │ │  photo   │   ← même hauteur de photo des deux côtés
 *   │          │ │ produit  │
 *   ├──────────┤ ├──────────┤
 *   │Sponsor. ⓘ│ │ marque   │   ← encart coloré (CRM) = hauteur du bloc texte
 *   │ TITRE    │ │ nom      │
 *   │ sous-tit.│ │ prix     │
 *   └──────────┘ └──────────┘
 *
 * La carte de droite EST la carte de grille de l'application (`ProductTile`),
 * et la tuile de gauche reçoit exactement ses cotes (`pairTileMetrics`) : les
 * deux cartes ont la même taille, au point près (consigne du propriétaire).
 * La tuile sponsorisée ouvre le produit associé. Aucun cœur : pas de bouton
 * d'interaction pour l'instant.
 */
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { ProductTile } from '@/design/ProductTile';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { PUBLICATION_PALETTE as P, PublicationSponsored, PublicationText } from '../publicationDesign';
import { blockInks } from './blockColors';
import { pairTileMetrics, PUBLICATION_TEMPLATE as T, type PublicationTemplateMetrics } from './templateMetrics';

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
  const { fontScale } = useWindowDimensions();
  const tile = pairTileMetrics(metrics.pair.tileWidth, fontScale);
  const product = block.products[0];
  const inks = blockInks(block.bgColor, P.ink, P.paper);
  const label = [block.sponsored ? t('publication.sponsored') : '', block.title, block.subtitle].filter(Boolean).join('. ');
  if (!product || !block.media) return null;
  const price = formatMoney(product.price);
  return (
    <View
      testID={`publication-block-${block.id}`}
      style={[styles.pair, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={`publication-block-${block.id}-sponsor`}
        onPress={() => onOpenProduct(product.id)}
        style={({ pressed }) => [
          styles.tile,
          { width: tile.cardWidth, height: tile.height },
          pressed ? { opacity: theme.opacity.subtle } : null,
        ]}
      >
        <View style={{ height: tile.mediaHeight }}>
          <AppImage uri={mediaUrl(block.media.url)} decorative contentFit="cover" style={styles.fill} />
        </View>
        <View
          testID={`publication-block-${block.id}-sponsor-box`}
          style={[styles.box, { height: tile.textHeight, backgroundColor: block.bgColor, paddingHorizontal: tile.inset }]}
        >
          {block.sponsored ? (
            <PublicationSponsored color={inks.muted} testID={`publication-block-${block.id}-sponsored`} />
          ) : (
            <PublicationText variant="caption" color={inks.muted} numberOfLines={1}>{block.publisher.name}</PublicationText>
          )}
          <PublicationText variant="bodyStrong" color={inks.ink} numberOfLines={1}>{block.title}</PublicationText>
          {block.subtitle ? (
            <PublicationText variant="bodySmall" color={inks.ink} numberOfLines={2}>{block.subtitle}</PublicationText>
          ) : null}
        </View>
      </Pressable>
      <View style={[styles.tile, { width: tile.cardWidth, height: tile.height }]}>
        <ProductTile
          testID={`publication-block-${block.id}-product-${product.id}`}
          metrics={tile}
          images={[{ uri: mediaUrl(product.image) }]}
          accessibilityLabel={t('publication.productLabel', { brand: product.brand || '', name: product.name, price }).trim()}
          imageLabel={product.name}
          brand={product.brand || undefined}
          name={product.name}
          price={price}
          onOpen={() => onOpenProduct(product.id)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { paddingHorizontal: T.pairInset, gap: T.pairSpacing },
  tile: { borderRadius: T.cardRadius, overflow: 'hidden', backgroundColor: P.neutral },
  fill: { width: '100%', height: '100%' },
  box: { paddingTop: 12, justifyContent: 'flex-start' },
});
