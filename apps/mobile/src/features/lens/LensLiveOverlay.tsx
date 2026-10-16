/**
 * Z Lens — Live : le cadre aux coins arrondis posé sur l'aperçu caméra.
 *
 * Tant qu'aucun produit n'est repéré, le cadre attend au centre et « respire ».
 * Dès qu'un repérage revient, il glisse sur le produit choisi (le seul, ou le
 * plus grand) avec son nom ; un point blanc marque chaque autre produit.
 * Toucher un point — ou le produit lui-même — le sélectionne.
 *
 * Les boîtes sont normalisées sur l'image capturée ; l'aperçu remplit l'écran
 * en débordant (`cover`), d'où `coverRect` pour les replacer à l'écran.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import type { LensDetectedProduct } from '@/api/lens';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { frost, veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';
import { boxToRect, clampRectToArea, coverRect, pointInImage, productIndexAt, type Rect } from './lensSelection';

interface Props {
  detected: boolean;
  products: readonly LensDetectedProduct[];
  selected: number;
  /** Taille de l'image analysée (les boîtes sont relatives à elle). */
  photo: { width: number; height: number } | null;
  width: number;
  height: number;
  /** Bande visible entre l'en-tête et le panneau du bas. */
  visibleTop: number;
  visibleBottom: number;
  onSelect: (index: number) => void;
}

const PAD = 8;
const CHIP_H = 30;

export function LensLiveOverlay({
  detected, products, selected, photo, width, height, visibleTop, visibleBottom, onSelect,
}: Props) {
  const theme = useTheme();
  const t = useT();
  const image = useMemo(
    () => (photo ? coverRect(width, height, photo.width, photo.height) : null),
    [height, photo, width],
  );
  const active = detected && image && selected >= 0 ? products[selected] ?? null : null;

  const target: Rect = useMemo(() => {
    if (active && image) {
      const rect = boxToRect(active.box, image);
      const area = { left: PAD, top: visibleTop + PAD, right: width - PAD, bottom: visibleBottom - PAD };
      return clampRectToArea({ x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 }, area, 56);
    }
    // Attente : cadre centré dans la bande visible.
    const bandH = Math.max(120, visibleBottom - visibleTop);
    return { x: width * 0.14, y: visibleTop + bandH * 0.16, w: width * 0.72, h: bandH * 0.6 };
  }, [active, image, visibleBottom, visibleTop, width]);

  const layout = useRef({
    x: new Animated.Value(target.x),
    y: new Animated.Value(target.y),
    w: new Animated.Value(target.w),
    h: new Animated.Value(target.h),
  }).current;
  useEffect(() => {
    const duration = theme.motion.reduced === 0 ? 0 : 280;
    Animated.parallel([
      Animated.timing(layout.x, { toValue: target.x, duration, useNativeDriver: false }),
      Animated.timing(layout.y, { toValue: target.y, duration, useNativeDriver: false }),
      Animated.timing(layout.w, { toValue: target.w, duration, useNativeDriver: false }),
      Animated.timing(layout.h, { toValue: target.h, duration, useNativeDriver: false }),
    ]).start();
  }, [layout, target.h, target.w, target.x, target.y, theme.motion.reduced]);

  // En attente, le cadre « respire » ; posé sur un produit, il reste net.
  const breath = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active || theme.motion.reduced === 0) {
      breath.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      Animated.timing(breath, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, breath, theme.motion.reduced]);

  const onSurfacePress = (event: GestureResponderEvent) => {
    if (!detected || !image) return;
    const { locationX, locationY } = event.nativeEvent;
    const index = productIndexAt(products, pointInImage(locationX, locationY, image));
    if (index >= 0 && index !== selected) onSelect(index);
  };

  const chipInside = target.y - CHIP_H - PAD < visibleTop;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="lens-live-overlay">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onSurfacePress}
        disabled={!detected}
        accessible={false}
        importantForAccessibility="no"
        testID="lens-live-surface"
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.frame, { left: layout.x, top: layout.y, width: layout.w, height: layout.h }]}
        testID={active ? 'lens-live-frame-locked' : 'lens-live-frame-scanning'}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: breath }]}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </Animated.View>
        {active ? (
          <View
            style={[styles.chip, chipInside ? styles.chipInside : styles.chipAbove, { backgroundColor: veil(0.75), flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
            accessibilityLiveRegion="polite"
          >
            <View style={styles.chipDot} />
            <AppText variant="caption" weight="bold" color={LENS_COLORS.white} numberOfLines={1}>{active.name}</AppText>
          </View>
        ) : null}
      </Animated.View>
      {detected && image ? products.map((product, index) => {
        if (index === selected) return null;
        const rect = boxToRect(product.box, image);
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        if (cy < visibleTop + PAD || cy > visibleBottom - PAD || cx < 0 || cx > width) return null;
        return (
          <Pressable
            key={`${product.name}-${index}`}
            onPress={() => onSelect(index)}
            accessibilityRole="button"
            accessibilityLabel={t('lens.select.product', { name: product.name })}
            hitSlop={12}
            style={[styles.dot, { left: cx - DOT / 2, top: cy - DOT / 2 }]}
            testID={`lens-live-dot-${index}`}
          />
        );
      }) : null}
    </View>
  );
}

const DOT = 30;
const CORNER = 34;
const STROKE = 4;

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: LENS_COLORS.white },
  cornerTL: { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 18 },
  cornerTR: { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 18 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: 18 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: 18 },
  chip: { position: 'absolute', height: CHIP_H, maxWidth: 260, borderRadius: CHIP_H / 2, paddingHorizontal: 12, alignItems: 'center', gap: 8 },
  chipAbove: { left: 0, top: -(CHIP_H + PAD) },
  chipInside: { left: 10, top: 10 },
  chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LENS_COLORS.activeSoft },
  dot: {
    position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: LENS_COLORS.white,
    borderWidth: 6, borderColor: frost(0.45),
  },
});
