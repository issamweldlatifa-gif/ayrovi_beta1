/**
 * Z Lens — visionneuse PLEIN ÉCRAN de la galerie produit (référence Zalando).
 *
 * Une pression sur la photo l'ouvre ; elle remplit alors tout l'écran, en noir,
 * avec le zoom au pincement et le défilement entre les vues. Deux sorties, pas
 * une seule — un bouton fermer explicite ET un glisser vers le bas — parce
 * qu'un geste seul laisse toujours quelqu'un dehors.
 *
 * Rien n'est chargé deux fois : la visionneuse affiche les MÊMES adresses que
 * la galerie, déjà en cache disque (`expo-image`), et démarre sur la photo
 * regardée.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View,
  useWindowDimensions,
} from 'react-native';

import type { LensMediaItem } from './lensMedia';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { AppText } from '@/design/ui';
import { SPACE } from '@/design/tokens.generated';
import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';

/** Course verticale au-delà de laquelle on referme (en points). */
const DISMISS_TRAVEL = 110;

export function LensGalleryViewer({
  visible,
  media,
  startIndex,
  onClose,
}: {
  visible: boolean;
  media: readonly LensMediaItem[];
  startIndex: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (visible) { setPage(startIndex); shift.setValue(0); } }, [shift, startIndex, visible]);

  // Glisser vers le bas pour refermer — désactivé pendant un zoom, où le doigt
  // appartient à l'image (déplacement dans le cadre), pas à la fermeture.
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => !zoomed
      && Math.abs(gesture.dy) > Math.abs(gesture.dx)
      && Math.abs(gesture.dy) > 10,
    onPanResponderMove: (_event, gesture) => shift.setValue(gesture.dy),
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dy) > DISMISS_TRAVEL) {
        onClose();
        return;
      }
      Animated.spring(shift, { toValue: 0, damping: 24, stiffness: 260, mass: 0.7, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => shift.setValue(0),
  }), [onClose, shift, zoomed]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} testID="lens-gallery-viewer">
      <StatusBar style="light" />
      <View style={styles.root} {...responder.panHandlers}>
        <Animated.View
          style={[styles.stage, { width, height, transform: [{ translateY: shift }] }]}
          testID="lens-gallery-viewer-stage"
        >
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!zoomed && media.length > 1}
            contentOffset={{ x: startIndex * width, y: 0 }}
            onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))}
          >
            {media.map((item, index) => (
              <ViewerImage
                key={`${item.original}-${index}`}
                uris={item.uris}
                fallback={item.original}
                width={width}
                height={height}
                active={index === page}
                onZoomChange={index === page ? setZoomed : () => undefined}
              />
            ))}
          </ScrollView>
        </Animated.View>

        <View style={[styles.chrome, { paddingTop: SPACE[3], flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={10}
            style={({ pressed }) => [styles.closeButton, { opacity: pressed ? theme.opacity.subtle : 1 }]}
            testID="lens-gallery-viewer-close"
          >
            <Ionicons name="close" size={theme.iconSize.md} color={LENS_COLORS.white} style={styles.crispIcon} accessibilityElementsHidden />
          </Pressable>
          {media.length > 1 ? (
            <View style={styles.counter}>
              <AppText variant="caption" weight="bold" style={styles.counterText}>{`${page + 1}/${media.length}`}</AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** Une vue de la visionneuse : pincement et double pression, sans décor. */
function ViewerImage({
  uris, fallback, width, height, active, onZoomChange,
}: {
  uris: readonly string[];
  fallback: string;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const scale = useRef(new Animated.Value(1)).current;
  const zoomedRef = useRef(false);

  const applyScale = (value: number) => {
    scale.setValue(value);
    const next = value > 1.01;
    if (next !== zoomedRef.current) {
      zoomedRef.current = next;
      onZoomChange(next);
    }
  };

  useEffect(() => { if (!active) applyScale(1); }, [active]);

  const pinch = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponder: (event) => event.nativeEvent.touches.length >= 2,
    onPanResponderMove: (event) => {
      const touches = event.nativeEvent.touches;
      if (touches.length < 2) return;
      const distance = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
      applyScale(Math.max(1, Math.min(4, distance / (Math.min(width, height) * 0.5))));
    },
    onPanResponderRelease: () => { if (!zoomedRef.current) applyScale(1); },
  }), [height, width]);

  const onPress = () => applyScale(zoomedRef.current ? 1 : 2);

  return (
    <Pressable {...pinch.panHandlers} onPress={onPress} style={[styles.viewerImage, { width, height }]}>
      <Animated.Image
        source={{ uri: uris[sourceIndex] || fallback }}
        style={[styles.viewerMedia, { width, height, transform: [{ scale }] }]}
        resizeMode="contain"
        onError={() => setSourceIndex((current) => (current + 1 < uris.length ? current + 1 : current))}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LENS_COLORS.black, justifyContent: 'center' },
  stage: { alignSelf: 'center' },
  viewerImage: { alignItems: 'center', justifyContent: 'center' },
  viewerMedia: { backgroundColor: LENS_COLORS.black },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, alignItems: 'center' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  crispIcon: { textShadowColor: veil(0.55), textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  counter: { marginStart: 'auto', paddingHorizontal: 6, paddingVertical: 4 },
  counterText: {
    color: LENS_COLORS.white,
    textShadowColor: veil(0.55), textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
});
