/**
 * Z Lens — photo prise ou importée + cadre de sélection aux coins arrondis.
 *
 * Le cadre n'est pas un décor : il DÉSIGNE le produit cherché.
 *  • Il se pose d'office sur le seul produit, ou sur le plus grand (décision
 *    prise par l'écran parent avec `biggestProductIndex`).
 *  • Toucher un autre produit (son point blanc OU le produit lui-même) le
 *    sélectionne : le cadre prend la forme de ce produit.
 *  • Les coins s'étirent au doigt, l'intérieur se déplace.
 * Chaque changement validé remonte par `onCommit` ; le parent relance alors la
 * recherche sur cette zone (`roi` de `/analyze-image`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import type { LensBox, LensDetectedProduct } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { frost, veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { LensSearchRing } from './LensSearchRing';
import { LENS_COLORS } from './lensPalette';
import {
  boxToRect, containRect, cornerAt, iou, moveSelection, pointInImage, productIndexAt, rectContains,
  resizeSelection, zoneAround, type Corner,
} from './lensSelection';

export type SelectionCommit =
  | { kind: 'product'; index: number }
  | { kind: 'zone'; box: LensBox };

interface Props {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  /** Zone disponible pour la photo, en points écran. */
  top: number;
  height: number;
  width: number;
  products: readonly LensDetectedProduct[];
  selection: LensBox;
  selectedIndex: number;
  detecting: boolean;
  /**
   * La zone encadrée est EN TRAIN d'être cherchée (16/10/2026) : une couronne
   * de points et un balayage la désignent, et le reste de la photo s'assombrit
   * davantage — on voit où porte la recherche, sans jamais l'inventer.
   */
  searching?: boolean;
  onCommit: (commit: SelectionCommit) => void;
}

type Drag = { kind: 'resize'; corner: Corner } | { kind: 'move' } | { kind: 'tap' };

const DRAG_SLOP = 6;

