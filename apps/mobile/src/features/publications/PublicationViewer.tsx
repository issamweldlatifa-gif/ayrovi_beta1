import { usePublicationTransition } from './usePublicationTransition';
import { FadeIn, useReduceMotion } from '@/design/motion';
import { PUBLICATION_MOTION as M } from './publicationTokens';
import { PUBLICATION_PALETTE as P } from './publicationDesign';
import { PublicationPostOptions } from './PublicationPostOptions';
import { PublicationAuthHost } from './PublicationAuthSheet';
import { useI18n } from '@/i18n';
import { PublicationIcon as Ionicons } from './publicationDesign';
import { NavigationIcon } from '@/design/NavigationIcon';
import { Comments } from '@/features/social/Comments';
import { PublicationActions } from './PublicationActions';
import { router } from 'expo-router';
import { PublicationProductLink } from './PublicationProductLink';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DoubleTapHearts, type DoubleTapHeartsHandle } from '@/design/reactions/DoubleTapHearts';
import { useSession } from '@/state/session';
import {
  Animated,
  Modal,
  Pressable,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { anchoredSheetHeight, useKeyboardOverlap } from '@/design/keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedPost } from '@/api/publicationFeed';
import { PublicationText as AppText } from './publicationDesign';
import { RADIUS, ICON_SIZE } from '@/design/tokens.mobile';
import { PublicationPublisher } from './PublicationPublisher';
import { showsPublicationTitle } from '../../../../../shared/publicationPresentation';
import { resolvePublicationTemplate } from '../../../../../shared/publicationLayouts';
import { PublicationMedia } from './PublicationMedia';
import {
  finishesPublicationDismiss,
  startsPublicationDismiss,
} from './publicationGestures';

function useDismissGesture(
  onClose: () => void,
  atTop: () => boolean,
  active = true
) {
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) offset.setValue(0);
  }, [active, offset]);
  const { height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const settings = useRef({ height, reduce });
  settings.current = { height, reduce };
  useEffect(
    () => () => {
      offset.stopAnimation();
    },
    [offset]
  );
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
          if (settings.current.reduce) close.current();
          else
            Animated.timing(offset, {
              toValue: settings.current.height,
              duration: M.dismiss,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) close.current();
            });
        } else if (settings.current.reduce) offset.setValue(0);
        else
          Animated.spring(offset, {
            toValue: 0,
            stiffness: M.stiffness,
            damping: M.damping,
            mass: 1,
            useNativeDriver: true,
          }).start();
      },
      onPanResponderTerminate: () => {
        if (settings.current.reduce) offset.setValue(0);
        else
          Animated.spring(offset, {
            toValue: 0,
            stiffness: M.stiffness,
            damping: M.damping,
            mass: 1,
            useNativeDriver: true,
          }).start();
      },
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
  const transition = usePublicationTransition(onClose);
  const [gallery, setGallery] = useState(initialMediaIndex != null);
  const [index, setIndex] = useState(initialMediaIndex ?? 0);
  const [controls, setControls] = useState(true);
  const [postOptions, setPostOptions] = useState(false);
  const [composeRequest, setComposeRequest] = useState(0);
  const [comments, setComments] = useState(false);
  const scrollY = useRef(0);
  const insets = useSafeAreaInsets();
  /**
   * Z-Reactions (12/11/2026) — double-tap sur le média plein écran = J'adore,
   * cœurs ROUGES sous le doigt (comme la carte du fil). Le toucher simple garde
   * son rôle (afficher/masquer les contrôles), retardé de la fenêtre du
   * double-tap. Les actions restent MONTÉES quand les contrôles sont masqués
   * (invisibles, sans toucher) : c'est le bouton officiel qui porte l'état et
   * reçoit la demande `loveRequest`.
   */
  const signedIn = useSession().status === 'signedIn';
  const hearts = useRef<DoubleTapHeartsHandle>(null);
  const [loveRequest, setLoveRequest] = useState(0);
  const loveFromMedia = useCallback((x: number, y: number) => {
    setLoveRequest((n) => n + 1);
    if (signedIn) hearts.current?.burst(x, y);
  }, [signedIn]);
  /**
   * Clavier (11/11/2026) — « وين تكتب متبانش » : la couche galerie est en
   * `absoluteFill`, donc le `paddingBottom` d'un conteneur évitant le clavier
   * ne la touchait pas : le clavier couvrait le champ.
   *  • Lecture (page entière) : marge basse = part recouverte ; le haut de la
   *    page ne bouge pas, seul le champ se pose sur le clavier (Facebook).
   *  • Galerie : média et actions IMMOBILES ; le panneau des commentaires
   *    garde son bord HAUT, seul son bord bas (le champ) monte sur le clavier
   *    — « sans monter ni descendre avec la frappe ».
   */
  const keyboard = useKeyboardOverlap();
  const typing = keyboard.overlap > 0;
  const [commentsSlot, setCommentsSlot] = useState({ y: 0, height: 0 });
  // Part du clavier sous le panneau (la couche réserve déjà la zone sûre basse).
  const panelLift = typing ? Math.max(0, keyboard.overlap - insets.bottom) : 0;
  const panelHeight = anchoredSheetHeight(
    commentsSlot.height,
    panelLift,
    COMMENTS_TYPING_MIN,
    commentsSlot.y + commentsSlot.height - panelLift
  );
  // Haut du panneau, relatif à sa place : 0 au repos ET pendant la frappe,
  // négatif seulement si le clavier laisse moins de COMMENTS_TYPING_MIN.
  const panelTop = commentsSlot.height - panelLift - panelHeight;
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const exitGallery = () => {
    setComments(false);
    if (initialMediaIndex != null) transition.close();
    else setGallery(false);
  };
  const closeGallery = () => {
    if (comments) setComments(false);
    else exitGallery();
  };
  const detailGesture = useDismissGesture(
    onClose,
    () => scrollY.current <= 0,
    !gallery
  );
  const galleryGesture = useDismissGesture(
    () => {
      if (initialMediaIndex != null) onClose();
      else closeGallery();
    },
    () => !comments,
    gallery
  );
  const openProduct = (id: string) => {
    onClose();
    router.push({ pathname: '/product/[id]', params: { id } });
  };
  return (
    <Modal
      visible
      animationType="none"
      onRequestClose={
        postOptions
          ? () => setPostOptions(false)
          : gallery
          ? closeGallery
          : transition.close
      }
      statusBarTranslucent
    >
      <StatusBar style={gallery ? 'light' : 'dark'} />
      <View
        style={{ flex: 1, backgroundColor: gallery ? P.backdrop : P.paper }}
      >
        <Animated.View style={transition.style}>
          <PublicationAuthHost onNavigate={onClose}>
            <View
              ref={keyboard.ref}
              onLayout={keyboard.measure}
              testID="publication-viewer"
              style={{
                flex: 1,
                backgroundColor: gallery ? P.backdrop : P.paper,
                paddingTop: insets.top,
                // En galerie, la couche du dessus gère seule le clavier : la
                // page de lecture dessous ne doit pas se recomposer.
                paddingBottom: typing && !gallery ? keyboard.overlap : insets.bottom,
              }}
            >
              {initialMediaIndex == null ? (
                <Animated.View
                  testID="publication-reader-gesture"
                  {...detailGesture}
                  onAccessibilityEscape={transition.close}
                  accessibilityElementsHidden={gallery}
                  importantForAccessibility={
                    gallery ? 'no-hide-descendants' : 'auto'
                  }
                  pointerEvents={gallery ? 'none' : 'auto'}
                >
                  <View testID="publication-reader" style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        minHeight: 52,
                      }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={ar ? 'رجوع' : 'Retour'}
                        onPress={transition.close}
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
                      <AppText variant="h3" style={{ flex: 1 }}>
                        {ar ? 'منشور' : 'Publication'}
                      </AppText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          ar ? 'خيارات المنشور' : 'Options de la publication'
                        }
                        onPress={() => setPostOptions(true)}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons
                          name="ellipsis-horizontal-outline"
                          size={ICON_SIZE.md}
                          color={P.ink}
                        />
                      </Pressable>
                    </View>
                    <Comments
                      targetId={post.id}
                      publication
                      active={!gallery}
                      focusRequest={composeRequest}
                      onScroll={(y) => {
                        scrollY.current = y;
                      }}
                      header={
                        <View
                          testID="publication-detail-post"
                          style={styles.detailPost}
                        >
                          <PublicationPublisher post={post} detail />
                          <View style={{ gap: 4 }}>
                            {post.title &&
                            post.content?.showTitle !== false &&
                            showsPublicationTitle(
                              resolvePublicationTemplate(
                                post.content?.template,
                                post.content?.type,
                                post.content?.media.length,
                                post.category
                              )
                            ) ? (
                              <AppText variant="h3">{post.title}</AppText>
                            ) : null}
                            {post.content?.description || post.subtitle ? (
                              <AppText>
                                {post.content?.description || post.subtitle}
                              </AppText>
                            ) : null}
                          </View>
                          <PublicationMedia
                            post={post}
                            active={!gallery}
                            onOpen={(i) => {
                              setIndex(i);
                              setGallery(true);
                              setControls(true);
                            }}
                          />
                          <PublicationActions
                            post={post}
                            onComments={() => setComposeRequest((n) => n + 1)}
                            onPreference={onPreference}
                          />
                          {post.products.length ? (
                            <View
                              testID="publication-reader-products"
                              style={{ gap: 8 }}
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
                          <View
                            style={{
                              borderTopWidth: 1,
                              borderTopColor: P.line,
                              paddingTop: 12,
                            }}
                          >
                            <AppText variant="bodyStrong">
                              {ar ? 'التعليقات' : 'Commentaires'}
                            </AppText>
                          </View>
                        </View>
                      }
                    />
                  </View>
                </Animated.View>
              ) : null}
              {gallery ? (
                <FadeIn
                  duration={initialMediaIndex == null ? M.exit : 0}
                  testID="publication-gallery-layer"
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: P.backdrop,
                      paddingTop: insets.top,
                      paddingBottom: insets.bottom,
                    },
                  ]}
                >
                  <>
                    <View
                      testID="publication-viewer-toolbar"
                      style={styles.toolbar}
                    >
                      {controls || comments ? (
                        <>
                          <Pressable
                            testID="publication-viewer-close"
                            accessibilityRole="button"
                            accessibilityLabel={
                              ar ? 'إغلاق الصورة' : 'Fermer l’image'
                            }
                            onPress={exitGallery}
                            style={styles.viewerButton}
                          >
                            <Ionicons
                              name="close"
                              size={ICON_SIZE.md}
                              color={P.paper}
                            />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              ar
                                ? 'خيارات المنشور'
                                : 'Options de la publication'
                            }
                            onPress={() => setPostOptions(true)}
                            style={styles.viewerButton}
                          >
                            <Ionicons
                              name="ellipsis-horizontal-outline"
                              size={ICON_SIZE.md}
                              color={P.paper}
                            />
                          </Pressable>
                        </>
                      ) : null}
                    </View>
                    <View
                      testID="publication-viewer-media-slot"
                      style={{ flex: comments ? 0.45 : 1, minHeight: 0 }}
                    >
                      <Animated.View
                        testID="publication-lightbox-gesture"
                        {...galleryGesture}
                        onAccessibilityEscape={closeGallery}
                      >
                        <View
                          testID="publication-lightbox"
                          style={{ flex: 1, backgroundColor: P.backdrop }}
                        >
                          <PublicationMedia
                            key={post.id}
                            post={post}
                            active={gallery && !comments}
                            immersive
                            initialIndex={index}
                            showIndicators={controls && !comments}
                            indicatorBottom={12}
                            onOpen={() => {
                              setControls((shown) => !shown);
                              setPostOptions(false);
                            }}
                            onDoubleTap={loveFromMedia}
                          />
                          <DoubleTapHearts ref={hearts} testID="publication-viewer-hearts" />
                        </View>
                      </Animated.View>
                    </View>
                    <View
                      testID="publication-viewer-actions"
                      style={styles.viewerActions}
                    >
                      <View
                        testID="publication-viewer-actions-layer"
                        pointerEvents={controls || comments ? 'auto' : 'none'}
                        accessibilityElementsHidden={!(controls || comments)}
                        importantForAccessibility={
                          controls || comments ? 'auto' : 'no-hide-descendants'
                        }
                        style={{ opacity: controls || comments ? 1 : 0 }}
                      >
                        <PublicationActions
                          presentation="viewer"
                          backdrop="dark"
                          post={post}
                          loveRequest={loveRequest}
                          onComments={() => setComments(!comments)}
                          onPreference={onPreference}
                        />
                      </View>
                    </View>
                    {comments ? (
                      <View
                        testID="publication-viewer-comments-slot"
                        style={{ flex: 0.55 }}
                        onLayout={(event) => {
                          const { y, height } = event.nativeEvent.layout;
                          setCommentsSlot((prev) =>
                            prev.y === y && prev.height === height
                              ? prev
                              : { y, height }
                          );
                        }}
                      >
                      <View
                        testID="publication-viewer-comments"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: panelTop,
                          bottom: panelLift,
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
                        <Comments targetId={post.id} publication />
                      </View>
                      </View>
                    ) : null}
                  </>
                </FadeIn>
              ) : null}
              {postOptions ? (
                <PublicationPostOptions
                  post={post}
                  onClose={() => setPostOptions(false)}
                  onPreference={onPreference}
                />
              ) : null}
            </View>
          </PublicationAuthHost>
        </Animated.View>
      </View>
    </Modal>
  );
}
/** Hauteur visible minimale du panneau pendant la frappe (titre + champ + lignes). */
const COMMENTS_TYPING_MIN = 220;
const styles = StyleSheet.create({
  toolbar: {
    height: 60,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: P.backdrop,
  },
  viewerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    backgroundColor: P.viewerDarkSurface,
  },
  viewerActions: {
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: P.backdrop,
  },
  detailPost: { paddingHorizontal: 12, paddingBottom: 12, gap: 12 },
  content: {
    padding: 12,
    gap: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  copy: { paddingHorizontal: 8, paddingBottom: 24, gap: 8 },
});
