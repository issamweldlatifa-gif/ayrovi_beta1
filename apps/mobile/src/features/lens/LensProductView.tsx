/**
 * Fiche produit Lens native, continue et respirante.
 *
 * La galerie occupe le premier écran ; le client descend ensuite vers le prix,
 * les variantes et l'ajout au panier. Aucun statut technique ni relecture
 * marchande ne parasite ce parcours natif.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { ApiError } from '@/api/errors';
import { addExternalToCart } from '@/api/cart';
import { useSessionId } from '@/session/session';
import type { LensCandidate } from '@/api/lens';
import { lensGallery, lensMediaChain } from './lensMedia';
import { LENS_COLORS } from './lensPalette';
import { LensPriceBlock } from './LensPriceBlock';
import {
  buildCartPayload, effectiveChoice, missingChoice, orderBlock, resolveSelection, type OrderBlock,
} from './productOrder';

const NO_CHOICE = 'none';
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

const BLOCK_KEY: Record<Exclude<OrderBlock, null>, TranslationKey> = {
  ambiguous: 'lens.product.ambiguous',
  manual: 'lens.product.manual',
  incomplete: 'lens.product.incomplete',
};

function refusalKey(error: unknown): TranslationKey | string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_AYROVIX_PRICE_TOKEN') return 'lens.product.expired';
    if (error.code === 'NO_CONTRACT' || error.code.startsWith('VARIANT_')) return 'lens.product.variantRefused';
    if (error.message) return error.message;
  }
  return 'lens.product.orderFailed';
}

function Stars({ rating, count }: { rating: number; count: number | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.rating, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      <View style={[styles.stars, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} accessibilityElementsHidden>
        {[0, 1, 2, 3, 4].map((index) => (
          <Ionicons key={index} name={rating >= index + 0.5 ? 'star' : 'star-outline'} size={17} color={LENS_COLORS.star} />
        ))}
      </View>
      <AppText variant="caption" weight="bold">{rating.toFixed(1)}</AppText>
      {count != null ? <AppText variant="caption" color={theme.colors.muted}>{`(${count})`}</AppText> : null}
    </View>
  );
}

function OptionSelector({
  label, values, value, onChange,
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  if (values.length <= 1) return null;
  const effective = value;

  return (
    <View style={styles.optionBlock}>
      <AppText variant="caption" weight="bold">{label}</AppText>
      <Pressable
        onPress={() => { if (values.length > 1) setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled: values.length <= 1 }}
        testID="lens-option-selector"
        style={({ pressed }) => [
          styles.selector,
          {
            borderColor: theme.colors.ink,
            borderRadius: theme.radius.control,
            flexDirection: theme.isRTL ? 'row-reverse' : 'row',
            opacity: pressed ? theme.opacity.subtle : 1,
          },
        ]}
      >
        <AppText style={styles.selectorValue} color={effective ? theme.colors.ink : theme.colors.muted} numberOfLines={1}>
          {effective || t('lens.product.chooseValue', { option: label.toLocaleLowerCase() })}
        </AppText>
        {values.length > 1 ? <Ionicons name="chevron-down" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalScrim} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('sheet.close')} />
          <View
            style={[
              styles.optionSheet,
              {
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: theme.radius.sheet,
                borderTopRightRadius: theme.radius.sheet,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.lineControl }]} />
            <AppText variant="title" weight="bold">{label}</AppText>
            {values.map((option) => {
              const selected = option === effective;
              return (
                <Pressable
                  key={option}
                  onPress={() => { onChange(option); setOpen(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    {
                      borderTopColor: theme.colors.line,
                      flexDirection: theme.isRTL ? 'row-reverse' : 'row',
                      opacity: pressed ? theme.opacity.subtle : 1,
                    },
                  ]}
                >
                  <AppText style={styles.selectorValue} weight={selected ? 'bold' : 'regular'}>{option}</AppText>
                  {selected ? <Ionicons name="checkmark" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function colorImage(candidate: LensCandidate, color: string): string | null {
  if (!candidate.colorImages) return null;
  const wanted = color.trim().toLocaleLowerCase();
  const row = Object.entries(candidate.colorImages).find(([name]) => name.trim().toLocaleLowerCase() === wanted);
  return row?.[1]?.[0] ?? null;
}

function ColorSelector({
  candidate, value, onChange,
}: {
  candidate: LensCandidate;
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const fallbackImages = lensGallery(candidate, null, 'thumb');
  if (candidate.colors.length <= 1) return null;
  const effective = value;

  return (
    <View style={styles.optionBlock}>
      <AppText variant="caption">
        {`${t('lens.product.color')}: `}
        <AppText variant="caption" weight="bold">{effective || t('lens.product.chooseColorShort')}</AppText>
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.colorRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
      >
        {candidate.colors.map((color, index) => {
          const selected = color === effective;
          const rawImage = colorImage(candidate, color);
          const fallback = fallbackImages[index % Math.max(1, fallbackImages.length)];
          const media = rawImage ? lensMediaChain(rawImage, 'thumb') : (fallback?.uris ?? []);
          return (
            <Pressable
              key={color}
              onPress={() => onChange(color)}
              accessibilityRole="button"
              accessibilityLabel={`${t('lens.product.color')}: ${color}`}
              accessibilityState={{ selected }}
              testID={`lens-color-${index}`}
              style={[
                styles.colorChoice,
                {
                  borderColor: selected ? theme.colors.ink : theme.colors.lineControl,
                  borderRadius: theme.radius.control,
                  backgroundColor: theme.colors.infoSoft,
                },
              ]}
            >
              {media.length > 0 ? (
                <AppImage uri={media[0]} fallbackUris={media.slice(1)} contentFit="contain" style={styles.colorImage} decorative />
              ) : null}
              <AppText variant="caption" weight={selected ? 'bold' : 'regular'} align="center" numberOfLines={1}>
                {color}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function touchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

function ZoomableGalleryImage({
  uri,
  fallbackUris,
  label,
  width,
  height,
  active,
  onZoomChange,
}: {
  uri: string;
  fallbackUris: string[];
  label: string;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const t = useT();
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const translation = useRef(new Animated.ValueXY()).current;
  const scaleValue = useRef(1);
  const translationValue = useRef({ x: 0, y: 0 });
  const pinchStart = useRef({ distance: 0, scale: 1 });
  const panStart = useRef({ x: 0, y: 0 });
  const beganWithPinch = useRef(false);
  const lastTapAt = useRef(0);
  const reportedZoom = useRef(false);

  const reportZoom = useCallback((zoomed: boolean) => {
    if (reportedZoom.current === zoomed) return;
    reportedZoom.current = zoomed;
    onZoomChange(zoomed);
  }, [onZoomChange]);

  const boundsFor = useCallback((nextScale: number) => ({
    x: Math.max(0, width * (nextScale - 1) / 2),
    y: Math.max(0, height * (nextScale - 1) / 2),
  }), [height, width]);

  const animateTo = useCallback((nextScale: number, x: number, y: number) => {
    const bounds = boundsFor(nextScale);
    const nextX = Math.max(-bounds.x, Math.min(bounds.x, x));
    const nextY = Math.max(-bounds.y, Math.min(bounds.y, y));
    scaleValue.current = nextScale;
    translationValue.current = { x: nextX, y: nextY };
    reportZoom(nextScale > 1.01);
    if (theme.motion.reduced === 0) {
      scale.setValue(nextScale);
      translation.setValue({ x: nextX, y: nextY });
      return;
    }
    Animated.parallel([
      Animated.spring(scale, {
        toValue: nextScale,
        damping: 22,
        stiffness: 230,
        mass: 0.75,
        useNativeDriver: true,
      }),
      Animated.spring(translation, {
        toValue: { x: nextX, y: nextY },
        damping: 22,
        stiffness: 230,
        mass: 0.75,
        useNativeDriver: true,
      }),
    ]).start();
  }, [boundsFor, reportZoom, scale, theme.motion.reduced, translation]);

  const resetZoom = useCallback(() => animateTo(1, 0, 0), [animateTo]);

  useEffect(() => {
    if (active) return;
    scale.stopAnimation();
    translation.stopAnimation();
    scale.setValue(1);
    translation.setValue({ x: 0, y: 0 });
    scaleValue.current = 1;
    translationValue.current = { x: 0, y: 0 };
    reportedZoom.current = false;
  }, [active, scale, translation]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length >= 2,
    onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponder: (event, gesture) => (
      event.nativeEvent.touches.length >= 2
      || (scaleValue.current > 1.01 && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2))
    ),
    onMoveShouldSetPanResponderCapture: (event, gesture) => (
      event.nativeEvent.touches.length >= 2
      || (scaleValue.current > 1.01 && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2))
    ),
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      beganWithPinch.current = touches.length >= 2;
      pinchStart.current = { distance: touchDistance(touches), scale: scaleValue.current };
      panStart.current = { ...translationValue.current };
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        const distance = touchDistance(touches);
        if (pinchStart.current.distance <= 0) {
          pinchStart.current = { distance, scale: scaleValue.current };
          return;
        }
        const nextScale = Math.max(1, Math.min(4, pinchStart.current.scale * distance / pinchStart.current.distance));
        scaleValue.current = nextScale;
        scale.setValue(nextScale);
        if (nextScale <= 1.01) {
          translationValue.current = { x: 0, y: 0 };
          translation.setValue({ x: 0, y: 0 });
        }
        reportZoom(nextScale > 1.01);
        return;
      }
      if (scaleValue.current <= 1.01 || beganWithPinch.current) return;
      const bounds = boundsFor(scaleValue.current);
      const x = Math.max(-bounds.x, Math.min(bounds.x, panStart.current.x + gesture.dx));
      const y = Math.max(-bounds.y, Math.min(bounds.y, panStart.current.y + gesture.dy));
      translationValue.current = { x, y };
      translation.setValue({ x, y });
    },
    onPanResponderRelease: () => {
      if (scaleValue.current <= 1.05) resetZoom();
      else animateTo(scaleValue.current, translationValue.current.x, translationValue.current.y);
    },
    onPanResponderTerminate: resetZoom,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [animateTo, boundsFor, reportZoom, resetZoom, scale, translation]);

  const onPress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapAt.current <= 300) {
      lastTapAt.current = 0;
      if (scaleValue.current > 1.01) resetZoom();
      else animateTo(2, 0, 0);
      return;
    }
    lastTapAt.current = now;
  }, [animateTo, resetZoom]);

  return (
    <Pressable
      {...panResponder.panHandlers}
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      accessibilityHint={t('lens.product.galleryZoomHint')}
      style={styles.zoomViewport}
      testID={active ? 'lens-gallery-zoom-image' : undefined}
    >
      <Animated.View
        style={[
          styles.zoomContent,
          {
            transform: [
              ...translation.getTranslateTransform(),
              { scale },
            ],
          },
        ]}
      >
        <AppImage
          uri={uri}
          fallbackUris={fallbackUris}
          contentFit="contain"
          style={styles.fullscreenImage}
          decorative
        />
      </Animated.View>
    </Pressable>
  );
}

export function LensProductView({
  candidate, onBack, favorite = false, favoriteNote = null, onFavorite,
}: {
  candidate: LensCandidate;
  onBack: () => void;
  favorite?: boolean;
  favoriteNote?: TranslationKey | null;
  onFavorite?: (candidate: LensCandidate) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const sessionId = useSessionId();
  const [size, setSize] = useState<string>(NO_CHOICE);
  const [color, setColor] = useState<string>(NO_CHOICE);
  const [activeImage, setActiveImage] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryZoomed, setGalleryZoomed] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const heroPagerRef = useRef<ScrollView>(null);
  const fullscreenPagerRef = useRef<ScrollView>(null);
  const orderLock = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    orderLock.current = false;
    setSize(NO_CHOICE);
    setColor(NO_CHOICE);
    setActiveImage(0);
    setGalleryOpen(false);
    setGalleryZoomed(false);
    setMessage(null);
  }, [candidate]);

  const sizeValue = size === NO_CHOICE ? '' : size;
  const colorValue = color === NO_CHOICE ? '' : color;
  const choice = effectiveChoice(candidate, sizeValue, colorValue);
  const selection = useMemo(
    () => resolveSelection(candidate, choice.size, choice.color),
    [candidate, choice.color, choice.size],
  );
  const pricedCandidate = useMemo<LensCandidate>(() => {
    if (!selection.offer.fromVariant) return candidate;
    return {
      ...candidate,
      promo: null,
      price: selection.offer.price,
      currency: selection.offer.currency,
      priceTnd: selection.offer.priceTnd,
      originalPrice: null,
      originalPriceTnd: null,
    };
  }, [candidate, selection.offer]);
  const block = orderBlock(selection);
  const needsChoice = missingChoice(candidate, sizeValue, colorValue);
  const missingSizeChoice = candidate.sizes.length > 1 && !sizeValue.trim();
  const missingColorChoice = candidate.colors.length > 1 && !colorValue.trim();
  const choicePromptKey: TranslationKey = missingSizeChoice && missingColorChoice
    ? 'lens.product.chooseOption'
    : missingSizeChoice ? 'lens.product.chooseSize' : 'lens.product.chooseColor';
  const gallery = useMemo(() => lensGallery(candidate, choice.color || null, 'detail'), [candidate, choice.color]);
  const galleryKey = gallery.map((item) => item.original).join('|');
  useEffect(() => setActiveImage(0), [galleryKey]);
  const heroHeight = Math.min(690, height * 0.72, Math.max(width * 1.12, height * 0.64));
  const fullscreenImageHeight = Math.max(1, height - insets.top - insets.bottom - 58);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const pager = galleryOpen ? fullscreenPagerRef.current : heroPagerRef.current;
      pager?.scrollTo({ x: activeImage * width, y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeImage, galleryKey, galleryOpen, width]);

  const setIndexFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    setActiveImage(Math.max(0, Math.min(index, gallery.length - 1)));
    setGalleryZoomed(false);
  };

  const order = useCallback(async () => {
    if (orderLock.current) return;
    setMessage(null);
    if (needsChoice) {
      setMessage(t(choicePromptKey));
      return;
    }
    const payload = buildCartPayload({
      candidate,
      selection,
      size: choice.size,
      color: choice.color,
      quantity: 1,
      customerNote: '',
    });
    if (!payload) {
      setMessage(t(BLOCK_KEY[block ?? 'incomplete']));
      return;
    }
    orderLock.current = true;
    setOrderBusy(true);
    try {
      await addExternalToCart({ payload, sessionId });
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      if (mountedRef.current) router.push('/checkout');
    } catch (error) {
      if (mountedRef.current) {
        const key = refusalKey(error);
        setMessage(key.startsWith('lens.') ? t(key as TranslationKey) : key);
      }
    } finally {
      orderLock.current = false;
      if (mountedRef.current) setOrderBusy(false);
    }
  }, [block, candidate, choice.color, choice.size, choicePromptKey, needsChoice, queryClient, selection, sessionId, t]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas }]} testID="lens-product-view">
      <StatusBar style={galleryOpen || theme.mode === 'dark' ? 'light' : 'dark'} />
      <View
        style={[
          styles.productHeader,
          {
            paddingTop: insets.top,
            minHeight: insets.top + 58,
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.line,
            flexDirection: theme.isRTL ? 'row-reverse' : 'row',
          },
        ]}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('lens.product.back')}
          hitSlop={HIT_SLOP}
          testID="lens-product-back"
          style={styles.headerButton}
        >
          <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
        <AppText variant="label" weight="bold" align="center" style={styles.headerTitle} numberOfLines={1}>
          {candidate.brand || t('lens.product.header')}
        </AppText>
        <View style={styles.headerButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <View style={[styles.gallery, { height: heroHeight, backgroundColor: theme.colors.infoSoft }]}>
          {gallery.length > 0 ? (
            <ScrollView
              key={`hero-${galleryKey}`}
              ref={heroPagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={setIndexFromScroll}
              contentOffset={{ x: activeImage * width, y: 0 }}
            >
              {gallery.map((item, index) => (
                <Pressable
                  key={item.original}
                  onPress={() => { setActiveImage(index); setGalleryZoomed(false); setGalleryOpen(true); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('lens.product.openGallery')}
                  accessibilityHint={t('lens.product.galleryZoomHint')}
                  testID={index === activeImage ? 'lens-product-image' : undefined}
                  style={{ width, height: heroHeight }}
                >
                  <AppImage
                    uri={item.uris[0]}
                    fallbackUris={item.uris.slice(1)}
                    contentFit="contain"
                    style={styles.heroImage}
                    decorative
                    testID={index === activeImage ? 'lens-product-image-media' : undefined}
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <AppImage style={styles.heroImage} accessibilityLabel={candidate.title} testID="lens-product-image" />
          )}

          {candidate.promo ? (
            <View style={[styles.heroPromo, theme.isRTL ? { right: 16 } : { left: 16 }]}>
              <AppText variant="caption" weight="bold" color={LENS_COLORS.white}>{t('lens.promo')}</AppText>
            </View>
          ) : null}
          {onFavorite ? (
            <Pressable
              onPress={() => onFavorite(candidate)}
              disabled={favorite}
              accessibilityRole="button"
              accessibilityLabel={t(favorite ? 'lens.favorited' : 'lens.favorite')}
              accessibilityState={{ selected: favorite, disabled: favorite }}
              style={[styles.heroFavorite, theme.isRTL ? { left: 16 } : { right: 16 }, { backgroundColor: theme.colors.surface }]}
            >
              <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={theme.iconSize.lg} color={favorite ? LENS_COLORS.sale : theme.colors.ink} accessibilityElementsHidden />
            </Pressable>
          ) : null}
          {gallery.length > 0 ? (
            <View style={[styles.counter, theme.isRTL ? { right: 18 } : { left: 18 }]}>
              <AppText variant="caption" weight="bold">{`${activeImage + 1} / ${gallery.length}`}</AppText>
            </View>
          ) : null}
          {gallery.length > 1 ? (
            <View style={styles.dots} accessibilityElementsHidden>
              {gallery.slice(0, 7).map((item, index) => (
                <View
                  key={item.original}
                  style={[
                    styles.dot,
                    { backgroundColor: index === activeImage ? theme.colors.ink : theme.colors.lineControl },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.details, { backgroundColor: theme.colors.surface }]}>
          {candidate.brand ? <AppText variant="label" weight="bold">{candidate.brand}</AppText> : null}
          <AppText variant="display" weight="semibold">{candidate.title}</AppText>
          {candidate.description ? (
            <AppText color={theme.colors.muted} numberOfLines={3}>{candidate.description}</AppText>
          ) : null}
          {candidate.ratingKind === 'merchant' && candidate.rating != null ? (
            <Stars rating={candidate.rating} count={candidate.ratingCount} />
          ) : null}
          <LensPriceBlock candidate={pricedCandidate} />

          <ColorSelector candidate={candidate} value={colorValue} onChange={setColor} />
          <OptionSelector
            label={candidate.optionLabel || t('lens.product.size')}
            values={candidate.sizes}
            value={sizeValue}
            onChange={setSize}
          />

          {!block && needsChoice ? <AppText variant="caption" color={theme.colors.muted}>{t(choicePromptKey)}</AppText> : null}
          {block ? <AppText variant="caption" color={theme.colors.muted}>{t(BLOCK_KEY[block])}</AppText> : null}
          {favoriteNote ? <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{t(favoriteNote)}</AppText> : null}
          {message ? <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{message}</AppText> : null}

          <Button
            label={orderBusy ? t('lens.product.ordering') : t('lens.product.order')}
            onPress={order}
            busy={orderBusy}
            disabled={!sessionId || needsChoice || block !== null}
            block
            testID="lens-order"
          />
        </View>
      </ScrollView>

      <Modal
        visible={galleryOpen}
        animationType="fade"
        onRequestClose={() => { setGalleryZoomed(false); setGalleryOpen(false); }}
      >
        <View style={[styles.fullscreen, { backgroundColor: LENS_COLORS.black, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.fullscreenHeader, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            <AppText variant="label" weight="bold" color={LENS_COLORS.white}>{`${activeImage + 1} / ${Math.max(1, gallery.length)}`}</AppText>
            <Pressable
              onPress={() => { setGalleryZoomed(false); setGalleryOpen(false); }}
              accessibilityRole="button"
              accessibilityLabel={t('sheet.close')}
              hitSlop={HIT_SLOP}
              style={styles.closeButton}
              testID="lens-gallery-close"
            >
              <Ionicons name="close" size={theme.iconSize.lg} color={LENS_COLORS.white} accessibilityElementsHidden />
            </Pressable>
          </View>
          <ScrollView
            key={`fullscreen-${galleryKey}`}
            ref={fullscreenPagerRef}
            horizontal
            pagingEnabled
            scrollEnabled={!galleryZoomed}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={setIndexFromScroll}
            contentOffset={{ x: activeImage * width, y: 0 }}
            style={styles.fullscreenPager}
          >
            {gallery.map((item, index) => (
              <View key={item.original} style={{ width, height: fullscreenImageHeight }}>
                <ZoomableGalleryImage
                  uri={item.uris[0]}
                  fallbackUris={item.uris.slice(1)}
                  label={candidate.title}
                  width={width}
                  height={fullscreenImageHeight}
                  active={index === activeImage}
                  onZoomChange={setGalleryZoomed}
                />
              </View>
            ))}
          </ScrollView>
          {!galleryZoomed ? (
            <View style={[styles.zoomHint, { bottom: insets.bottom + 16 }]} pointerEvents="none">
              <Ionicons name="search-outline" size={18} color={LENS_COLORS.white} accessibilityElementsHidden />
              <AppText variant="caption" color={LENS_COLORS.white}>{t('lens.product.galleryZoomHint')}</AppText>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  productHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  gallery: { width: '100%', position: 'relative', overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroPromo: { position: 'absolute', top: 16, backgroundColor: LENS_COLORS.sale, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  heroFavorite: { position: 'absolute', top: 14, width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', bottom: 18, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.82)' },
  dots: { position: 'absolute', bottom: 22, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  details: { gap: 16, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 },
  rating: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stars: { gap: 2 },
  optionBlock: { gap: 8, paddingTop: 4 },
  selector: { minHeight: 58, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', gap: 12 },
  selectorValue: { flex: 1 },
  colorRow: { gap: 10 },
  colorChoice: { width: 76, height: 104, gap: 4, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 4 },
  colorImage: { width: '100%', flex: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.42)' },
  optionSheet: { maxHeight: '72%', paddingTop: 12, paddingHorizontal: 20, gap: 10 },
  sheetHandle: { width: 46, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  optionRow: { minHeight: 54, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 12 },
  fullscreen: { flex: 1 },
  fullscreenHeader: { minHeight: 58, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 2 },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  fullscreenPager: { flex: 1 },
  zoomViewport: { flex: 1, overflow: 'hidden' },
  zoomContent: { flex: 1 },
  fullscreenImage: { width: '100%', height: '100%' },
  zoomHint: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.58)' },
});
