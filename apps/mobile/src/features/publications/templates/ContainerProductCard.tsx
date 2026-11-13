/**
 * Carte produit du modèle `container` (planches Nike / Vans / The North Face) :
 * grande photo qui REMPLIT son cadre arrondi (rayon 12, rapport 1,45), puis sur
 * le panneau coloré quatre niveaux de texte DISTINCTS :
 *
 *   Sponsorisé ⓘ   13/18 régulier, encre secondaire
 *   Marque         15/20 gras
 *   Nom du produit 14/18 régulier, une ligne
 *   Prix           16/22 gras
 *
 * Photo : les photos du catalogue sont toutes au format 2:3 sur le même fond
 * gris très clair (`scripts/normalize-catalogue-images.py`) ; en `cover` dans un
 * cadre 1,45 elles remplissent le cadre sans bandes et sans couper le produit.
 * Le cadre prend ce même gris pendant le chargement. Pas de cœur.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { PUBLICATION_PALETTE as P, PUBLICATION_TYPE, PublicationSponsored, PublicationText } from '../publicationDesign';
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
      <View testID={`${testID}-frame`} style={[styles.frame, { height: imageHeight }]}>
        <AppImage uri={mediaUrl(product.image)} decorative background={P.neutral} contentFit="cover" style={styles.fill} />
      </View>
      <View style={styles.text}>
        {sponsored ? <PublicationSponsored color={inks.muted} /> : null}
        {product.brand ? (
          <PublicationText testID={`${testID}-brand`} variant="bodyStrong" color={inks.ink} numberOfLines={1} style={styles.brand}>
            {product.brand}
          </PublicationText>
        ) : null}
        <PublicationText testID={`${testID}-name`} variant="body" color={inks.ink} numberOfLines={1} style={styles.name}>
          {product.name}
        </PublicationText>
        <PublicationText testID={`${testID}-price`} variant="bodyStrong" color={inks.ink} numberOfLines={1} style={styles.price}>
          {price}
        </PublicationText>
      </View>
    </Pressable>
  );
}

export const ContainerProductCard = memo(ContainerProductCardComponent);

const styles = StyleSheet.create({
  frame: { borderRadius: T.cardRadius, overflow: 'hidden', backgroundColor: P.neutral },
  fill: { width: '100%', height: '100%' },
  text: { paddingTop: 8 },
  brand: { fontSize: PUBLICATION_TYPE.cardBrandSize, lineHeight: PUBLICATION_TYPE.cardBrandLine },
  name: { fontSize: PUBLICATION_TYPE.cardNameSize, lineHeight: PUBLICATION_TYPE.cardNameLine },
  price: { fontSize: PUBLICATION_TYPE.cardPriceSize, lineHeight: PUBLICATION_TYPE.cardPriceLine, paddingTop: 4 },
});
