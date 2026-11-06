import { useRef, useState } from 'react';
import { Animated, Modal, PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedPost } from '@/api/publicationFeed';
import { AppText } from '@/design/ui';
import { VIDEO_BACKDROP, PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { PublicationMedia } from './PublicationMedia';
import { finishesPublicationDismiss, startsPublicationDismiss } from './publicationGestures';

function useDismissGesture(onClose: () => void, atTop: () => boolean) {
  const offset = useRef(new Animated.Value(0)).current;
  const close = useRef(onClose); close.current = onClose;
  const top = useRef(atTop); top.current = atTop;
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => startsPublicationDismiss(g.dx, g.dy, top.current()),
    onMoveShouldSetPanResponder: (_, g) => startsPublicationDismiss(g.dx, g.dy, top.current()),
    onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (finishesPublicationDismiss(g.dy, g.vy)) { offset.setValue(0); close.current(); }
      else Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  return { ...responder.panHandlers, style: { flex: 1, transform: [{ translateY: offset }] } };
}
/** Separate reading and media-only modes. Hardware back / accessibility escape remain available. */
export function PublicationViewer({ post, onClose }: { post: FeedPost; owner: string; onClose: () => void; onPreference: (action: string, id: string) => void }) {
  const [gallery, setGallery] = useState(false); const [index, setIndex] = useState(0);
  const scrollY = useRef(0); const insets = useSafeAreaInsets();
  const detailGesture = useDismissGesture(onClose, () => scrollY.current <= 0);
  const galleryGesture = useDismissGesture(() => setGallery(false), () => true);
  const description = post.content?.description || post.subtitle;
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View testID="publication-reader" style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View testID="publication-reader-gesture" {...detailGesture} onAccessibilityEscape={onClose} accessibilityActions={[{ name: 'escape', label: 'Fermer la publication' }]} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'escape') onClose(); }}>
        <ScrollView contentContainerStyle={styles.content} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
          <PublicationMedia post={post} active={!gallery} onOpen={i => { setIndex(i); setGallery(true); }} />
          <View style={styles.copy}><AppText variant="h3" color={P.ink}>{post.title}</AppText>{description ? <AppText color={P.muted}>{description}</AppText> : null}</View>
        </ScrollView>
      </Animated.View>
      <Modal visible={gallery} animationType="fade" onRequestClose={() => setGallery(false)}>
        <View testID="publication-lightbox" style={[styles.gallery, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Animated.View testID="publication-lightbox-gesture" {...galleryGesture} onAccessibilityEscape={() => setGallery(false)} accessibilityActions={[{ name: 'escape', label: 'Fermer le média' }]} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'escape') setGallery(false); }}>
            <PublicationMedia key={`${post.id}-${index}`} post={post} active={gallery} immersive initialIndex={index} />
          </Animated.View>
        </View>
      </Modal>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ gallery: { flex: 1, backgroundColor: VIDEO_BACKDROP }, screen: { flex: 1, backgroundColor: P.paper }, content: { padding: 12, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' }, copy: { paddingHorizontal: 8, paddingBottom: 24, gap: 8 } });
