/**
 * Carte produit de grille — UN composant pour toutes les grilles produits
 * (boutique, résultats Lens). Cotes et règles : `./productTile.ts`, mesurées sur
 * la vidéo de référence du 12/11/2026.
 *
 * Anatomie (de haut en bas, hauteurs fixes) :
 *
 *   ┌──────────────────────┐
 *   │  photo 2:3           │  ← défile au doigt ; pastilles au ras du bord en bas ;
 *   │                (♡)   │    cœur en haut (s'il est fourni)
 *   ├──────────────────────┤
 *   │ ● ○ ○ ○ ○ ○          │  ← points SOUS la photo (rangée gardée même sans galerie)
 *   │ Marque               │  ← 1 ligne, gras
 *   │ NOM DU PRODUIT…      │  ← 1 ligne
 *   │ ligne d'info         │  ← 1 ligne (prix barré, stock, note…) — gardée vide sinon
 *   │ 30,90 TND        [+] │  ← prix gras + action éventuelle (panier)
 *   └──────────────────────┘
 *
 * Ce que la carte ne fait jamais :
 *  • changer de hauteur selon son contenu (une ligne absente garde sa place) ;
 *  • inventer une photo, un prix ou une marque : elle affiche ce qu'on lui donne ;
 *  • ouvrir autre chose que ce que l'écran décide (`onOpen(photo)`).
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppImage } from './appImage';
import { AppText } from './ui';
import { useTheme } from './theme';
import { rowDirectionFor } from './layoutLogic';
import { FICHE_COLORS, LENS_COLORS, ficheColorsFor } from './tokens.mobile';
import {
  PRODUCT_TILE,
  productTileDotWindow,
  productTilePageAt,
  type ProductTileMetrics,
} from './productTile';
import { useT } from '@/i18n';

export interface ProductTileImage {
  uri: string;
  /** Adresses de repli de la MÊME photo (proxy, autre format) — jamais une autre photo. */
  fallbackUris?: string[];
}

export interface ProductTileBadge {
  label: string;
  tone: 'sale' | 'neutral';
}

export interface ProductTileFavorite {
  active: boolean;
  onPress: () => void;
  label: string;
  testID?: string;
  disabled?: boolean;
}

export interface ProductTileProps {
  testID: string;
  /** Cotes calculées UNE fois par la grille (`productTileMetrics`). */
  metrics: ProductTileMetrics;
  images: ProductTileImage[];
  /** Nom lu par les lecteurs d'écran pour la carte entière. */
  accessibilityLabel: string;
  /** Texte alternatif des photos. */
  imageLabel: string;
  brand?: string;
  name: string;
  /** Ligne d'info (texte simple ou contenu composé). Absente = ligne vide gardée. */
  meta?: ReactNode;
  /** Prix (texte simple ou contenu composé). Absent = ligne vide gardée. */
  price?: ReactNode;
  /** Action posée en bout de ligne prix (ex. panier). */
  trailing?: ReactNode;
  badges?: ProductTileBadge[];
  favorite?: ProductTileFavorite;
  /** Appui sur la photo ou le texte : reçoit la photo regardée. */
  onOpen: (photo: number) => void;
  /**
   * Cartes posées sur un fond toujours blanc (résultats Lens) : couleurs fixes,
   * même quand le téléphone est en mode sombre.
   */
  onWhite?: boolean;
  /** Rendu propre d'une photo (chargement, repli) ; sinon `AppImage` en `cover`. */
  renderImage?: (image: ProductTileImage, index: number) => ReactNode;
}

export interface ProductTilePalette {
  canvas: string;
  media: string;
  ink: string;
  muted: string;
  dotIdle: string;
  sale: string;
  onSale: string;
}

