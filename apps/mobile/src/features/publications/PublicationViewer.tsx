import { router } from 'expo-router';
import { PublicationProductLink } from './PublicationProductLink';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedPost } from '@/api/publicationFeed';
import { AppText } from '@/design/ui';
import { VIDEO_BACKDROP, PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { PublicationMedia } from './PublicationMedia';
import {
  finishesPublicationDismiss,
  startsPublicationDismiss,
} from './publicationGestures';

function useDismissGesture(onClose: () => void, atTop: () => boolean) {
  const offset = useRef(new Animated.Value(0)).current;
  const close = useRef(onClose);
  close.current = onClose;
  const top = useRef(atTop);
  top.current = atTop;
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        startsPublicationDismiss(g.dx, g.dy, top.current()),
      onMoveShouldSetPanResponder: (_, g) =>
        startsPublicationDismiss(g.dx, g.dy, top.current()),
      onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (finishesPublicationDismiss(g.dy, g.vy)) {
          offset.setValue(0);
          close.current();
        } else
          Animated.spring(offset, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;
  return {
    ...responder.panHandlers,
    style: { flex: 1, transform: [{ translateY: offset }] },
  };
}
/** Separate reading and media-only modes. Hardware back / accessibility escape remain available. */
export function PublicationViewer({
  post,
  onClose,
  initialMediaIndex,
}: {
  initialMediaIndex?: number | null;
  post: FeedPost;
  owner: string;
  onClose: () => void;
  onPreference: (action: string, id: string) => void;
}) {
  const [gallery, setGallery] = useState(initialMediaIndex != null);
  const [index, setIndex] = useState(initialMediaIndex ?? 0);
  const scrollY = useRef(0);
  const insets = useSafeAreaInsets();
  const detailGesture = useDismissGesture(onClose, () => scrollY.current <= 0);
  const closeGallery = () =>
    initialMediaIndex != null ? onClose() : setGallery(false);
  const galleryGesture = useDismissGesture(closeGallery, () => true);
  const lightbox = (
    <>
      {' '}
      {gallery ? <StatusBar style="light" /> : null}
      <View
        testID="publication-lightbox"
        style={[
          styles.gallery,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Animated.View
          testID="publication-lightbox-gesture"
          {...galleryGesture}
          onAccessibilityEscape={closeGallery}
          accessibilityActions={[{ name: 'escape', label: 'Fermer le média' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') closeGallery();
          }}
        >
          <PublicationMedia
            key={`${post.id}-${index}`}
            post={post}
            active={gallery}
            immersive
            initialIndex={index}
          />
        </Animated.View>
      </View>
    </>
  );
  // A direct media tap presents ONE native modal, not two simultaneous iOS presentations.
  if (initialMediaIndex != null)
    return (
      <Modal
        visible
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        {lightbox}
      </Modal>
    );
  const description = post.content?.description || post.subtitle;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        testID="publication-reader"
        style={[
          styles.screen,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Animated.View
          testID="publication-reader-gesture"
          {...detailGesture}
          onAccessibilityEscape={onClose}
          accessibilityActions={[
            { name: 'escape', label: 'Fermer la publication' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') onClose();
          }}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            <PublicationMedia
              post={post}
              active={!gallery}
              onOpen={(i) => {
                setIndex(i);
                setGallery(true);
              }}
            />
            <View style={styles.copy}>
              <AppText variant="h3" color={P.ink}>
                {post.title}
              </AppText>
              {description ? (
                <AppText color={P.muted}>{description}</AppText>
              ) : null}
            </View>
            {post.products.length ? (
              <View testID="publication-reader-products" style={styles.copy}>
                {post.products.map((product) => (
                  <PublicationProductLink
                    key={product.id}
                    product={product}
                    outlined
                    onOpen={() => {
                      onClose();
                      router.push({
                        pathname: '/product/[id]',
                        params: { id: product.id },
                      });
                    }}
                  />
                ))}
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
        <Modal
          visible={gallery}
          animationType="fade"
          onRequestClose={closeGallery}
          statusBarTranslucent
        >
          {lightbox}
        </Modal>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  gallery: { flex: 1, backgroundColor: VIDEO_BACKDROP },
  screen: { flex: 1, backgroundColor: P.paper },
  content: {
    padding: 12,
    gap: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  copy: { paddingHorizontal: 8, paddingBottom: 24, gap: 8 },
});
