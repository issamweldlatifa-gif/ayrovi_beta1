/**
 * Photo produit de la rangée du modèle `media` : la planche ne montre que la
 * photo (rapport 1,45, coins arrondis). Le nom, la marque et le prix restent
 * lus par les lecteurs d'écran ; l'appui ouvre la fiche produit de l'application.
 * Pas de cœur : aucun bouton d'interaction pour l'instant (consigne du 13/11).
 */
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { PUBLICATION_PALETTE as P } from '../publicationDesign';
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={() => onOpen(product.id)}
      style={({ pressed }) => [styles.tile, { width, height }, pressed ? { opacity: theme.opacity.subtle } : null]}
    >
      <AppImage uri={mediaUrl(product.image)} decorative contentFit="cover" style={styles.fill} />
    </Pressable>
  );
}

export const RowProductTile = memo(RowProductTileComponent);

const styles = StyleSheet.create({
  tile: { borderRadius: T.mediaRadius, overflow: 'hidden', backgroundColor: P.neutral },
  fill: { width: '100%', height: '100%' },
});
