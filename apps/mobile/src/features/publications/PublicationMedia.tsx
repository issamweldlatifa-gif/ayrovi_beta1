import {
  mediaFit,
  mediaRatio,
  nativeMediaPosition,
  tileRatio,
} from '../../../../../shared/publicationPresentation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { mediaUrl } from '@/api/client';
import { useI18n } from '@/i18n';
import {
  ICON_SIZE,
  PUBLICATION_THEME as P,
  RADIUS,
  VIDEO_BACKDROP,
  veil,
} from '@/design/tokens.mobile';
import {
  resolvePublicationTemplate,
  PUBLICATION_EDITORIAL_RATIO,
  publicationTiles,
  SOCIAL_TEMPLATES,
} from '../../../../../shared/publicationLayouts';
import type { FeedPost } from '@/api/publicationFeed';
import type { PublicationMedia as Media } from '../../../../../shared/publicationContent';

function InlineVideo({ item, active }: { item: Media; active: boolean }) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active'
  );
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(active);
  useEffect(() => {
    if (active) setLoaded(true);
  }, [active]);
  const player = useVideoPlayer(
    loaded ? { uri: mediaUrl(item.url) } : null,
    (instance) => {
      instance.loop = true;
      instance.muted = true;
    }
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active')
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (active && focused && foreground && !paused) player.play();
    else player.pause();
  }, [active, focused, foreground, paused, player]);
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    const listener = player.addListener('statusChange', (event) =>
      setFailed(event.status === 'error')
    );
    return () => listener.remove();
  }, [player]);
  return (
    <View style={styles.fill}>
      {item.poster ? (
        <AppImage
          uri={mediaUrl(item.poster)}
          style={styles.fill}
          contentFit="contain"
          decorative
        />
      ) : null}
      {loaded ? (
        <VideoView
          player={player}
          style={styles.fill}
          nativeControls={false}
          contentFit="contain"
        />
      ) : null}
      <View style={styles.videoActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            paused
              ? ar
                ? 'تشغيل الفيديو'
                : 'Lire la vidéo'
              : ar
              ? 'إيقاف مؤقت'
              : 'Mettre en pause'
          }
          onPress={() => setPaused(!paused)}
          style={styles.control}
        >
          <Ionicons
            name={paused ? 'play-outline' : 'pause-outline'}
            size={ICON_SIZE.md}
            color={P.paper}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            muted
              ? ar
                ? 'تشغيل الصوت'
                : 'Activer le son'
              : ar
              ? 'كتم الصوت'
              : 'Couper le son'
          }
          accessibilityState={{ selected: !muted }}
          onPress={() => setMuted(!muted)}
          style={styles.control}
        >
          <Ionicons
            name={muted ? 'volume-mute-outline' : 'volume-high-outline'}
            size={ICON_SIZE.md}
            color={P.paper}
          />
        </Pressable>
      </View>
      {failed ? (
        <AppText color={P.paper} style={styles.failure}>
          {ar
            ? 'تعذّر تحميل الفيديو. أعد فتح المنشور للمحاولة.'
            : 'Vidéo indisponible. Rouvrez la publication pour réessayer.'}
        </AppText>
      ) : null}
    </View>
  );
}
export function PublicationMedia({
  post,
  active = false,
  immersive = false,
  onOpen,
  thumbnails = false,
  initialIndex = 0,
  showIndicators = true,
}: {
  post: FeedPost;
  active?: boolean;
  immersive?: boolean;
  onOpen?: (index: number) => void;
  thumbnails?: boolean;
  initialIndex?: number;
  showIndicators?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const [index, setIndex] = useState(initialIndex);
  const [photoAspect, setPhotoAspect] = useState(4 / 5);
  const list = useRef<FlatList<Media>>(null);
  const items: Media[] = post.content?.media.length
    ? post.content.media
    : post.imageUrl
    ? [{ type: 'image', url: post.imageUrl, poster: '', alt: post.title }]
    : [];
  if (!items.length) return null;
  const template = resolvePublicationTemplate(
    post.content?.template,
    post.content?.type,
    post.content?.media.length,
    post.category
  );
  const natural =
    !immersive &&
    (['caption_photo', 'shoppable'].includes(template) ||
      ((post.content?.template || 'auto') === 'auto' &&
        template === 'campaign'));
  if (!immersive && (SOCIAL_TEMPLATES as readonly string[]).includes(template))
    return (
      <View testID={`publication-media-${post.id}`} style={{ gap: 2 }}>
        {publicationTiles(template, items.length).map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 2 }}>
            {row.map((tile) => {
              const item = items[tile.index];
              return (
                <Pressable
                  key={tile.index}
                  testID={`publication-tile-${post.id}-${tile.index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.alt || post.title} · ${
                    tile.index + 1
                  }/${items.length}${
                    tile.remaining ? ` · +${tile.remaining}` : ''
                  }`}
                  onPress={() => onOpen?.(tile.index)}
                  style={{
                    flex: 1,
                    aspectRatio: tileRatio(row.map((t) => items[t.index])),
                    overflow: 'hidden',
                  }}
                >
                  <AppImage
                    uri={mediaUrl(
                      item.type === 'video' ? item.poster : item.url
                    )}
                    background={P.paper}
                    style={[
                      styles.fill,
                      { transform: [{ scale: item.scale || 1 }] },
                    ]}
                    contentFit={mediaFit(item)}
                    contentPosition={nativeMediaPosition(item)}
                    accessibilityLabel={item.alt || post.title}
                  />
                  {item.type === 'video' ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        backgroundColor: VIDEO_BACKDROP,
                        borderRadius: RADIUS.full,
                        padding: 6,
                      }}
                    >
                      <Ionicons
                        name="play"
                        size={ICON_SIZE.md}
                        color={P.paper}
                      />
                    </View>
                  ) : null}
                  {tile.remaining > 0 ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.fill,
                        {
                          backgroundColor: veil(0.4),
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                      ]}
                    >
                      <AppText variant="h2" color={P.paper}>
                        +{tile.remaining}
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    );
  if (post.content?.type === 'collection' && items.length > 1 && !immersive)
    return (
      <View testID={`publication-media-${post.id}`} style={styles.collection}>
        {items.slice(0, 4).map((item, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={item.alt || post.title}
            onPress={() => onOpen?.(i)}
            style={styles.tile}
          >
            <AppImage
              uri={mediaUrl(item.url)}
              style={styles.fill}
              contentFit="cover"
              accessibilityLabel={item.alt || post.title}
            />
          </Pressable>
        ))}
        <AppText variant="captionStrong" color={P.ink}>
          {items.length} images
        </AppText>
      </View>
    );
  return (
    <View style={immersive ? { flex: 1 } : undefined}>
      <View
        testID={`publication-media-${post.id}`}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          setSize((old) =>
            old.width === w && old.height === h ? old : { width: w, height: h }
          );
        }}
        style={[
          styles.frame,
          !immersive
            ? {
                aspectRatio: mediaRatio(
                  items[0],
                  ['campaign', 'carousel'].includes(template)
                    ? PUBLICATION_EDITORIAL_RATIO
                    : photoAspect
                ),
                backgroundColor: P.paper,
                borderRadius: template === 'campaign' ? 0 : RADIUS.md,
              }
            : undefined,
          natural
            ? {
                aspectRatio: mediaRatio(items[0], photoAspect),
                backgroundColor: P.paper,
              }
            : undefined,
          immersive ? styles.immersive : undefined,
        ]}
      >
        {width > 0 ? (
          <FlatList
            ref={list}
            horizontal
            pagingEnabled
            initialScrollIndex={Math.max(
              0,
              Math.min(initialIndex, items.length - 1)
            )}
            getItemLayout={(_, i) => ({
              length: width,
              offset: width * i,
              index: i,
            })}
            extraData={index}
            scrollEventThrottle={16}
            onScroll={(event) =>
              setIndex(
                Math.max(
                  0,
                  Math.min(
                    items.length - 1,
                    Math.round(event.nativeEvent.contentOffset.x / width)
                  )
                )
              )
            }
            data={items}
            keyExtractor={(_, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              setIndex(
                Math.max(
                  0,
                  Math.min(
                    items.length - 1,
                    Math.round(event.nativeEvent.contentOffset.x / width)
                  )
                )
              )
            }
            renderItem={({ item, index: mediaIndex }) => (
              <View style={{ width, height }}>
                {item.type === 'video' ? (
                  <InlineVideo
                    item={item}
                    active={active && index === mediaIndex}
                  />
                ) : (
                  <Pressable
                    accessibilityRole={onOpen ? 'button' : undefined}
                    accessibilityLabel={item.alt || post.title}
                    onPress={() => onOpen?.(mediaIndex)}
                    style={styles.fill}
                  >
                    <AppImage
                      background={immersive ? null : undefined}
                      testID={`publication-image-${post.id}-${mediaIndex}`}
                      uri={mediaUrl(item.url)}
                      style={[
                        styles.fill,
                        !immersive
                          ? { transform: [{ scale: item.scale || 1 }] }
                          : {},
                      ]}
                      contentPosition={
                        immersive ? 'center' : nativeMediaPosition(item)
                      }
                      onDimensions={
                        mediaIndex === 0
                          ? ({ width: w, height: h }) => {
                              if (w > 0 && h > 0) setPhotoAspect(w / h);
                            }
                          : undefined
                      }
                      contentFit={immersive ? 'contain' : mediaFit(item)}
                      accessibilityLabel={item.alt || post.title}
                    />
                  </Pressable>
                )}
              </View>
            )}
          />
        ) : null}
        {items.length > 1 && showIndicators ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View
              accessibilityLabel={`${index + 1}/${items.length}`}
              style={{
                flexDirection: 'row',
                paddingHorizontal: 8,
                alignItems: 'center',
              }}
            >
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    top: 12,
                    bottom: 12,
                    backgroundColor: P.dotSurface,
                    borderRadius: RADIUS.full,
                  },
                ]}
              />
              {items.map((_, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}/${items.length}`}
                  accessibilityState={{ selected: index === i }}
                  onPress={() => {
                    setIndex(i);
                    list.current?.scrollToOffset({
                      offset: width * i,
                      animated: true,
                    });
                  }}
                  style={{
                    minHeight: 44,
                    minWidth: Math.min(28, 240 / items.length),
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: i === index ? 18 : 5,
                      height: 5,
                      borderRadius: RADIUS.xs,
                      backgroundColor: i === index ? P.ink : P.dotInactive,
                    }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      {thumbnails && !immersive && items.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnails}
        >
          {items.map((item, i) => (
            <Pressable
              key={i}
              testID={`publication-thumbnail-${post.id}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`${item.alt || post.title} · ${i + 1}/${
                items.length
              }`}
              accessibilityState={{ selected: index === i }}
              onPress={() => {
                setIndex(i);
                list.current?.scrollToOffset({
                  offset: width * i,
                  animated: true,
                });
              }}
              style={[
                styles.thumbnail,
                { width: Math.max(48, (width - 16) / 3), aspectRatio: 4 / 3 },
                { borderColor: index === i ? P.accent : 'transparent' },
              ]}
            >
              <AppImage
                uri={mediaUrl(item.poster || item.url)}
                contentFit={item.fit || 'cover'}
                style={styles.thumbnailImage}
                decorative
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  collection: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tile: { width: '49%', aspectRatio: 1 },
  frame: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: VIDEO_BACKDROP,
    overflow: 'hidden',
    borderRadius: RADIUS.sm,
  },
  immersive: { flex: 1, aspectRatio: undefined, borderRadius: 0 },
  fill: { ...StyleSheet.absoluteFill },
  thumbnails: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  thumbnail: {
    width: 48,
    padding: 2,
    borderRadius: RADIUS.md,
    borderWidth: 2,
  },
  thumbnailImage: { width: '100%', height: '100%', borderRadius: RADIUS.sm },
  videoActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  control: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: RADIUS.full,
    backgroundColor: VIDEO_BACKDROP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    right: 12,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: VIDEO_BACKDROP,
  },
  failure: { padding: 16 },
});