/** Couleurs de la carte : thème courant, ou blanc fixe pour les surfaces Lens. */
export function useProductTilePalette(onWhite = false): ProductTilePalette {
  const theme = useTheme();
  if (onWhite) {
    return {
      canvas: LENS_COLORS.white,
      media: LENS_COLORS.resultMedia,
      ink: LENS_COLORS.black,
      muted: LENS_COLORS.resultMuted,
      dotIdle: FICHE_COLORS.dotIdle,
      sale: LENS_COLORS.sale,
      onSale: LENS_COLORS.white,
    };
  }
  return {
    canvas: theme.colors.canvas,
    media: theme.colors.surface,
    ink: theme.colors.ink,
    muted: theme.colors.muted,
    dotIdle: ficheColorsFor(theme.mode).dotIdle,
    sale: theme.status.danger.fg,
    onSale: theme.colors.canvas,
  };
}

function ProductTileComponent({
  testID,
  metrics,
  images,
  accessibilityLabel,
  imageLabel,
  brand,
  name,
  meta,
  price,
  trailing,
  badges,
  favorite,
  onOpen,
  onWhite = false,
  renderImage,
}: ProductTileProps) {
  const theme = useTheme();
  const t = useT();
  const palette = useProductTilePalette(onWhite);
  const count = images.length;
  const [page, setPage] = useState(0);
  const [pageWidth, setPageWidth] = useState(metrics.cardWidth);
  const pager = useRef<FlatList<ProductTileImage>>(null);
  const direction = rowDirectionFor(theme.isRTL);

  // Largeur théorique d'abord (aucune photo vide au premier rendu), largeur
  // réelle dès la mise en page : la pagination tombe juste au pixel près.
  useEffect(() => { setPageWidth(metrics.cardWidth); }, [metrics.cardWidth]);
  // Une autre liste de photos (autre produit recyclé dans la cellule) repart de la première.
  const imagesKey = images.map((image) => image.uri).join('|');
  useEffect(() => { setPage(0); }, [imagesKey]);

  const onMediaLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setPageWidth((current) => (Math.abs(current - width) > 0.5 ? width : current));
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const width = layoutMeasurement?.width > 0 ? layoutMeasurement.width : pageWidth;
    const next = productTilePageAt(contentOffset.x, width, count);
    setPage((current) => (current === next ? current : next));
  }, [count, pageWidth]);

  const goTo = useCallback((target: number) => {
    const next = Math.max(0, Math.min(count - 1, target));
    setPage(next);
    pager.current?.scrollToOffset({ offset: next * pageWidth, animated: theme.motion.reduced !== 0 });
  }, [count, pageWidth, theme.motion.reduced]);

  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'increment': goTo(page + 1); break;
      case 'decrement': goTo(page - 1); break;
      case 'activate': onOpen(page); break;
      default: break;
    }
  }, [goTo, onOpen, page]);

  const active = Math.max(0, Math.min(page, Math.max(0, count - 1)));
  const photoText = count > 0 ? t('product.photo', { index: String(active + 1), total: String(count) }) : t('catalog.noImage');
  const drawImage = (image: ProductTileImage, index: number) => (renderImage
    ? renderImage(image, index)
    : (
      <AppImage
        uri={image.uri}
        fallbackUris={image.fallbackUris}
        background={palette.media}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessibilityLabel={imageLabel}
        decorative
      />
    ));

  const window = productTileDotWindow(active, count);
  const { lines, inset } = metrics;
  const textStyle = { maxFontSizeMultiplier: PRODUCT_TILE.maxFontScale } as const;

  return (
    <View testID={testID} style={[styles.card, { width: metrics.cardWidth, height: metrics.height, backgroundColor: palette.canvas }]}>
      {/* ── Photo : galerie au doigt (ou photo unique), pastilles, cœur ── */}
      <View
        testID={`${testID}-media`}
        onLayout={onMediaLayout}
        style={[styles.media, { height: metrics.mediaHeight, backgroundColor: palette.media }]}
      >
      {/* Couche accessible : la galerie se lit « photo 2 sur 6 » et se règle par balayage vertical. */}
      <View
        testID={`${testID}-gallery`}
        accessible
        accessibilityRole={count > 1 ? 'adjustable' : 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: photoText }}
        accessibilityActions={count > 1
          ? [{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]
          : [{ name: 'activate' }]}
        onAccessibilityAction={onAccessibilityAction}
        style={StyleSheet.absoluteFill}
      >
        {count > 1 ? (
          <FlatList
            ref={pager}
            testID={`${testID}-pager`}
            horizontal
            pagingEnabled
            bounces={false}
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            data={images}
            keyExtractor={(image, index) => `${index}-${image.uri}`}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
            onScroll={onScroll}
            scrollEventThrottle={16}
            style={StyleSheet.absoluteFill}
            renderItem={({ item, index }) => (
              <Pressable
                testID={`${testID}-photo-${index}`}
                onPress={() => onOpen(index)}
                importantForAccessibility="no"
                style={{ width: pageWidth, height: metrics.mediaHeight }}
              >
                {drawImage(item, index)}
              </Pressable>
            )}
          />
        ) : (
          <Pressable
            testID={`${testID}-photo-0`}
            onPress={() => onOpen(0)}
            importantForAccessibility="no"
            style={[StyleSheet.absoluteFill, styles.center]}
          >
            {count === 1 ? drawImage(images[0] as ProductTileImage, 0) : (
              <Ionicons name="image-outline" size={theme.iconSize.lg} color={palette.muted} accessibilityElementsHidden />
            )}
          </Pressable>
        )}
      </View>

        {badges && badges.length > 0 ? (
          <View pointerEvents="none" style={[styles.badges, theme.isRTL ? styles.badgesRTL : styles.badgesLTR, { flexDirection: direction }]}>
            {badges.map((badge) => (
              <View
                key={`${badge.tone}-${badge.label}`}
                style={[
                  styles.badge,
                  badge.tone === 'sale'
                    ? { backgroundColor: palette.sale }
                    : { backgroundColor: palette.canvas, borderColor: palette.ink, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <AppText
                  variant="captionStrong"
                  numberOfLines={1}
                  color={badge.tone === 'sale' ? palette.onSale : palette.ink}
                  maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale}
                >
                  {badge.label}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {favorite ? (
          <Pressable
            onPress={(event) => { event.stopPropagation?.(); favorite.onPress(); }}
            disabled={favorite.disabled}
            accessibilityRole="button"
            accessibilityLabel={favorite.label}
            accessibilityState={{ selected: favorite.active, disabled: favorite.disabled }}
            hitSlop={8}
            testID={favorite.testID}
            style={({ pressed }) => [
              styles.favorite,
              theme.isRTL ? styles.favoriteRTL : styles.favoriteLTR,
              { opacity: favorite.disabled && favorite.active ? theme.opacity.favorite : pressed ? theme.opacity.subtle : 1 },
            ]}
          >
            <Ionicons
              name={favorite.active ? 'heart' : 'heart-outline'}
              size={theme.iconSize.sm}
              color={favorite.active ? LENS_COLORS.active : palette.ink}
              accessibilityElementsHidden
            />
          </Pressable>
        ) : null}
      </View>

      {/* ── Bloc texte : hauteurs fixes, une ligne chacune ── */}
      <Pressable
        testID={`${testID}-copy`}
        onPress={() => onOpen(active)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.copy, { height: metrics.textHeight, paddingHorizontal: inset }]}
      >
        <View
          testID={`${testID}-dots`}
          style={[styles.dots, { flexDirection: direction }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {count > 1
            ? Array.from({ length: window.length }, (_, offset) => {
              const index = window.first + offset;
              return (
                <View
                  key={index}
                  testID={`${testID}-dot-${index}`}
                  style={[styles.dot, { backgroundColor: index === active ? palette.ink : palette.dotIdle }]}
                />
              );
            })
            : null}
        </View>

        <View style={[styles.line, { height: lines.brand }]}>
          <AppText
            numberOfLines={1}
            color={palette.ink}
            {...textStyle}
            style={[styles.brand, { lineHeight: lines.brand, fontFamily: theme.font('semibold') }]}
            testID={`${testID}-brand`}
          >
            {brand ?? ''}
          </AppText>
        </View>

        <View style={[styles.line, { height: lines.name }]}>
          <AppText
            numberOfLines={1}
            color={palette.ink}
            {...textStyle}
            style={[styles.name, { lineHeight: lines.name, fontFamily: theme.font('regular') }]}
            testID={`${testID}-name`}
          >
            {name}
          </AppText>
        </View>

        <View style={[styles.line, { height: lines.meta, flexDirection: direction }]} testID={`${testID}-meta`}>
          {typeof meta === 'string' ? (
            <AppText
              numberOfLines={1}
              color={palette.muted}
              {...textStyle}
              style={[styles.meta, { lineHeight: lines.meta, fontFamily: theme.font('regular') }]}
            >
              {meta}
            </AppText>
          ) : meta ?? null}
        </View>

        <View style={[styles.line, styles.priceLine, { height: lines.price, flexDirection: direction }]} testID={`${testID}-price`}>
          <View style={styles.priceText}>
            {typeof price === 'string' ? (
              <AppText
                numberOfLines={1}
                color={palette.ink}
                {...textStyle}
                style={[styles.price, { lineHeight: lines.price, fontFamily: theme.font('semibold') }]}
              >
                {price}
              </AppText>
            ) : price ?? null}
          </View>
          {trailing ?? null}
        </View>
      </Pressable>
    </View>
  );
}

export const ProductTile = memo(ProductTileComponent);

/**
 * Styles de texte d'une ligne de carte, pour les contenus composés (`meta` /
 * `price` passés en nœud) : même corps, même interligne que les lignes simples.
 */
export function productTileTextStyle(role: 'meta' | 'price', metrics: ProductTileMetrics) {
  return role === 'meta'
    ? { fontSize: PRODUCT_TILE.metaSize, lineHeight: metrics.lines.meta }
    : { fontSize: PRODUCT_TILE.priceSize, lineHeight: metrics.lines.price };
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  media: { width: '100%', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  badges: { position: 'absolute', bottom: PRODUCT_TILE.badgeBottom, gap: 4, maxWidth: '100%' },
  badgesLTR: { left: 0 },
  badgesRTL: { right: 0 },
  badge: { height: PRODUCT_TILE.badgeHeight, paddingHorizontal: 8, justifyContent: 'center', maxWidth: '100%' },
  // Cœur NU sur la vignette (décision du 17/10/2026) : aucune pastille blanche.
  favorite: { position: 'absolute', top: 6, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  favoriteLTR: { right: 8 },
  favoriteRTL: { left: 8 },
  copy: { width: '100%' },
  dots: {
    height: PRODUCT_TILE.dot,
    marginTop: PRODUCT_TILE.dotsTop,
    marginBottom: PRODUCT_TILE.dotsBottom,
    alignItems: 'center',
    gap: PRODUCT_TILE.dotPitch - PRODUCT_TILE.dot,
  },
  dot: { width: PRODUCT_TILE.dot, height: PRODUCT_TILE.dot, borderRadius: PRODUCT_TILE.dot / 2 },
  line: { justifyContent: 'center', overflow: 'hidden' },
  brand: { fontSize: PRODUCT_TILE.brandSize },
  name: { fontSize: PRODUCT_TILE.nameSize },
  meta: { fontSize: PRODUCT_TILE.metaSize },
  priceLine: { alignItems: 'center', gap: 8 },
  priceText: { flex: 1, minWidth: 0 },
  price: { fontSize: PRODUCT_TILE.priceSize },
});
