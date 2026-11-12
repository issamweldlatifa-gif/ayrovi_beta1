/**
 * Carte produit du modèle `container` (planches Vans / adidas) : photo dans un
 * cadre blanc arrondi (rayon 12, rapport 1,45), puis sur le panneau coloré :
 * « Sponsorisé » (si coché), marque en gras, nom sur une ligne, prix.
 * Les couleurs du texte suivent le panneau (encre la plus lisible).
 * Pas de cœur ni de pastilles : aucun bouton d'interaction pour l'instant.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { PUBLICATION_PALETTE as P, PublicationText } from '../publicationDesign';
import type { BlockInks } from './blockColors';
import { PUBLICATION_TEMPLATE as T } from './templateMetrics';

function ContainerProductCardComponent({
  product,
  width,
  imageHeight,
  sponsored,
  inks,
  onOpen,
  testID,
}: {
  product: LinkedProduct;
  width: number;
  imageHeight: number;
  sponsored: boolean;
  inks: BlockInks;
  onOpen: (id: string) => void;
  testID: string;
}) {
  const theme = useTheme();
  const t = useT();
  const price = formatMoney(product.price);
  const label = t('publication.productLabel', { brand: product.brand || '', name: product.name, price }).trim();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={() => onOpen(product.id)}
      style={({ pressed }) => [{ width }, pressed ? { opacity: theme.opacity.subtle } : null]}
    >
      <View style={[styles.frame, { height: imageHeight }]}>
        <AppImage uri={mediaUrl(product.image)} decorative contentFit="contain" style={styles.fill} />
      </View>
      <View style={styles.text}>
        {sponsored ? (
          <PublicationText variant="caption" color={inks.muted} numberOfLines={1}>{t('publication.sponsored')}</PublicationText>
        ) : null}
        {product.brand ? (
          <PublicationText variant="bodyStrong" color={inks.ink} numberOfLines={1}>{product.brand}</PublicationText>
        ) : null}
        <PublicationText variant="bodySmall" color={inks.ink} numberOfLines={1}>{product.name}</PublicationText>
        <PublicationText variant="bodySmall" color={inks.ink} numberOfLines={1}>{price}</PublicationText>
      </View>
    </Pressable>
  );
}

export const ContainerProductCard = memo(ContainerProductCardComponent);

const styles = StyleSheet.create({
  frame: { borderRadius: T.cardRadius, overflow: 'hidden', backgroundColor: P.paper },
  fill: { width: '100%', height: '100%' },
  text: { paddingTop: 8 },
});
