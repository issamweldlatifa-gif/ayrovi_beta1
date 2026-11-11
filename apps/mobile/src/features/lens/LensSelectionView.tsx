/**
 * Z Lens — sélection d'un produit « comme Pinterest Lens » (11/11/2026).
 *
 * Retour du propriétaire : « نقاط و مربع وصوره بيظاء تحتها » — la couronne de
 * points, le carré et le flou ne disaient pas clairement QUEL objet est
 * cherché. Référence (captures Pinterest) :
 *   • toute la photo légèrement ASSOMBRIE (voile, pas de flou) ;
 *   • le produit choisi reste NET dans un cadre aux coins arrondis ;
 *   • deux ARCS blancs posés aux coins opposés (haut-droit, bas-gauche) ;
 *   • tout à la taille du produit : grand produit → grand cadre et grands
 *     arcs, petit produit → petits (`focusGeometry`) ;
 *   • toucher un autre produit : le cadre GLISSE jusqu'à lui.
 * Pendant la recherche, les arcs respirent (mouvement réduit : immobiles).
 * Pas de poignées, pas de cadre manuel, pas de zone inventée autour du doigt.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { LensBox, LensDetectedProduct } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { frost, veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';
import {
  boxToRect,
  containRect,
  focusGeometry,
  isFullFrame,
  productIndexAt,
} from './lensSelection';
export type SelectionCommit =
  | { kind: 'product'; index: number }
  | { kind: 'point'; point: { x: number; y: number } };
interface Props {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  top: number;
  height: number;
  width: number;
  products: readonly LensDetectedProduct[];
  selection: LensBox;
  selectedIndex: number;
  detecting: boolean;
  searching?: boolean;
  onCommit: (commit: SelectionCommit) => void;
}
/** Voile posé sur toute la photo dès qu'un produit est choisi. */
export const FOCUS_DIM = 0.45;
/** Durée du glissement du cadre d'un produit à l'autre. */
const GLIDE_MS = 240;
export function LensSelectionView({
  uri,
  imageWidth,
  imageHeight,
  top,
  height,
  width,
  products,
  selection,
  selectedIndex,
  detecting,
  searching,
  onCommit,
}: Props) {
  const t = useT();
  const targetRef = useRef<View>(null);
  const image = useMemo(
    () => containRect(width, height, imageWidth || 3, imageHeight || 4),
    [width, height, imageWidth, imageHeight]
  );
  const frame = boxToRect(selection, { x: 0, y: 0, w: image.w, h: image.h });
  const selected = selectedIndex >= 0 && !isFullFrame(selection);
  const theme = useTheme();
  const reduced = theme.motion.reduced === 0;
  const geometry = focusGeometry(frame.w, frame.h);

  // Cadre animé : il glisse et change de taille d'un produit à l'autre.
  const fx = useRef(new Animated.Value(frame.x)).current;
  const fy = useRef(new Animated.Value(frame.y)).current;
  const fw = useRef(new Animated.Value(frame.w)).current;
  const fh = useRef(new Animated.Value(frame.h)).current;
  const shown = useRef(selected);
  useEffect(() => {
    const values: [Animated.Value, number][] = [[fx, frame.x], [fy, frame.y], [fw, frame.w], [fh, frame.h]];
    if (!selected) { shown.current = false; return undefined; }
    // Première apparition, ou mouvement réduit : le cadre se pose directement.
    if (reduced || !shown.current) {
      values.forEach(([value, to]) => value.setValue(to));
      shown.current = true;
      return undefined;
    }
    const glide = Animated.parallel(values.map(([value, to]) =>
      Animated.timing(value, { toValue: to, duration: GLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false })));
    glide.start();
    return () => glide.stop();
  }, [fx, fy, fw, fh, frame.x, frame.y, frame.w, frame.h, reduced, selected]);

  // Recherche en cours : les arcs « respirent ».
  const breath = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!searching || reduced) { breath.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 0.45, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [breath, reduced, searching]);
  const arcOffset = geometry.radius - geometry.arc;
  return (
    <View style={[styles.area, { top, height }]} testID="lens-selection-view">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('lens.select.frame')}
        accessibilityValue={{ text: products[selectedIndex]?.name }}
        accessibilityActions={products.map((product, index) => ({ name: `select-product-${index}`, label: t('lens.select.product', { name: product.name }) }))}
        onAccessibilityAction={event => {
          const index = products.findIndex((_, i) => event.nativeEvent.actionName === `select-product-${i}`);
          if (index >= 0) onCommit({ kind: 'product', index });
        }}
        ref={targetRef}
        onPress={(event) => {
          const commitAt = (x: number, y: number) => {
            if (![x, y].every(Number.isFinite) || !image.w || !image.h) return;
            const point = {
              x: Math.max(0, Math.min(1, x / image.w)),
              y: Math.max(0, Math.min(1, y / image.h)),
            };
            const index = productIndexAt(products, point);
            onCommit(
              index >= 0 ? { kind: 'product', index } : { kind: 'point', point }
            );
          };
          const { pageX, pageY, locationX, locationY } = event.nativeEvent;
          // Web click offsets belong to the nested image, not necessarily the
          // Pressable. Measure its window origin instead of guessing a crop.
          if (
            Platform.OS === 'web' &&
            Number.isFinite(pageX) &&
            Number.isFinite(pageY)
          ) {
            targetRef.current?.measureInWindow((x, y) =>
              commitAt(pageX - x, pageY - y)
            );
          } else commitAt(locationX, locationY);
        }}
        testID="lens-product-target"
        style={[
          styles.image,
          { left: image.x, top: image.y, width: image.w, height: image.h },
        ]}
      >
        <AppImage
          testID="lens-captured-preview"
          uri={uri}
          contentFit="fill"
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('lens.capturedPhoto')}
        />
        {selected ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} testID="lens-focus-dim" />
        ) : null}
      </Pressable>
      {selected ? (
        /* Hors de la photo (non rognée) : les arcs peuvent déborder du bord. */
        <Animated.View
          pointerEvents="none"
          style={[styles.frame, { left: Animated.add(fx, image.x), top: Animated.add(fy, image.y), width: fw, height: fh }]}
          accessibilityState={{ busy: !!searching }}
          testID="lens-selected-product"
        >
          <View style={[StyleSheet.absoluteFill, styles.crop, { borderRadius: geometry.radius }]}>
            <Animated.View
              style={{
                position: 'absolute',
                left: Animated.multiply(fx, -1),
                top: Animated.multiply(fy, -1),
                width: image.w,
                height: image.h,
              }}
            >
              <AppImage uri={uri} contentFit="fill" decorative style={StyleSheet.absoluteFill} />
            </Animated.View>
          </View>
          <Animated.View
            style={[styles.arc, {
              width: geometry.arc,
              height: geometry.arc,
              top: arcOffset,
              right: arcOffset,
              borderTopWidth: geometry.stroke,
              borderRightWidth: geometry.stroke,
              borderTopRightRadius: geometry.arc,
              opacity: breath,
            }]}
            testID="lens-focus-arc-top"
          />
          <Animated.View
            style={[styles.arc, {
              width: geometry.arc,
              height: geometry.arc,
              bottom: arcOffset,
              left: arcOffset,
              borderBottomWidth: geometry.stroke,
              borderLeftWidth: geometry.stroke,
              borderBottomLeftRadius: geometry.arc,
              opacity: breath,
            }]}
            testID="lens-focus-arc-bottom"
          />
        </Animated.View>
      ) : null}
      {detecting ? (
        <View
          pointerEvents="none"
          style={styles.notice}
          accessibilityLiveRegion="polite"
        >
          <AppText color={LENS_COLORS.white}>
            {t('lens.select.detecting')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  area: { position: 'absolute', left: 0, right: 0 },
  image: { position: 'absolute', overflow: 'hidden' },
  dim: { backgroundColor: veil(FOCUS_DIM) },
  frame: { position: 'absolute' },
  crop: { overflow: 'hidden' },
  // Arc blanc légèrement transparent, comme la référence.
  arc: { position: 'absolute', borderColor: frost(0.9) },
  notice: { alignSelf: 'center', padding: 12 },
});
