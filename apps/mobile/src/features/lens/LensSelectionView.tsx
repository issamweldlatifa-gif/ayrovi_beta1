/** Tap-to-ground: the product region stays sharp, everything outside it is truly blurred.
 * No resize handles, white dots, manual box dragging or synthetic tap-centred region. */
import { useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { LensBox, LensDetectedProduct } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import { LensSearchRing } from './LensSearchRing';
import { LENS_COLORS } from './lensPalette';
import {
  boxToRect,
  containRect,
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
          blurRadius={selected ? 18 : 0}
          accessibilityLabel={t('lens.capturedPhoto')}
        />
        {selected ? (
          <View
            pointerEvents="none"
            style={[
              styles.focus,
              { left: frame.x, top: frame.y, width: frame.w, height: frame.h },
            ]}
            testID="lens-selected-product"
          >
            <AppImage
              uri={uri}
              contentFit="fill"
              decorative
              style={{
                position: 'absolute',
                left: -frame.x,
                top: -frame.y,
                width: image.w,
                height: image.h,
              }}
            />
            {searching ? (
              <LensSearchRing width={frame.w} height={frame.h} />
            ) : null}
          </View>
        ) : null}
      </Pressable>
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
  focus: { position: 'absolute', overflow: 'hidden' },
  notice: { alignSelf: 'center', padding: 12 },
});
