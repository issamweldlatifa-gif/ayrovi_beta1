/**
 * Photo produit de la rangée du modèle `media` (planche GBox The Ordinary, 14/11) :
 * cadre gris clair arrondi, photo ENTIÈRE (`contain`), rapport 1,44, et le rond
 * blanc du cœur (32 dp, à 8 dp du coin) relié aux vrais favoris. Le nom, la marque
 * et le prix restent lus par les lecteurs d'écran ; l'appui ouvre la fiche produit.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { PUBLICATION_PALETTE as P } from '../publicationDesign';
import { BlockHeart } from './BlockProductCard';
import { PUBLICATION_TEMPLATE as T } from './templateMetrics';

function RowProductTileComponent({
  product,
  width,
  height,
  onOpen,
  testID,
}: {
  product: LinkedProduct;
  width: number;
  height: number;
  onOpen: (id: string) => void;
  testID: string;
}) {
  const theme = useTheme();
  const t = useT();
  const label = t('publication.productLabel', {
    brand: product.brand || '',
    name: product.name,
    price: formatMoney(product.price),
  }).trim();
  return (
    <View style={[styles.tile, { width, height }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
        onPress={() => onOpen(product.id)}
        style={({ pressed }) => [styles.fill, pressed ? { opacity: theme.opacity.subtle } : null]}
      >
        <AppImage uri={mediaUrl(product.image)} decorative background={P.neutral} contentFit="contain" style={styles.fill} />
      </Pressable>
      <BlockHeart product={product} small testID={`${testID}-heart`} />
    </View>
  );
}

export const RowProductTile = memo(RowProductTileComponent);

const styles = StyleSheet.create({
  tile: { borderRadius: T.mediaRadius, overflow: 'hidden', backgroundColor: P.neutral },
  fill: { width: '100%', height: '100%' },
});
