/**
 * Fiche produit Lens native, continue et respirante.
 *
 * La galerie occupe le premier écran ; le client descend ensuite vers le prix,
 * les variantes et l'ajout au panier. Aucun statut technique ni relecture
 * marchande ne parasite ce parcours natif.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Vibration, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { frost, veil } from '@/design/tokens.mobile';
import { SPACE } from '@/design/tokens.generated';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { ApiError } from '@/api/errors';
import { addExternalToCart, fetchAyroviCart } from '@/api/cart';
import { useSessionId } from '@/session/session';
import type { LensCandidate, LensProductFact } from '@/api/lens';
import { lensGallery, lensMediaChain } from './lensMedia';
import { LENS_COLORS } from './lensPalette';
import { LensPriceBlock } from './LensPriceBlock';
import { earliestCartDeadline, formatCartCountdown, remainingMs, serverClockOffset } from './lensCartStatus';
import {
  buildCartPayload, effectiveChoice, missingChoice, orderBlock, resolveSelection, type OrderBlock,
} from './productOrder';

const BLOCK_KEY: Record<Exclude<OrderBlock, null>, TranslationKey> = {
  ambiguous: 'lens.product.ambiguous',
  manual: 'lens.product.manual',
  incomplete: 'lens.product.incomplete',
};

const CARE_FACT = /(?:^|\b)(?:care|wash|washing|clean|cleaning|entretien|lavage|nettoyage|pflege|غسل|تنظيف|العناية)(?:\b|$)/i;

function OptionSelector({
  label, values, value, onChange, openRequest = 0, disabledValues = new Set<string>(),
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
  /** Incrémenté par le CTA quand le client a oublié ce choix. */
  openRequest?: number;
  disabledValues?: Set<string>;
}) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openRequest > 0 && values.length > 1) setOpen(true);
  }, [openRequest, values.length]);
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

      <Modal
        visible={open}
        transparent
        animationType={theme.motion.reduced === 0 ? 'none' : 'slide'}
        onRequestClose={() => setOpen(false)}
      >
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
            <ScrollView style={styles.optionList} showsVerticalScrollIndicator={false}>
              {values.map((option, index) => {
                const selected = option === effective;
                const unavailable = disabledValues.has(option);
                return (
                  <Pressable
                    key={option}
                    testID={`lens-option-${index}`}
                    disabled={unavailable}
                    onPress={() => {
                      Vibration.vibrate(12);
                      onChange(option);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: unavailable }}
                    style={({ pressed }) => [
                      styles.optionRow,
                      {
                        borderTopColor: theme.colors.line,
                        flexDirection: theme.isRTL ? 'row-reverse' : 'row',
                        opacity: unavailable ? 0.36 : pressed ? theme.opacity.subtle : 1,
                      },
                    ]}
                  >
                    <AppText
                      style={[styles.selectorValue, unavailable ? styles.unavailableOption : null]}
                      weight={selected ? 'bold' : 'regular'}
                    >
                      {option}
                    </AppText>
                    {selected ? <Ionicons name="checkmark" size={theme.iconSize.md} color={theme.colors.accentText} accessibilityElementsHidden /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
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
  candidate, value, onChange, disabledValues = new Set<string>(), attention = false,
}: {
  candidate: LensCandidate;
  value: string;
  onChange: (value: string) => void;
  disabledValues?: Set<string>;
  attention?: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const fallbackImages = lensGallery(candidate, null, 'thumb');
  if (candidate.colors.length <= 1) return null;
  const effective = value;

  return (
    <View
      style={[styles.optionBlock, attention ? { borderColor: theme.status.danger.fg, borderWidth: 1.5, borderRadius: theme.radius.control, padding: 10 } : null]}
      testID="lens-color-selector"
    >
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
          const unavailable = disabledValues.has(color);
          const rawImage = colorImage(candidate, color);
          const fallback = fallbackImages[index % Math.max(1, fallbackImages.length)];
          const media = rawImage ? lensMediaChain(rawImage, 'thumb') : (fallback?.uris ?? []);
          return (
            <Pressable
              key={color}
              disabled={unavailable}
              onPress={() => {
                Vibration.vibrate(12);
                onChange(color);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${t('lens.product.color')}: ${color}`}
              accessibilityState={{ selected, disabled: unavailable }}
              testID={`lens-color-${index}`}
              style={[
                styles.colorChoice,
                {
                  borderColor: selected ? theme.colors.focus : theme.colors.lineControl,
                  borderRadius: theme.radius.control,
                  backgroundColor: theme.colors.infoSoft,
                  opacity: unavailable ? 0.35 : 1,
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
  blurRadius = 0,
  onZoomChange,
}: {
  uri: string;
  fallbackUris: string[];
  label: string;
  width: number;
  height: number;
  active: boolean;
  /** Flou appliqué à la photo pendant que la fiche monte dessus (0 = nette). */
  blurRadius?: number;
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
      style={[styles.zoomViewport, { width, height }]}
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
          blurRadius={blurRadius}
          style={styles.fullscreenImage}
          testID={active ? 'lens-product-image-media' : undefined}
          decorative
        />
      </Animated.View>
    </Pressable>
  );
}

function FactAccordion({
  title, icon, facts, description, testID,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  facts: LensProductFact[];
  description?: string | null;
  testID?: string;
}) {
  const theme = useTheme();
  // Les informations longues sont fermées par défaut. La fiche garde ainsi sa
  // hiérarchie commerciale au lieu d’imprimer un bloc enrichi géant.
  const [open, setOpen] = useState(false);
  if (!facts.length && !description) return null;
  return (
    <View style={[styles.accordion, { borderColor: theme.colors.line }]}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.accordionHeader,
          { flexDirection: theme.isRTL ? 'row-reverse' : 'row', opacity: pressed ? 0.64 : 1 },
        ]}
        testID={testID}
      >
        <View style={[styles.accordionHeading, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name={icon} size={20} color={theme.colors.ink} accessibilityElementsHidden />
          <AppText weight="semibold" style={styles.accordionTitle}>{title}</AppText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.ink} accessibilityElementsHidden />
      </Pressable>
      {open ? (
        <View style={[styles.accordionBody, { borderTopColor: theme.colors.line }]}>
          {description ? <AppText color={theme.colors.ink} style={styles.description}>{description}</AppText> : null}
          {facts.map((fact, index) => (
            <View
              key={`${fact.label}-${fact.value}-${index}`}
              style={[
                styles.factRow,
                {
                  borderTopColor: theme.colors.line,
                  flexDirection: theme.isRTL ? 'row-reverse' : 'row',
                },
              ]}
            >
              <AppText variant="caption" color={theme.colors.muted} style={styles.factLabel}>{fact.label}</AppText>
              <AppText weight="semibold" style={styles.factValue}>{fact.value}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function unavailableValues(candidate: LensCandidate, attribute: 'size' | 'color', otherValue = ''): Set<string> {
  const values = attribute === 'size' ? candidate.sizes : candidate.colors;
  const unavailable = new Set<string>();
  const normalizedOther = otherValue.trim().toLocaleLowerCase();
  for (const value of values) {
    const normalizedValue = value.trim().toLocaleLowerCase();
    const ownMatches = candidate.variantOptions.filter((variant) => {
      const own = attribute === 'size' ? variant.size : variant.color;
      return own?.trim().toLocaleLowerCase() === normalizedValue;
    });
    const matches = normalizedOther
      ? ownMatches.filter((variant) => {
          const other = attribute === 'size' ? variant.color : variant.size;
          return other?.trim().toLocaleLowerCase() === normalizedOther;
        })
      : ownMatches;
    // Une combinaison absente n'est incompatible que lorsque la source fournit
    // réellement la dimension opposée. Sans matrice complète, on ne devine rien.
    const hasCounterpartMatrix = Boolean(normalizedOther) && ownMatches.some((variant) => {
      const other = attribute === 'size' ? variant.color : variant.size;
      return Boolean(other?.trim());
    });
    if ((matches.length === 0 && hasCounterpartMatrix)
      || (matches.length > 0 && matches.every((variant) => !variant.available || variant.availability === 'unavailable'))) {
      unavailable.add(value);
    }
  }
  return unavailable;
}

/** Paliers du voile : la photo se floute par crans pendant que la fiche monte. */
const HAZE_STEPS = 5;
const HAZE_BLUR = [0, 1.5, 4, 8, 13];
const HAZE_VEIL = [0, 0.08, 0.17, 0.27, 0.38];

export function LensProductView({
  candidate,
  enriching = false,
  onBack,
  favorite = false,
  favoriteNote = null,
  onFavorite,
}: {
  candidate: LensCandidate;
  enriching?: boolean;
  onBack: () => void;
  favorite?: boolean;
  favoriteNote?: TranslationKey | null;
  onFavorite?: (candidate: LensCandidate) => void;
}) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const sessionId = useSessionId();
  const productKey = `${candidate.id}|${candidate.sourceUrl}`;
  const [selectedSize, setSelectedSize] = useState(() => candidate.sizes.length === 1 ? candidate.sizes[0] : '');
  const [selectedColor, setSelectedColor] = useState(() => candidate.colors.length === 1 ? candidate.colors[0] : '');
  const [page, setPage] = useState(0);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderAdded, setOrderAdded] = useState(false);
  const [orderMessage, setOrderMessage] = useState('');
  const [addedUnits, setAddedUnits] = useState(0);
  const [addedUnitsAt, setAddedUnitsAt] = useState(0);
  const [addedDeadline, setAddedDeadline] = useState('');
  const [addedClockOffset, setAddedClockOffset] = useState(0);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [sizeOpenRequest, setSizeOpenRequest] = useState(0);
  const [colorAttention, setColorAttention] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const orderLock = useRef(false);
  const orderRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const lastChoiceRef = useRef<'size' | 'color'>('size');
  const scrollRef = useRef<ScrollView>(null);
  const optionsY = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  const cartQuery = useQuery({
    queryKey: ['cart', sessionId],
    queryFn: ({ signal }) => fetchAyroviCart({ sessionId: sessionId || '', signal }),
    enabled: Boolean(sessionId),
    staleTime: 15_000,
    retry: false,
  });

  const selection = useMemo(
    () => resolveSelection(candidate, selectedSize, selectedColor),
    [candidate, selectedColor, selectedSize],
  );
  const choice = effectiveChoice(candidate, selectedSize, selectedColor);
  const resolvedSize = choice.size;
  const resolvedColor = choice.color;
  const sizeUnavailable = useMemo(
    () => unavailableValues(candidate, 'size', resolvedColor),
    [candidate, resolvedColor],
  );
  const colorUnavailable = useMemo(
    () => unavailableValues(candidate, 'color', resolvedSize),
    [candidate, resolvedSize],
  );
  const missingSize = candidate.sizes.length > 1 && !resolvedSize.trim();
  const missingColor = candidate.colors.length > 1 && !resolvedColor.trim();
  const missing = missingChoice(candidate, selectedSize, selectedColor);
  const missingKind: 'size' | 'color' | 'both' | null = missingSize && missingColor
    ? 'both' : missingSize ? 'size' : missingColor ? 'color' : null;
  // Un choix manquant est une action guidée, jamais un motif de désactivation.
  // Sans variante positive, un produit explicitement épuisé reste non commandable.
  const productUnavailable = !selection.option && candidate.availability === 'out_of_stock';
  const actionableBlock: OrderBlock = missing ? null : productUnavailable ? 'manual' : orderBlock(selection);
  const displayCandidate = useMemo<LensCandidate>(() => {
    if (!selection.option) return candidate;
    return {
      ...candidate,
      price: selection.option.price ?? candidate.price,
      currency: selection.option.currency ?? candidate.currency,
      priceTnd: selection.option.priceTnd ?? candidate.priceTnd,
      priceOrigin: 'merchant',
      priceToken: selection.option.priceToken ?? candidate.priceToken,
      // Le jeton de variante est signé avec le même statut que l’offre produit.
      // Sa présence ne transforme jamais une offre PENDING_MANUAL en VERIFIED.
      priceVerificationStatus: candidate.priceVerificationStatus,
      availability: selection.option.availability === 'unavailable' ? 'out_of_stock' : candidate.availability,
    };
  }, [candidate, selection.option]);
  const gallery = useMemo(
    () => lensGallery(candidate, resolvedColor || null, 'detail'),
    [candidate, resolvedColor],
  );
  const heroHeight = Math.max(390, Math.min(560, Math.round(width * 1.2)));
  // Le second cran place exactement le début de la fiche sous le chrome. RN
  // anime ce snap sur le thread natif, sans PanResponder concurrent au scroll.
  const expandedOffset = Math.max(1, heroHeight - (insets.top + 82));

  // IDENTITÉS MARCHANDES (16/10/2026, fiche façon Zalando) : la référence et le
  // code-barres publiés par la source rejoignent « Caractéristiques ». Jamais
  // inventés, jamais doublonnés avec une fact marchande portant la même valeur.
  const identityFacts = useMemo(() => {
    const published = candidate.details ?? [];
    const existing = new Set(published.map((fact) => fact.value.trim().toLocaleLowerCase()));
    const rows: LensProductFact[] = [];
    const sku = (candidate.sku || '').trim();
    const gtin = (candidate.gtin || '').trim();
    if (sku && !existing.has(sku.toLocaleLowerCase())) {
      rows.push({ key: 'productNumber', label: t('lens.product.modelReference'), value: sku, section: 'details' });
    }
    if (gtin && !existing.has(gtin.toLocaleLowerCase())) {
      rows.push({ key: 'gtin', label: t('lens.product.barcode'), value: gtin, section: 'details' });
    }
    return rows;
  }, [candidate.details, candidate.gtin, candidate.sku, t]);
  const facts = [...(candidate.details ?? []), ...identityFacts];
  const detailFacts = facts.filter((fact) => fact.section === 'details');
  const careFacts = detailFacts.filter((fact) => CARE_FACT.test(`${fact.label} ${fact.value}`));
  const characteristicFacts = detailFacts.filter((fact) => !careFacts.includes(fact));
  const materialFacts = facts.filter((fact) => fact.section === 'material');
  const fitFacts = facts.filter((fact) => fact.section === 'fit');
  const cartDeadline = earliestCartDeadline(cartQuery.data);
  const deadline = useMemo(() => [cartDeadline, addedDeadline]
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? '', [addedDeadline, cartDeadline]);
  const queryClockOffset = useMemo(() => cartQuery.data?.serverNow
    ? serverClockOffset(cartQuery.data.serverNow, cartQuery.dataUpdatedAt || Date.now()) : 0,
  [cartQuery.data?.serverNow, cartQuery.dataUpdatedAt]);
  const clockOffset = deadline && deadline === addedDeadline ? addedClockOffset : queryClockOffset;
  const countdownExpired = Boolean(deadline) && remainingMs(deadline, now + clockOffset) === 0;
  const countdown = deadline ? formatCartCountdown(deadline, now + clockOffset) : '';
  const cartUnits = addedUnitsAt ? addedUnits : cartQuery.data?.units ?? 0;

  useEffect(() => {
    if (!addedUnitsAt || cartQuery.dataUpdatedAt <= addedUnitsAt || !cartDeadline) return;
    setAddedUnitsAt(0);
    setAddedUnits(0);
    setAddedDeadline('');
    setAddedClockOffset(0);
  }, [addedUnitsAt, cartDeadline, cartQuery.dataUpdatedAt]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!deadline) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    setSelectedSize(candidate.sizes.length === 1 ? candidate.sizes[0] : '');
    setSelectedColor(candidate.colors.length === 1 ? candidate.colors[0] : '');
    setPage(0);
    setZoomed(false);
    setOrderMessage('');
    setOrderAdded(false);
    setConfirmationOpen(false);
    setColorAttention(false);
    lastChoiceRef.current = 'size';
    orderLock.current = false;
    orderRequestRef.current += 1;
  // Progressive enrichment keeps the same product key and must not erase choices.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey]);

  useEffect(() => {
    setSelectedSize((current) => candidate.sizes.length === 1
      ? candidate.sizes[0]
      : candidate.sizes.includes(current) ? current : '');
    setSelectedColor((current) => candidate.colors.length === 1
      ? candidate.colors[0]
      : candidate.colors.includes(current) ? current : '');
  }, [candidate.colors, candidate.sizes]);

  useEffect(() => {
    const blockedSize = Boolean(selectedSize) && sizeUnavailable.has(selectedSize);
    const blockedColor = Boolean(selectedColor) && colorUnavailable.has(selectedColor);
    if (!blockedSize && !blockedColor) return;
    if (blockedSize && blockedColor) {
      // Garder le choix le plus récent et retirer son ancienne contrepartie.
      if (lastChoiceRef.current === 'size') setSelectedColor('');
      else setSelectedSize('');
    } else if (blockedSize) setSelectedSize('');
    else setSelectedColor('');
    setOrderMessage('');
  }, [colorUnavailable, selectedColor, selectedSize, sizeUnavailable]);

  useEffect(() => {
    if (page >= gallery.length) setPage(0);
  }, [gallery.length, page]);

  useEffect(() => {
    if (!orderAdded) return undefined;
    const timer = setTimeout(() => setOrderAdded(false), 2_200);
    return () => clearTimeout(timer);
  }, [orderAdded]);

  const chromeOpacity = scrollY.interpolate({
    inputRange: [Math.max(80, expandedOffset - 130), expandedOffset],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  /**
   * « Brouillard » de la photo (référence Zalando, 17/10/2026) : la fiche monte
   * SUR la photo, et la photo se voile puis se floute à mesure qu'elle disparaît
   * sous la fiche. Cinq paliers seulement — un flou continu ferait recommencer
   * le rendu de l'image à chaque image de défilement.
   */
  const [haze, setHaze] = useState(0);
  /**
   * Le défilement alimente `scrollY` et le brouillard dans le MÊME geste :
   * `useNativeDriver` n'appelle pas les écouteurs JS, donc la valeur est écrite
   * ici (pas d'`Animated.event` natif) — l'en-tête et le voile restent au même
   * cran. Cinq paliers seulement : le flou ne se recalcule pas à chaque frame.
   */
  const onDrawerScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event?.nativeEvent?.contentOffset?.y ?? 0;
    // `scrollY` pilote l'en-tête (fondu) : il est alimenté ici, en JS, pour que
    // le brouillard et l'en-tête restent exactement au même cran du défilement.
    scrollY.setValue(offset);
    const start = heroHeight * 0.3;
    const end = Math.max(start + 1, expandedOffset);
    const progress = Math.max(0, Math.min(1, (offset - start) / (end - start)));
    const step = Math.round(progress * (HAZE_STEPS - 1));
    setHaze((current) => (current === step ? current : step));
  }, [expandedOffset, heroHeight, scrollY]);
  const hazeBlur = HAZE_BLUR[haze];
  const hazeVeil = HAZE_VEIL[haze];

  const onMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    setPage(Math.max(0, Math.min(gallery.length - 1, next)));
  }, [gallery.length, width]);

  const promptChoice = useCallback(() => {
    setOrderMessage(
      missingKind === 'size' ? t('lens.product.chooseSize')
        : missingKind === 'color' ? t('lens.product.chooseColor')
          : t('lens.product.chooseOption'),
    );
    if (missingKind === 'size' || missingKind === 'both') {
      setSizeOpenRequest((value) => value + 1);
      return;
    }
    setColorAttention(true);
    scrollRef.current?.scrollTo?.({ y: Math.max(0, optionsY.current - 100), animated: theme.motion.reduced !== 0 });
  }, [missingKind, t, theme.motion.reduced]);

  const submitOrder = useCallback(async () => {
    if (orderLock.current || orderAdded) return;
    if (missing) {
      promptChoice();
      return;
    }
    if (!sessionId || actionableBlock) return;
    const payload = buildCartPayload({
      candidate,
      selection,
      size: resolvedSize,
      color: resolvedColor,
      quantity: 1,
      customerNote: '',
    });
    if (!payload) {
      setOrderMessage(t('lens.product.incomplete'));
      return;
    }
    orderLock.current = true;
    const requestId = ++orderRequestRef.current;
    setOrderBusy(true);
    setOrderMessage('');
    try {
      const result = await addExternalToCart({ payload, sessionId });
      const receivedAt = Date.now();
      void queryClient.invalidateQueries({ queryKey: ['cart'] }).catch(() => undefined);
      if (!mountedRef.current || requestId !== orderRequestRef.current) return;
      setAddedUnits(result.totalItemsCount);
      setAddedUnitsAt(receivedAt);
      setAddedDeadline(result.quoteExpiresAt);
      setAddedClockOffset(serverClockOffset(result.serverNow, receivedAt));
      setOrderAdded(true);
      setConfirmationOpen(true);
      Vibration.vibrate(28);
    } catch (error) {
      if (!mountedRef.current || requestId !== orderRequestRef.current) return;
      if (error instanceof ApiError) {
        if (error.code === 'VARIANT_AMBIGUOUS') setOrderMessage(t('lens.product.ambiguous'));
        else if (error.code === 'VARIANT_AVAILABILITY_UNKNOWN' || error.code === 'NO_CONTRACT') setOrderMessage(t('lens.product.availabilityUnknown'));
        else if (error.code === 'VARIANT_UNAVAILABLE' || error.code === 'VARIANT_SELECTION_INVALID' || error.code === 'VARIANT_NOT_FOUND') setOrderMessage(t('lens.product.variantRefused'));
        else if (error.code === 'INVALID_AYROVIX_PRICE_TOKEN') setOrderMessage(t('lens.product.expired'));
        else setOrderMessage(error.message || t('lens.product.orderFailed'));
      } else {
        setOrderMessage(t('lens.product.orderFailed'));
      }
    } finally {
      if (requestId === orderRequestRef.current) {
        orderLock.current = false;
        if (mountedRef.current) setOrderBusy(false);
      }
    }
  }, [
    actionableBlock, candidate, missing, orderAdded, promptChoice, queryClient,
    resolvedColor, resolvedSize, selection, sessionId, t,
  ]);

  const message = orderMessage || (actionableBlock ? t(BLOCK_KEY[actionableBlock]) : '');
  const actionLabel = orderAdded ? t('lens.product.added')
    : missingKind === 'size' ? t('lens.product.chooseSizeAction')
      : missingKind === 'color' ? t('lens.product.chooseColorAction')
        : missingKind === 'both' ? t('lens.product.chooseOptionsAction')
          : t('lens.product.order');

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.surface }]} testID="lens-product-view">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.headerBackdrop,
          {
            height: insets.top + 58,
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.line,
            opacity: chromeOpacity,
          },
        ]}
      />
      {/* EN-TÊTE (17/10/2026, fiche Zalando) : transparent et POSÉ SUR LA PHOTO
          — icônes NUES (aucune pastille blanche, aucune ombre en boîte), blanches
          sur la photo puis NOIRES quand l'en-tête devient plein. Le fondu est
          piloté par `chromeOpacity`, la couleur ne clignote jamais. */}
      <View
        pointerEvents="box-none"
        style={[styles.productHeader, { paddingTop: insets.top + 7, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
        testID="lens-product-header"
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('lens.product.back')}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIconButton, { opacity: pressed ? theme.opacity.subtle : 1 }]}
          testID="lens-header-back"
        >
          <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={23} color={LENS_COLORS.white} style={styles.crispIcon} accessibilityElementsHidden />
          <Animated.View
            pointerEvents="none"
            style={[styles.headerIconInk, { opacity: chromeOpacity }]}
            testID="lens-header-back-ink"
          >
            <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={23} color={LENS_COLORS.black} accessibilityElementsHidden />
          </Animated.View>
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.collapsedTitle, { opacity: chromeOpacity }]}>
          <AppText weight="bold" numberOfLines={1}>{candidate.title}</AppText>
        </Animated.View>
        <Pressable
          onPress={() => router.push('/cart')}
          accessibilityRole="button"
          accessibilityLabel={[
            `${t('tabs.cart')}: ${cartUnits}`,
            deadline ? (countdownExpired ? t('lens.cart.expired') : t('lens.cart.validFor', { time: countdown })) : '',
          ].filter(Boolean).join('. ')}
          style={({ pressed }) => [
            styles.cartRow,
            theme.isRTL ? styles.cartRowRTL : styles.cartRowLTR,
            { opacity: pressed ? theme.opacity.subtle : 1, flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
          ]}
          testID="lens-header-cart"
        >
          <Ionicons name="bag-handle-outline" size={19} color={LENS_COLORS.white} style={styles.crispIcon} accessibilityElementsHidden />
          <AppText weight="bold" style={styles.cartCountWhite}>{cartUnits}</AppText>
          {deadline ? (
            <AppText variant="caption" weight="bold" style={styles.cartCountdownWhite}>
              {countdownExpired ? t('lens.cart.expiredShort') : countdown}
            </AppText>
          ) : null}
          {/* Même contenu en encre : prend la main quand l'en-tête devient plein. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.headerIconInk, styles.cartRow, { opacity: chromeOpacity, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
            testID="lens-header-cart-ink"
          >
            <Ionicons name="bag-handle-outline" size={19} color={LENS_COLORS.black} accessibilityElementsHidden />
            <AppText weight="bold" style={styles.cartCount}>{cartUnits}</AppText>
            {deadline ? (
              <AppText variant="caption" weight="bold" style={{ color: countdownExpired ? LENS_COLORS.sale : LENS_COLORS.black }}>
                {countdownExpired ? t('lens.cart.expiredShort') : countdown}
              </AppText>
            ) : null}
          </Animated.View>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.productScroll, { paddingBottom: 96 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        directionalLockEnabled
        decelerationRate="fast"
        snapToOffsets={[0, expandedOffset]}
        snapToAlignment="start"
        snapToStart
        snapToEnd={false}
        onScroll={onDrawerScroll}
        testID="lens-product-drawer"
      >
        <View style={[styles.gallery, { width, height: heroHeight, backgroundColor: LENS_COLORS.white }]}>
          <ScrollView
            horizontal
            pagingEnabled
            directionalLockEnabled
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
          >
            {gallery.map((media, index) => (
              <ZoomableGalleryImage
                key={`${media.original}-${index}`}
                uri={media.uris[0] || media.original}
                fallbackUris={media.uris.slice(1)}
                label={`${candidate.title} ${index + 1}`}
                width={width}
                height={heroHeight}
                active={index === page}
                blurRadius={hazeBlur}
                onZoomChange={index === page ? setZoomed : () => undefined}
              />
            ))}
          </ScrollView>
          <View style={styles.heroFade} pointerEvents="none" />
          {/* Brouillard : la photo perd ses détails sous la fiche qui l'avale. */}
          <View
            pointerEvents="none"
            style={[styles.heroHaze, { opacity: hazeVeil }]}
            testID="lens-hero-haze"
          />
          {onFavorite ? (
            <Pressable
              onPress={() => onFavorite(candidate)}
              disabled={favorite}
              accessibilityRole="button"
              accessibilityLabel={favorite ? t('lens.favorited') : t('lens.favorite')}
              accessibilityState={{ selected: favorite, disabled: favorite }}
              style={({ pressed }) => [
                styles.favorite,
                theme.isRTL ? styles.favoriteRTL : styles.favoriteLTR,
                { top: insets.top + 66, opacity: favorite ? 0.72 : pressed ? theme.opacity.subtle : 1 },
              ]}
            >
              <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={22} color={favorite ? LENS_COLORS.active : LENS_COLORS.black} accessibilityElementsHidden />
            </Pressable>
          ) : null}
          {candidate.promo ? (
            <View style={[
              styles.promoBadge,
              theme.isRTL ? styles.promoBadgeRTL : styles.promoBadgeLTR,
              { borderRadius: theme.radius.full },
            ]}>
              <AppText variant="caption" weight="bold" style={styles.promoText}>{candidate.promo.label || t('lens.promo')}</AppText>
            </View>
          ) : null}
          <View style={[
            styles.counter,
            theme.isRTL ? styles.counterRTL : styles.counterLTR,
            { borderRadius: theme.radius.full },
          ]}>
            <AppText variant="caption" weight="bold" style={styles.counterText}>{`${page + 1}/${gallery.length}`}</AppText>
          </View>
        </View>

        <View
          style={[
            styles.detailsSheet,
            { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: theme.colors.surface },
          ]}
          testID="lens-product-sheet"
        >
          <Pressable
            onPress={() => scrollRef.current?.scrollTo?.({ y: expandedOffset, animated: theme.motion.reduced !== 0 })}
            accessibilityRole="button"
            accessibilityLabel={t('lens.sheet.expand')}
            style={styles.productSheetHandle}
            testID="lens-product-sheet-handle"
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.lineControl }]} />
          </Pressable>
          {candidate.brand ? <AppText weight="bold" style={styles.brand}>{candidate.brand}</AppText> : null}
          <AppText weight={candidate.brand ? 'regular' : 'bold'} style={styles.productTitle}>{candidate.title}</AppText>
          {candidate.ratingKind === 'merchant' && candidate.rating != null ? (
            <View style={[styles.ratingRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="star" size={17} color={theme.colors.ink} accessibilityElementsHidden />
              <AppText weight="bold">{candidate.rating.toFixed(1)}</AppText>
              {candidate.ratingCount ? <AppText variant="caption" color={theme.colors.muted}>{`(${candidate.ratingCount})`}</AppText> : null}
            </View>
          ) : null}
          <LensPriceBlock candidate={displayCandidate} compact={false} />
          {favoriteNote ? (
            <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{t(favoriteNote)}</AppText>
          ) : null}
          {resolvedSize || resolvedColor ? (
            <View style={[styles.choiceSummary, { backgroundColor: theme.colors.infoSoft, borderRadius: theme.radius.control }]}>
              <AppText variant="caption" color={theme.colors.muted}>
                {[resolvedSize && `${candidate.optionLabel || t('lens.product.size')}: ${resolvedSize}`, resolvedColor && `${t('lens.product.color')}: ${resolvedColor}`]
                  .filter(Boolean).join('  ·  ')}
              </AppText>
            </View>
          ) : null}

          <View onLayout={(event) => { optionsY.current = heroHeight + event.nativeEvent.layout.y; }} style={styles.optionsArea}>
            <OptionSelector
              label={candidate.optionLabel || t('lens.product.size')}
              values={candidate.sizes}
              value={resolvedSize}
              onChange={(value) => { lastChoiceRef.current = 'size'; setSelectedSize(value); setOrderMessage(''); }}
              openRequest={sizeOpenRequest}
              disabledValues={sizeUnavailable}
            />
            <ColorSelector
              candidate={candidate}
              value={resolvedColor}
              onChange={(value) => { lastChoiceRef.current = 'color'; setSelectedColor(value); setColorAttention(false); setOrderMessage(''); }}
              disabledValues={colorUnavailable}
              attention={colorAttention}
            />
          </View>

          {enriching ? (
            <View style={[styles.enrichingRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <LoadingSpinner size="sm" />
              <AppText variant="caption" color={theme.colors.muted}>{t('lens.product.enriching')}</AppText>
            </View>
          ) : null}

          <View style={styles.accordions}>
            <FactAccordion
              title={t('lens.product.description')}
              icon="document-text-outline"
              facts={[]}
              description={candidate.description}
              testID="lens-accordion-description"
            />
            <FactAccordion
              title={t('lens.product.characteristics')}
              icon="information-circle-outline"
              facts={characteristicFacts}
              testID="lens-accordion-characteristics"
            />
            <FactAccordion
              title={t('lens.product.material')}
              icon="layers-outline"
              facts={materialFacts}
              testID="lens-accordion-material"
            />
            <FactAccordion
              title={t('lens.product.fit')}
              icon="resize-outline"
              facts={fitFacts}
              testID="lens-accordion-fit"
            />
            <FactAccordion
              title={t('lens.product.care')}
              icon="water-outline"
              facts={careFacts}
              testID="lens-accordion-care"
            />
          </View>
        </View>
      </Animated.ScrollView>

      <View style={[
        styles.stickyAction,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
        },
      ]}>
        {message ? (
          <AppText variant="caption" style={{ color: theme.status.danger.fg }} numberOfLines={2} accessibilityRole="alert">
            {message}
          </AppText>
        ) : null}
        <Button
          label={actionLabel}
          tone="main"
          onPress={() => { void submitOrder(); }}
          disabled={!sessionId || Boolean(actionableBlock) || orderAdded}
          busy={orderBusy}
          testID="lens-add-to-cart"
          block
        />
      </View>

      <Modal
        visible={confirmationOpen}
        transparent
        animationType={theme.motion.reduced === 0 ? 'none' : 'slide'}
        onRequestClose={() => setConfirmationOpen(false)}
      >
        <View style={styles.confirmationBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setConfirmationOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View style={[
            styles.confirmationSheet,
            {
              paddingBottom: Math.max(insets.bottom, 18),
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              backgroundColor: theme.colors.surface,
            },
          ]}>
            <View style={[styles.confirmationIcon, { backgroundColor: theme.colors.infoSoft }]}>
              <Ionicons name="checkmark" size={26} color={theme.status.success.fg} accessibilityElementsHidden />
            </View>
            <AppText variant="title" weight="bold" align="center" accessibilityRole="header">
              {t('lens.cart.addedTitle')}
            </AppText>
            <AppText color={theme.colors.muted} align="center">{t('lens.cart.addedBody')}</AppText>
            {deadline ? (
              <View style={[styles.confirmationTimer, { backgroundColor: theme.colors.infoSoft }]}>
                <Ionicons name="time-outline" size={19} color={theme.colors.ink} accessibilityElementsHidden />
                <AppText weight="bold" style={{ color: theme.colors.ink }}>
                  {countdownExpired ? t('lens.cart.expired') : t('lens.cart.validFor', { time: countdown })}
                </AppText>
              </View>
            ) : null}
            <Button
              label={t('lens.cart.view')}
              tone="main"
              onPress={() => { setConfirmationOpen(false); router.push('/cart'); }}
              block
            />
            <Pressable onPress={() => setConfirmationOpen(false)} accessibilityRole="button" style={styles.continueShopping}>
              <AppText weight="semibold" align="center">{t('lens.cart.continue')}</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  productScroll: { minHeight: '100%' },
  headerBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  productHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    height: 108, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  // Icônes NUES (demande client 17/10/2026) : ni pastille blanche, ni boîte
  // d'ombre — l'icône pose directement sur la photo, lisible grâce à une ombre
  // de glyphe serrée (`crispIcon`), jamais grâce à un fond rapporté.
  headerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerIconInk: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  crispIcon: { textShadowColor: veil(0.55), textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  collapsedTitle: { position: 'absolute', left: 68, right: 154, height: 44, justifyContent: 'center' },
  cartRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 6 },
  cartRowLTR: { marginLeft: 'auto' },
  cartRowRTL: { marginRight: 'auto' },
  cartCount: { minWidth: 12, textAlign: 'center', color: LENS_COLORS.black },
  cartCountWhite: { minWidth: 12, textAlign: 'center', color: LENS_COLORS.white, textShadowColor: veil(0.55), textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  cartCountdownWhite: { color: LENS_COLORS.white, textShadowColor: veil(0.55), textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  gallery: { position: 'relative', overflow: 'hidden' },
  heroFade: { position: 'absolute', left: 0, right: 0, top: 0, height: 110, backgroundColor: veil(0.06) },
  heroHaze: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: frost(0.9) },
  favorite: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    backgroundColor: frost(0.94), alignItems: 'center', justifyContent: 'center',
    shadowColor: LENS_COLORS.black, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  favoriteLTR: { right: 14 },
  favoriteRTL: { left: 14 },
  promoBadge: { position: 'absolute', bottom: 18, backgroundColor: LENS_COLORS.sale, paddingHorizontal: 10, paddingVertical: 6 },
  promoBadgeLTR: { left: 14 },
  promoBadgeRTL: { right: 14 },
  promoText: { color: LENS_COLORS.white },
  counter: { position: 'absolute', bottom: 18, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: frost(0.9) },
  counterLTR: { right: 14 },
  counterRTL: { left: 14 },
  counterText: { color: LENS_COLORS.black },
  detailsSheet: {
    marginTop: -SPACE[4], minHeight: 500,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 8,
  },
  productSheetHandle: { height: 34, marginHorizontal: -SPACE[3], alignItems: 'center', justifyContent: 'center' },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center' },
  // Pas de couleur fixe : la fiche suit le thème (`ink`), lisible en clair comme en sombre.
  brand: { fontSize: 19, lineHeight: 24, marginTop: 2 },
  productTitle: { fontSize: 17, lineHeight: 23, marginBottom: 4 },
  ratingRow: { alignItems: 'center', gap: 6, minHeight: 24 },
  choiceSummary: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 8 },
  optionsArea: { gap: 12, marginTop: 4 },
  optionBlock: { gap: 8, paddingTop: 4 },
  selector: { minHeight: 58, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', gap: 12 },
  selectorValue: { flex: 1 },
  unavailableOption: { textDecorationLine: 'line-through' },
  colorRow: { gap: 8, paddingEnd: 4 },
  colorChoice: { width: 72, height: 98, gap: 4, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 4 },
  colorImage: { width: '100%', flex: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: veil(0.42) },
  optionSheet: { maxHeight: '72%', paddingTop: 12, paddingHorizontal: 20, gap: 10 },
  optionList: { flexShrink: 1 },
  optionRow: { minHeight: 54, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 12 },
  enrichingRow: { minHeight: 42, alignItems: 'center', gap: 12, marginTop: 4 },
  accordions: { marginTop: 8 },
  accordion: { borderTopWidth: StyleSheet.hairlineWidth },
  accordionHeader: { minHeight: 60, alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  accordionHeading: { flex: 1, alignItems: 'center', gap: 12 },
  accordionTitle: { fontSize: 16 },
  accordionBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingBottom: 16 },
  description: { fontSize: 15, lineHeight: 23, paddingVertical: 8 },
  factRow: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start', gap: 16, paddingVertical: 12 },
  factLabel: { width: '36%', lineHeight: 19 },
  factValue: { flex: 1, lineHeight: 20 },
  stickyAction: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 24,
    borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 10, gap: 8,
    shadowColor: LENS_COLORS.black, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 12,
  },
  confirmationBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: veil(0.46) },
  confirmationSheet: { paddingHorizontal: 24, paddingTop: 24, gap: 12, alignItems: 'center' },
  confirmationIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  confirmationTimer: { minHeight: 44, alignSelf: 'stretch', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  continueShopping: { minHeight: 44, alignSelf: 'stretch', justifyContent: 'center' },
  zoomViewport: { overflow: 'hidden' },
  zoomContent: { flex: 1 },
  fullscreenImage: { width: '100%', height: '100%' },
});
