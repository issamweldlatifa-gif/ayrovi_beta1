import { EDITORIAL_FEED, EDITORIAL_CAMPAIGN } from '../../../../../../shared/publicationEditorial';
import { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useI18n, useT } from '@/i18n';
import { PUBLICATION_PALETTE as P, PUBLICATION_TYPE as TYPE, PublicationSponsored, PublicationText } from '../publicationDesign';
import { usePublicationFavorites } from '../PublicationFavorites';
import { publicationBlockFont } from '../publicationTokens';
import type { BlockInks } from './blockColors';
import { PUBLICATION_TEMPLATE as T } from './templateMetrics';
import { CARD_SYSTEM as C } from '@/design/cardSystem';
import { FavoriteDiscGlyph } from '@/design/FavoriteDisc';

/** Cœur dans un rond blanc au coin haut de la photo (modèle du 15/11, capture 004641). */
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
      <FavoriteDiscGlyph active={active} />
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
  compact = false,
  photoOnly = false,
  railTileStyle,
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
  compact?: boolean;
  photoOnly?: boolean;
  railTileStyle?: ViewStyle;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const price = formatMoney(product.price);
  const reference = product.compareAtPrice != null && product.compareAtPrice > product.price ? formatMoney(product.compareAtPrice) : null;
  const label = t('publication.productLabel', { brand: product.brand || '', name: product.name, price }).trim();
  const regular = publicationBlockFont(locale, 'regular');
  return (
    <View style={[{ width }, railTileStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={photoOnly ? [product.brand, product.name].filter(Boolean).join(' ') : label}
        testID={testID}
        onPress={() => onOpen(product.id)}
        style={({ pressed }) => (pressed ? { opacity: theme.opacity.subtle } : null)}
      >
        <View testID={`${testID}-frame`} style={[styles.frame, { height: imageHeight, borderRadius: photoOnly ? EDITORIAL_FEED.radius : EDITORIAL_CAMPAIGN.radius }]}>
          <AppImage uri={mediaUrl(product.image)} decorative background={P.neutral} contentFit="contain" style={styles.fill} />
          {product.isNew && !photoOnly ? (
            <View testID={`${testID}-new`} style={[styles.badge, theme.isRTL ? styles.badgeRTL : styles.badgeLTR]}>
              <PublicationText variant="body" color={P.ink} numberOfLines={1} style={[styles.badgeText, { fontFamily: regular }]}>
                {t('publication.newBadge')}
              </PublicationText>
            </View>
          ) : null}
        </View>
        {!photoOnly ? <View style={styles.text}>
          {sponsored ? <PublicationSponsored color={inks.muted} /> : null}
          {product.brand ? (
            <PublicationText
              testID={`${testID}-brand`}
              variant="bodyStrong"
              color={inks.ink}
              numberOfLines={1}
              style={[styles.brand, compact && styles.compactStrong, { fontFamily: publicationBlockFont(locale, 'bold') }]}
            >
              {product.brand}
            </PublicationText>
          ) : null}
          <PublicationText testID={`${testID}-name`} variant="body" color={inks.ink} numberOfLines={1} style={[styles.name, compact && styles.compactCopy, { fontFamily: regular }]}>
            {product.name}
          </PublicationText>
          <PublicationText testID={`${testID}-price`} variant="body" color={inks.ink} numberOfLines={1} style={[styles.price, compact && styles.compactStrong, { fontFamily: regular }]}>
            {price}
          </PublicationText>
          {reference ? (
            <PublicationText
              testID={`${testID}-reference`}
              variant="caption"
              color={inks.muted}
              numberOfLines={1}
              style={[styles.reference, compact && styles.compactCopy, styles.struck, { fontFamily: regular }]}
            >
              {reference}
            </PublicationText>
          ) : reserveReference ? (
            <View testID={`${testID}-reference-slot`} style={[styles.referenceSlot, compact && styles.compactReferenceSlot]} />
          ) : null}
        </View> : null}
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
    maxWidth: '90%',
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
  compactStrong: { fontSize: TYPE.cardCompactStrongSize, lineHeight: TYPE.cardCompactStrongLine },
  compactCopy: { fontSize: TYPE.cardCompactCopySize, lineHeight: TYPE.cardCompactCopyLine },
  compactReferenceSlot: { height: TYPE.cardCompactCopyLine },
  struck: { textDecorationLine: 'line-through' },
});