export function LensSelectionView({
  uri, imageWidth, imageHeight, top, height, width, products, selection, selectedIndex, detecting, searching, onCommit,
}: Props) {
  const theme = useTheme();
  const t = useT();
  const image = useMemo(
    () => containRect(width, height, imageWidth || 3, imageHeight || 4),
    [height, imageHeight, imageWidth, width],
  );
  const [draft, setDraft] = useState<LensBox | null>(null);
  const shown = draft ?? selection;
  const frame = boxToRect(shown, { x: 0, y: 0, w: image.w, h: image.h });

  // Les gestionnaires lisent des refs : le PanResponder est créé une seule fois.
  const live = useRef({ selection, products, image, onCommit });
  live.current = { selection, products, image, onCommit };
  const drag = useRef<{ mode: Drag; start: LensBox; x: number; y: number; moved: boolean } | null>(null);
  const draftRef = useRef<LensBox | null>(null);

  useEffect(() => {
    // Nouvelle sélection venue du parent (produit touché, autre photo) : on lâche le brouillon.
    draftRef.current = null;
    setDraft(null);
  }, [selection]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      const { selection: current, image: shownImage } = live.current;
      const rect = boxToRect(current, { x: 0, y: 0, w: shownImage.w, h: shownImage.h });
      const corner = cornerAt(rect, locationX, locationY, 34);
      const mode: Drag = corner ? { kind: 'resize', corner } : rectContains(rect, locationX, locationY) ? { kind: 'move' } : { kind: 'tap' };
      drag.current = { mode, start: current, x: locationX, y: locationY, moved: false };
    },
    onPanResponderMove: (_event, gesture) => {
      const state = drag.current;
      if (!state) return;
      if (!state.moved && Math.abs(gesture.dx) + Math.abs(gesture.dy) < DRAG_SLOP) return;
      state.moved = true;
      if (state.mode.kind === 'tap') return;
      const { image: shownImage } = live.current;
      const dx = gesture.dx / Math.max(1, shownImage.w);
      const dy = gesture.dy / Math.max(1, shownImage.h);
      const next = state.mode.kind === 'resize'
        ? resizeSelection(state.start, state.mode.corner, dx, dy)
        : moveSelection(state.start, dx, dy);
      draftRef.current = next;
      setDraft(next);
    },
    onPanResponderRelease: () => {
      const state = drag.current;
      drag.current = null;
      if (!state) return;
      const { products: found, image: shownImage, onCommit: commit, selection: current } = live.current;
      if (state.moved) {
        const next = draftRef.current;
        if (state.mode.kind !== 'tap' && next && iou(next, current) < 0.995) commit({ kind: 'zone', box: next });
        return;
      }
      // Toucher sans glisser : le produit sous le doigt, sinon une zone autour du doigt.
      const point = pointInImage(state.x, state.y, { x: 0, y: 0, w: shownImage.w, h: shownImage.h });
      const index = productIndexAt(found, point);
      if (index >= 0) commit({ kind: 'product', index });
      else if (state.mode.kind === 'tap') commit({ kind: 'zone', box: zoneAround(point) });
    },
    onPanResponderTerminate: () => {
      drag.current = null;
      draftRef.current = null;
      setDraft(null);
    },
  }), []);

  // Pendant le repérage, le cadre « respire » : la photo est en cours de lecture.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!detecting || theme.motion.reduced === 0) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [detecting, pulse, theme.motion.reduced]);

  // Voile hors cadre : il s'épaissit pendant la recherche pour isoler la zone lue.
  const dimLevel = useRef(new Animated.Value(DIM_REST)).current;
  useEffect(() => {
    const to = searching ? DIM_SEARCH : DIM_REST;
    if (theme.motion.reduced === 0) { dimLevel.setValue(to); return undefined; }
    const anim = Animated.timing(dimLevel, { toValue: to, duration: 220, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [dimLevel, searching, theme.motion.reduced]);

  return (
    <View style={[styles.area, { top, height }]} testID="lens-selection">
      <View
        style={[styles.image, { left: image.x, top: image.y, width: image.w, height: image.h, borderRadius: theme.radius.xs }]}
        {...responder.panHandlers}
        testID="lens-selection-surface"
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <AppImage
            uri={uri}
            contentFit="fill"
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t('lens.capturedPhoto')}
            testID="lens-captured-preview"
          />
        </View>
        {/* Voile hors du cadre : la zone cherchée reste seule en pleine lumière. */}
        <Animated.View pointerEvents="none" style={[styles.dim, { left: 0, top: 0, width: image.w, height: frame.y, opacity: dimLevel }]} />
        <Animated.View pointerEvents="none" style={[styles.dim, { left: 0, top: frame.y + frame.h, width: image.w, height: Math.max(0, image.h - frame.y - frame.h), opacity: dimLevel }]} />
        <Animated.View pointerEvents="none" style={[styles.dim, { left: 0, top: frame.y, width: frame.x, height: frame.h, opacity: dimLevel }]} />
        <Animated.View pointerEvents="none" style={[styles.dim, { left: frame.x + frame.w, top: frame.y, width: Math.max(0, image.w - frame.x - frame.w), height: frame.h, opacity: dimLevel }]} />
        <Animated.View
          pointerEvents="none"
          style={[styles.frame, { left: frame.x, top: frame.y, width: frame.w, height: frame.h, opacity: pulse }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('lens.select.frame')}
          testID="lens-selection-frame"
        >
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          {searching ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <LensSearchRing width={frame.w} height={frame.h} />
            </View>
          ) : null}
        </Animated.View>
        {detecting ? null : products.map((product, index) => {
          if (index === selectedIndex) return null;
          const rect = boxToRect(product.box, { x: 0, y: 0, w: image.w, h: image.h });
          return (
            <Pressable
              key={`${product.name}-${index}`}
              onPress={() => onCommit({ kind: 'product', index })}
              accessibilityRole="button"
              accessibilityLabel={t('lens.select.product', { name: product.name })}
              hitSlop={12}
              style={[styles.dot, { left: rect.x + rect.w / 2 - DOT / 2, top: rect.y + rect.h / 2 - DOT / 2 }]}
              testID={`lens-product-dot-${index}`}
            />
          );
        })}
      </View>
    </View>
  );
}

const DOT = 30;
const CORNER = 34;
const STROKE = 5;
/** Voile hors cadre : 0.45 au repos, 0.66 pendant la recherche (zone lue isolée). */
const DIM_REST = 0.45;
const DIM_SEARCH = 0.66;

const styles = StyleSheet.create({
  area: { position: 'absolute', left: 0, right: 0 },
  image: { position: 'absolute', overflow: 'hidden' },
  dim: { position: 'absolute', backgroundColor: veil(1) },
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: LENS_COLORS.white },
  cornerTL: { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 16 },
  cornerTR: { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 16 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: 16 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: 16 },
  // Point blanc cerclé d'un halo clair : un produit qu'on peut choisir.
  dot: {
    position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: LENS_COLORS.white,
    borderWidth: 6, borderColor: frost(0.45),
  },
});
