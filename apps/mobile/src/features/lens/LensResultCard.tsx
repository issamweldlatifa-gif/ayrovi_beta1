import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensCandidate } from '@/api/lens';
import { LensResultMedia } from './LensResultMedia';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { ProductTile, productTileTextStyle, type ProductTileBadge, type ProductTileImage } from '@/design/ProductTile';
import { PRODUCT_TILE, productTileImages, type ProductTileMetrics } from '@/design/productTile';
import { formatAmount, formatMoney } from '@/format/money';
import { lensMediaChain } from './lensMedia';
import { LENS_COLORS } from './lensPalette';
import { productTitle } from './lensTitle';
import { pricePresentation } from './lensView';

type Props = {
  candidate: LensCandidate;
  favorite: boolean;
  onOpen: (candidate: LensCandidate) => void;
  onFavorite: (candidate: LensCandidate) => void;
  /** Cotes de la grille (`productTileMetrics`), identiques pour toutes les cartes. */
  metrics: ProductTileMetrics;
};

/**
 * Carte résultat Lens — la carte produit de grille partagée (`ProductTile`).
 *
 * 13/11/2026 : mêmes cotes que la boutique, mesurées sur la vidéo de référence
 * (`@/design/productTile.ts`). La vignette garde le 2/3 de Lens (`lensCard.ts`,
 * le même rapport), mais :
 *  • les photos du marchand défilent au doigt DANS la carte, points SOUS la photo
 *    (plus de pastille de points posée sur le produit) ;
 *  • les lignes sont fixes : boutique · titre produit (1 ligne) · prix de
 *    référence barré et remise — ou la note du marchand — · prix courant. Deux
 *    voisines ont la même hauteur, leurs prix sont sur la même ligne ;
 *  • grandes / petites photos : la grille transmet les cotes (`metrics`).
 *
 * Ce qui ne change pas : surface blanche même en mode sombre, titre PRODUIT et
 * pas titre de page (28/10/2026), cœur NU sur la vignette (17/10/2026), rouge
 * réservé aux baisses de prix, étoile noire, carte qui ouvre le produit.
 */
function LensResultCardComponent({ candidate, favorite, onOpen, onFavorite, metrics }: Props) {
  const theme = useTheme();
  const t = useT();
  const intro = useRef(new Animated.Value(theme.motion.reduced === 0 ? 1 : 0)).current;
  const brand = candidate.brand?.trim() || candidate.source.trim();
  /* Titre PRODUIT, pas titre de page (28/10/2026) : la boutique est déjà écrite
     en gras juste au-dessus, inutile de la répéter dans le titre. */
  const title = productTitle(candidate.title, candidate);
  /* Photos du marchand = pages de la galerie. Les adresses de repli (proxy,
     autre format) restent des replis de LA MÊME photo, jamais des pages. */
  const images = useMemo<ProductTileImage[]>(
    () => productTileImages(candidate.image, candidate.images).map((uri) => ({ uri })),
    [candidate.image, candidate.images],
  );

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: theme.motion.reduced === 0 ? 0 : theme.duration.standard,
      useNativeDriver: true,
    }).start();
  }, [intro, theme.duration.standard, theme.motion.reduced]);

  const rise = intro.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const scale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });
  const promo = candidate.promo?.label?.trim() || (candidate.promo ? t('lens.promo') : '');
  const badges = useMemo<ProductTileBadge[]>(() => (promo ? [{ label: promo, tone: 'sale' }] : []), [promo]);

  /* Prix client : montant courant, référence barrée et réduction — rien de plus. */
  const view = pricePresentation(candidate);
  const currentText = view.current.kind === 'tnd'
    ? formatMoney(view.current.amount)
    : view.current.kind === 'original'
      ? `${formatAmount(view.current.amount)} ${view.current.currency}`
      : view.current.kind === 'none' ? '' : t('lens.priceUnpublished');
  const discounted = view.referenceTnd != null && view.discountPercent != null && view.discountPercent > 0;
  const metaStyle = [productTileTextStyle('meta', metrics), { fontFamily: theme.font('regular') }];
  const rating = candidate.ratingKind === 'merchant' && candidate.rating != null ? candidate.rating : null;

  const meta = view.referenceTnd != null ? (
    <View style={[styles.metaRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} testID={`lens-result-${candidate.id}-reference`}>
      <AppText numberOfLines={1} color={LENS_COLORS.resultMuted} maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale} style={[...metaStyle, styles.struck]}>
        {formatMoney(view.referenceTnd)}
      </AppText>
      {discounted ? (
        <AppText numberOfLines={1} color={LENS_COLORS.sale} maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale} style={[productTileTextStyle('meta', metrics), { fontFamily: theme.font('semibold') }]}>
          {`−${view.discountPercent}%`}
        </AppText>
      ) : null}
    </View>
  ) : rating != null ? (
    <View style={[styles.metaRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} testID={`lens-result-${candidate.id}-rating`}>
      <Ionicons name="star" size={theme.iconSize.xs} color={LENS_COLORS.star} accessibilityElementsHidden />
      <AppText numberOfLines={1} color={LENS_COLORS.black} maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale} style={[productTileTextStyle('meta', metrics), { fontFamily: theme.font('semibold') }]}>
        {rating.toFixed(1)}
      </AppText>
      {candidate.ratingCount ? (
        <AppText numberOfLines={1} color={LENS_COLORS.resultMuted} maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale} style={metaStyle}>
          {`(${candidate.ratingCount})`}
        </AppText>
      ) : null}
    </View>
  ) : null;

  const price = currentText ? (
    <AppText
      numberOfLines={1}
      color={discounted ? LENS_COLORS.sale : LENS_COLORS.black}
      maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale}
      style={[productTileTextStyle('price', metrics), { fontFamily: theme.font('semibold') }]}
      testID="lens-price-block"
    >
      {currentText}
    </AppText>
  ) : null;

  const open = useCallback(() => onOpen(candidate), [onOpen, candidate]);
  const renderImage = useCallback((image: ProductTileImage, index: number) => (
    <LensResultMedia
      key={image.uri}
      sources={lensMediaChain(image.uri, 'card')}
      title={title}
      // Sa propre zone d'appui (avec « Réessayer ») : elle ouvre le même produit.
      onOpen={open}
      testID={`lens-result-${candidate.id}-image-${index}`}
    />
  ), [candidate.id, open, title]);

  return (
    <Animated.View style={{ opacity: intro, transform: [{ translateY: rise }, { scale }] }}>
      <ProductTile
        testID={`lens-result-${candidate.id}`}
        metrics={metrics}
        images={images}
        accessibilityLabel={t('lens.viewProduct', { title })}
        imageLabel={title}
        brand={brand}
        name={title}
        meta={meta}
        price={price}
        badges={badges}
        onWhite
        onOpen={open}
        renderImage={renderImage}
        favorite={{
          active: favorite,
          // Un favori enregistré ne se retire pas d'ici : le cœur coché reste coché.
          disabled: favorite,
          onPress: () => { if (!favorite) onFavorite(candidate); },
          label: favorite ? t('lens.favorited') : t('lens.favorite'),
          testID: `lens-favorite-${candidate.id}`,
        }}
      />
    </Animated.View>
  );
}

export const LensResultCard = memo(LensResultCardComponent);

const styles = StyleSheet.create({
  metaRow: { flex: 1, alignItems: 'center', gap: 4, minWidth: 0 },
  struck: { textDecorationLine: 'line-through' },
});
