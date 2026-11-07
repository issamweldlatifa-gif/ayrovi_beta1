import { PublicationAuthHost } from './PublicationAuthSheet';
import { useI18n } from '@/i18n';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationIcon } from '@/design/NavigationIcon';
import { Comments } from '@/features/social/Comments';
import { PublicationActions } from './PublicationActions';
import { router } from 'expo-router';
import { PublicationProductLink } from './PublicationProductLink';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedPost } from '@/api/publicationFeed';
import { AppText } from '@/design/ui';
import {
  VIDEO_BACKDROP,
  PUBLICATION_THEME as P,
  RADIUS,
  ICON_SIZE,
  veil,
} from '@/design/tokens.mobile';
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
/** A single modal owns reader, fullscreen media and its conversation (safe for iOS). */
export function PublicationViewer({
  post,
  onClose,
  initialMediaIndex,
  onPreference,
}: {
  initialMediaIndex?: number | null;
  post: FeedPost;
  owner: string;
  onClose: () => void;
  onPreference: (action: string, id: string) => void;
}) {
  const [gallery, setGallery] = useState(initialMediaIndex != null);
  const [index, setIndex] = useState(initialMediaIndex ?? 0);
  const [controls, setControls] = useState(true);
  const [comments, setComments] = useState(false);
  const scrollY = useRef(0);
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const closeGallery = () => {
    if (comments) {
      setComments(false);
      return;
    }
    if (initialMediaIndex != null) onClose();
    else setGallery(false);
  };
  const detailGesture = useDismissGesture(onClose, () => scrollY.current <= 0);
  const galleryGesture = useDismissGesture(closeGallery, () => !comments);
  const openProduct = (id: string) => {
    onClose();
    router.push({ pathname: '/product/[id]', params: { id } });
  };
  return (
    <Modal
      visible
      animationType={gallery ? 'fade' : 'slide'}
      onRequestClose={gallery ? closeGallery : onClose}
      statusBarTranslucent={gallery}
    >
      <StatusBar style={gallery ? 'light' : 'dark'} />
      <PublicationAuthHost onNavigate={onClose}>
        <KeyboardAvoidingView
          testID="publication-viewer"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{
            flex: 1,
            backgroundColor: gallery ? VIDEO_BACKDROP : P.paper,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          {gallery ? (
            <>
              <View style={{ flex: comments ? 0.45 : 1, minHeight: 140 }}>
                <Animated.View
                  testID="publication-lightbox-gesture"
                  {...galleryGesture}
                  onAccessibilityEscape={closeGallery}
                >
                  <View
                    testID="publication-lightbox"
                    style={{ flex: 1, backgroundColor: VIDEO_BACKDROP }}
                  >
                    <PublicationMedia
                      key={post.id}
                      post={post}
                      active={gallery && !comments}
                      immersive
                      initialIndex={index}
                      showIndicators={controls && !comments}
                      onOpen={() => setControls(!controls)}
                    />
                  </View>
                </Animated.View>
                {controls || comments ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={ar ? 'رجوع' : 'Retour'}
                    onPress={closeGallery}
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: ar ? undefined : 8,
                      right: ar ? 8 : undefined,
                      minWidth: 44,
                      minHeight: 44,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: veil(0.35),
                      borderRadius: RADIUS.xs,
                    }}
                  >
                    <NavigationIcon
                      name={ar ? 'arrow-forward' : 'arrow-back'}
                      color={P.paper}
                    />
                  </Pressable>
                ) : null}
              </View>
              {controls || comments ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <PublicationActions
                    post={post}
                    onComments={() => setComments(!comments)}
                    onPreference={onPreference}
                  />
                </View>
              ) : null}
              {comments ? (
                <View
                  style={{
                    flex: 0.55,
                    backgroundColor: P.paper,
                    borderTopLeftRadius: RADIUS.xl,
                    borderTopRightRadius: RADIUS.xl,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 4,
                      backgroundColor: P.line,
                      borderRadius: RADIUS.xs,
                      alignSelf: 'center',
                    }}
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="h3">
                      {ar ? 'التعليقات' : 'Commentaires'}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        ar ? 'إغلاق التعليقات' : 'Fermer les commentaires'
                      }
                      onPress={() => setComments(false)}
                      style={{
                        minWidth: 44,
                        minHeight: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="close" size={ICON_SIZE.md} />
                    </Pressable>
                  </View>
                  <Comments targetId={post.id} />
                </View>
              ) : null}
            </>
          ) : (
            <Animated.View
              testID="publication-reader-gesture"
              {...detailGesture}
              onAccessibilityEscape={onClose}
            >
              <View testID="publication-reader" style={{ flex: 1 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ar ? 'رجوع' : 'Retour'}
                  onPress={onClose}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    marginHorizontal: 8,
                    alignSelf: ar ? 'flex-end' : 'flex-start',
                    justifyContent: 'center',
                  }}
                >
                  <NavigationIcon
                    name={ar ? 'arrow-forward' : 'arrow-back'}
                    color={P.ink}
                  />
                </Pressable>
                <ScrollView
                  contentContainerStyle={styles.content}
                  onScroll={(e) => {
                    scrollY.current = e.nativeEvent.contentOffset.y;
                  }}
                  scrollEventThrottle={16}
                >
                  <PublicationMedia
                    post={post}
                    active={!gallery}
                    onOpen={(i) => {
                      setIndex(i);
                      setGallery(true);
                      setControls(true);
                    }}
                  />
                  <View style={styles.copy}>
                    {post.title && post.content?.showTitle !== false ? (
                      <AppText variant="h3">{post.title}</AppText>
                    ) : null}
                    {post.content?.description || post.subtitle ? (
                      <AppText color={P.muted}>
                        {post.content?.description || post.subtitle}
                      </AppText>
                    ) : null}
                  </View>
                  {post.products.length ? (
                    <View
                      testID="publication-reader-products"
                      style={styles.copy}
                    >
                      {post.products.map((product) => (
                        <PublicationProductLink
                          key={product.id}
                          product={product}
                          outlined
                          onOpen={() => openProduct(product.id)}
                        />
                      ))}
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </PublicationAuthHost>
    </Modal>
  );
}
const styles = StyleSheet.create({
  content: {
    padding: 12,
    gap: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  copy: { paddingHorizontal: 8, paddingBottom: 24, gap: 8 },
});
