import { useCallback, useEffect, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { mediaUrl } from '@/api/client';
import { useI18n } from '@/i18n';
import { ICON_SIZE, PUBLICATION_THEME as P, RADIUS, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import type { FeedPost } from '@/api/publicationFeed';
import type { PublicationMedia as Media } from '../../../../../shared/publicationContent';

function InlineVideo({ item, active }: { item: Media; active: boolean }) {
  const { locale } = useI18n(); const ar = locale === 'ar';
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [muted, setMuted] = useState(true); const [paused, setPaused] = useState(false); const [failed, setFailed] = useState(false);
  const player = useVideoPlayer(active ? { uri: mediaUrl(item.url) } : null, instance => { instance.loop = true; instance.muted = true; });
  useEffect(() => { const subscription = AppState.addEventListener('change', state => setForeground(state === 'active')); return () => subscription.remove(); }, []);
  useEffect(() => { if (active && focused && foreground && !paused) player.play(); else player.pause(); }, [active, focused, foreground, paused, player]);
  useEffect(() => { player.muted = muted; }, [muted, player]);
  useEffect(() => { const listener = player.addListener('statusChange', event => setFailed(event.status === 'error')); return () => listener.remove(); }, [player]);
  return <View style={styles.fill}>
    {item.poster ? <AppImage uri={mediaUrl(item.poster)} style={styles.fill} contentFit="contain" decorative /> : null}
    {active ? <VideoView player={player} style={styles.fill} nativeControls={false} contentFit="contain" /> : null}
    <View style={styles.videoActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={paused ? (ar ? 'تشغيل الفيديو' : 'Lire la vidéo') : (ar ? 'إيقاف مؤقت' : 'Mettre en pause')} onPress={() => setPaused(!paused)} style={styles.control}><Ionicons name={paused ? 'play-outline' : 'pause-outline'} size={ICON_SIZE.md} color={P.paper} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={muted ? (ar ? 'تشغيل الصوت' : 'Activer le son') : (ar ? 'كتم الصوت' : 'Couper le son')} accessibilityState={{ selected: !muted }} onPress={() => setMuted(!muted)} style={styles.control}><Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={ICON_SIZE.md} color={P.paper} /></Pressable>
    </View>
    {failed ? <AppText color={P.paper} style={styles.failure}>{ar ? 'تعذّر تحميل الفيديو. أعد فتح المنشور للمحاولة.' : 'Vidéo indisponible. Rouvrez la publication pour réessayer.'}</AppText> : null}
  </View>;
}
export function PublicationMedia({ post, active = false, immersive = false, onOpen }: { post: FeedPost; active?: boolean; immersive?: boolean; onOpen?: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 }); const { width, height } = size; const [index, setIndex] = useState(0);
  const items: Media[] = post.content?.media.length ? post.content.media : post.imageUrl ? [{ type: 'image', url: post.imageUrl, poster: '', alt: post.title }] : [];
  if (!items.length) return null;
  if (post.content?.type === 'collection' && items.length > 1 && !immersive) return <View testID={`publication-media-${post.id}`} style={styles.collection}>
    {items.slice(0, 4).map((item, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={item.alt || post.title} onPress={onOpen} style={styles.tile}><AppImage uri={mediaUrl(item.url)} style={styles.fill} contentFit="cover" accessibilityLabel={item.alt || post.title} /></Pressable>)}
    <AppText variant="captionStrong" color={P.ink}>{items.length} images</AppText>
  </View>;
  return <View testID={`publication-media-${post.id}`} onLayout={event => { const { width: w, height: h } = event.nativeEvent.layout; setSize(old => old.width === w && old.height === h ? old : { width: w, height: h }); }} style={[styles.frame, immersive ? styles.immersive : undefined]}>
    {width > 0 ? <FlatList horizontal pagingEnabled scrollEventThrottle={16}
      onScroll={event => setIndex(Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))} data={items} keyExtractor={(_, i) => String(i)} showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={event => setIndex(Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))}
      renderItem={({ item, index: mediaIndex }) => <View style={{ width, height }}>
        {item.type === 'video' ? <InlineVideo item={item} active={active && index === mediaIndex} /> : <Pressable accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={item.alt || post.title} onPress={onOpen} style={styles.fill}><AppImage uri={mediaUrl(item.url)} style={styles.fill} contentFit={immersive ? 'contain' : 'cover'} accessibilityLabel={item.alt || post.title} /></Pressable>}
      </View>} /> : null}
    {items.length > 1 ? <View style={styles.counter}><AppText variant="captionStrong" color={P.paper}>{index + 1}/{items.length}</AppText></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  collection: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, tile: { width: '49%', aspectRatio: 1 },
  frame: { width: '100%', aspectRatio: 4 / 5, backgroundColor: VIDEO_BACKDROP, overflow: 'hidden' }, immersive: { flex: 1, aspectRatio: undefined }, fill: { ...StyleSheet.absoluteFill },
  videoActions: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', gap: 8 }, control: { minWidth: 48, minHeight: 48, borderRadius: RADIUS.full, backgroundColor: VIDEO_BACKDROP, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', top: 12, right: 12, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: VIDEO_BACKDROP }, failure: { padding: 16 },
});
