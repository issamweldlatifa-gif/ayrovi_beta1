/**
 * Carte produit des blocs Publication — planches GBox du 14/11 (Vans 224048,
 * WE Fashion 224107), relevées au pixel (720 px = 360 dp) :
 *
 *   ╭────────────────────╮
 *   │                 ♡  │  ← 13/11 : cœur NU (trait fin 18 dp, cible 40) — plus de rond blanc sur la photo
 *   │     photo ENTIÈRE  │  ← cadre gris clair, rayon 12, photo en `contain`
 *   │ [Nouveau]          │  ← pastille blanche (produit récent du CRM seulement)
 *   ╰────────────────────╯
 *   Sponsorisé ⓘ           14/20, encre secondaire
 *   Marque                 16/20 GRAS
 *   NOM DU PRODUIT…        16/18 régulier, une ligne
 *   26,00 TND              16/22 régulier
 *   ̶3̶2̶,̶0̶0̶ ̶T̶N̶D̶             13/11 : l'ancien prix sur SA ligne (14/18, gris barré) —
 *                          il ne colle plus au prix et n'est plus coupé « 1357.… »
 *
 * Le même composant sert les TROIS modèles (container, media, duo) : une seule
 * carte, largeur du système de cartes (`src/design/cardSystem.ts`). Le cœur est réel
 * (`PublicationFavorites`) ; sans fournisseur (aperçu isolé) il n'est pas dessiné.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useI18n, useT } from '@/i18n';
import { PUBLICATION_PALETTE as P, PUBLICATION_TYPE as TYPE, PublicationIcon, PublicationSponsored, PublicationText } from '../publicationDesign';
import { usePublicationFavorites } from '../PublicationFavorites';
import { publicationBlockFont } from '../publicationTokens';
import type { BlockInks } from './blockColors';
import { PUBLICATION_TEMPLATE as T } from './templateMetrics';
import { CARD_SYSTEM as C } from '@/design/cardSystem';

/** Cœur fin NU dans le coin haut de la photo (système de cartes, 13/11) : il ne cache pas le produit. */
export function BlockHeart({ product, testID }: { product: LinkedProduct; testID: string }) {
  const theme = useTheme();
  const t = useT();
  const favourites = usePublicationFavorites();
  if (!favourites) return null;
  const active = favourites.isFavorite(product.id);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={active ? t('publication.unfavorite', { name: product.name }) : t('publication.favorite', { name: product.name })}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      onPress={(event) => { event?.stopPropagation?.(); favourites.press(product.id); }}
      style={({ pressed }) => [
        styles.heart,
        theme.isRTL ? styles.heartRTL : styles.heartLTR,
        pressed ? { opacity: theme.opacity.subtle } : null,
      ]}
    >
      <PublicationIcon name={active ? 'heart' : 'heart-outline'} size={C.heartIcon} color={P.ink} />
    </Pressable>
  );
}

function BlockProductCardComponent({
  product,
  width,
  imageHeight,
  sponsored,
  inks,
  onOpen,
  testID,
  reserveReference = false,
}: {
  product: LinkedProduct;
  width: number;
  imageHeight: number;
  sponsored: boolean;
  inks: BlockInks;
  onOpen: (id: string) => void;
  testID: string;
  /** Une voisine a un ancien prix : la ligne est réservée pour garder les cartes alignées. */
  reserveReference?: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const price = formatMoney(product.price);
  const reference = product.compareAtPrice != null && product.compareAtPrice > product.price ? formatMoney(product.compareAtPrice) : null;
  const label = t('publication.productLabel', { brand: product.brand || '', name: product.name, price }).trim();
  const regular = publicationBlockFont(locale, 'regular');
  return (
    <View style={{ width }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
        onPress={() => onOpen(product.id)}
        style={({ pressed }) => (pressed ? { opacity: theme.opacity.subtle } : null)}
      >
        <View testID={`${testID}-frame`} style={[styles.frame, { height: imageHeight }]}>
          <AppImage uri={mediaUrl(product.image)} decorative background={P.neutral} contentFit="contain" style={styles.fill} />
          {product.isNew ? (
            <View testID={`${testID}-new`} style={[styles.badge, theme.isRTL ? styles.badgeRTL : styles.badgeLTR]}>
              <PublicationText variant="body" color={P.ink} numberOfLines={1} style={[styles.badgeText, { fontFamily: regular }]}>
                {t('publication.newBadge')}
              </PublicationText>
            </View>
          ) : null}
        </View>
        <View style={styles.text}>
          {sponsored ? <PublicationSponsored color={inks.muted} /> : null}
          {product.brand ? (
            <PublicationText
              testID={`${testID}-brand`}
              variant="bodyStrong"
              color={inks.ink}
              numberOfLines={1}
              style={[styles.brand, { fontFamily: publicationBlockFont(locale, 'bold') }]}
            >
              {product.brand}
            </PublicationText>
          ) : null}
          <PublicationText testID={`${testID}-name`} variant="body" color={inks.ink} numberOfLines={1} style={[styles.name, { fontFamily: regular }]}>
            {product.name}
          </PublicationText>
          <PublicationText testID={`${testID}-price`} variant="body" color={inks.ink} numberOfLines={1} style={[styles.price, { fontFamily: regular }]}>
            {price}
          </PublicationText>
          {reference ? (
            <PublicationText
              testID={`${testID}-reference`}
              variant="caption"
              color={inks.muted}
              numberOfLines={1}
              style={[styles.reference, styles.struck, { fontFamily: regular }]}
            >
              {reference}
            </PublicationText>
          ) : reserveReference ? (
            <View testID={`${testID}-reference-slot`} style={styles.referenceSlot} />
          ) : null}
        </View>
      </Pressable>
      <BlockHeart product={product} testID={`${testID}-heart`} />
    </View>
  );
}

export const BlockProductCard = memo(BlockProductCardComponent);

const styles = StyleSheet.create({
  frame: { borderRadius: T.cardRadius, overflow: 'hidden', backgroundColor: P.neutral },
  fill: { width: '100%', height: '100%' },
  heart: { position: 'absolute', top: C.heartInset, width: C.heartTarget, height: C.heartTarget, alignItems: 'center', justifyContent: 'center' },
  heartLTR: { right: C.heartInset },
  heartRTL: { left: C.heartInset },
  badge: {
    position: 'absolute',
    bottom: TYPE.badgeInset,
    height: TYPE.badgeHeight,
    paddingHorizontal: 8,
    borderRadius: TYPE.badgeRadius,
    backgroundColor: P.chip,
    justifyContent: 'center',
  },
  badgeLTR: { left: TYPE.badgeInset },
  badgeRTL: { right: TYPE.badgeInset },
  badgeText: { fontSize: TYPE.badgeSize, lineHeight: TYPE.badgeLine },
  text: { paddingTop: TYPE.cardTextTop },
  brand: { fontSize: TYPE.cardBrandSize, lineHeight: TYPE.cardBrandLine },
  name: { fontSize: TYPE.cardNameSize, lineHeight: TYPE.cardNameLine },
  price: { fontSize: TYPE.cardPriceSize, lineHeight: TYPE.cardPriceLine, paddingTop: TYPE.cardPriceTop },
  reference: { fontSize: TYPE.cardSponsoredSize, lineHeight: TYPE.cardReferenceLine },
  referenceSlot: { height: TYPE.cardReferenceLine },
  struck: { textDecorationLine: 'line-through' },
});
