/** Compact presentation of a genuine linked catalogue product. No parallel cart or pricing logic. */
import { Pressable, StyleSheet, View } from 'react-native';
import { NavigationIcon as Ionicons } from '@/design/NavigationIcon';
import { router } from 'expo-router';
import type { LinkedProduct } from '@/api/linkedProduct';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import {
  PUBLICATION_THEME as P,
  ICON_SIZE,
  RADIUS,
} from '@/design/tokens.mobile';
import { formatAmount } from '@/format/money';
import { useI18n } from '@/i18n';
export function PublicationProductLink({
  product,
  onOpen,
  outlined = false,
  tile = false,
  favorite = false,
  onFavorite,
}: {
  product: LinkedProduct;
  onOpen?: () => void;
  outlined?: boolean;
  tile?: boolean;
  favorite?: boolean;
  onFavorite?: () => void;
}) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  return (
    <View
      style={
        !tile && onFavorite
          ? { flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center' }
          : undefined
      }
    >
      <Pressable
        testID={`publication-product-${product.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${ar ? 'عرض المنتج' : 'Voir le produit'} ${
          product.name
        }`}
        onPress={
          onOpen ||
          (() =>
            router.push({
              pathname: '/product/[id]',
              params: { id: product.id },
            }))
        }
        style={[
          tile ? styles.tile : styles.row,
          !tile && onFavorite ? { flex: 1 } : undefined,
          {
            flexDirection: tile ? 'column' : ar ? 'row-reverse' : 'row',
            alignItems: tile ? 'stretch' : 'center',
            borderTopWidth: tile ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View
          testID={`publication-product-image-${product.id}`}
          style={tile ? styles.tileImage : styles.image}
        >
          {product.image ? (
            <AppImage
              background={tile ? null : undefined}
              uri={mediaUrl(product.image)}
              style={styles.fill}
              contentFit="contain"
              decorative
            />
          ) : null}
        </View>
        <View style={tile ? styles.tileCopy : styles.copy}>
          {product.brand && !outlined ? (
            <AppText variant="caption" color={P.muted} numberOfLines={1}>
              {product.brand}
            </AppText>
          ) : null}
          <AppText variant="captionStrong" color={P.ink} numberOfLines={2}>
            {product.name}
          </AppText>
          {outlined && product.brand ? (
            <AppText variant="caption" color={P.muted} numberOfLines={1}>
              {product.brand}
            </AppText>
          ) : null}
          {Number.isFinite(product.price) && product.price > 0 ? (
            <AppText variant="caption" color={P.ink}>
              {formatAmount(product.price)} {product.currency}
            </AppText>
          ) : null}
        </View>
        {!tile ? (
          outlined ? (
            <View
              style={{
                minHeight: 36,
                borderWidth: 1,
                borderColor: P.line,
                borderRadius: RADIUS.md,
                paddingHorizontal: 12,
                justifyContent: 'center',
              }}
            >
              <AppText variant="captionStrong" color={P.ink}>
                {ar ? 'عرض المنتج' : 'Voir le produit'}
              </AppText>
            </View>
          ) : (
            <>
              <AppText variant="captionStrong" color={P.accent}>
                {ar ? 'عرض' : 'Voir'}
              </AppText>
              <Ionicons
                name={ar ? 'chevron-back' : 'chevron-forward'}
                size={ICON_SIZE.sm}
                color={P.accent}
              />
            </>
          )
        ) : null}
      </Pressable>
      {onFavorite ? (
        <View
          pointerEvents="box-none"
          style={
            tile
              ? [
                  StyleSheet.absoluteFill,
                  { alignItems: 'flex-end', padding: 4 },
                ]
              : { width: 44, alignItems: 'center' }
          }
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${
              favorite
                ? ar
                  ? 'إلغاء حفظ المنتج'
                  : 'Retirer le produit des favoris'
                : ar
                ? 'حفظ المنتج'
                : 'Enregistrer le produit'
            } ${product.name}`}
            accessibilityState={{ selected: favorite }}
            onPress={(event) => {
              event?.stopPropagation();
              onFavorite();
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: RADIUS.full,
              backgroundColor: P.paper,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={ICON_SIZE.md}
              color={P.ink}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: P.line,
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: P.neutral,
  },
  tile: { paddingVertical: 8, gap: 8, alignItems: 'stretch' },
  tileImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: P.neutral,
  },
  tileCopy: { gap: 2 },
  fill: { width: '100%', height: '100%' },
  copy: { flex: 1, gap: 2 },
});
