import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { storySlideProductIds, type StoryEditorial, type StoryMedia } from '../../../../../shared/storyEditorial';
import { storyPresentation, useEditorialStory, type EditorialStory } from '@/api/storyEditorial';
import { mediaUrl } from '@/api/client';
import { sendInteraction } from '@/api/social';
import { useSessionId } from '@/session/session';
import { AppImage } from '@/design/appImage';
import { useReduceMotion } from '@/design/motion';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { HERO_COPY, ICON_SIZE, RADIUS, veil } from '@/design/tokens.mobile';
import { BRAND, NEUTRALS } from '@/design/tokens.generated';
import { AppText } from '@/design/ui';
import { useI18n, useT } from '@/i18n';
import { StoryEditorialProduct, useStoryFavorites } from './StoryEditorialProduct';

const STORY = { inset: 24, fullInset: 12, maxWidth: 600, title: 26, titleLine: 30, captionLine: 24, aspect: 626 / 602 } as const;
function StoryVideo({ media, playing, muted, fit, onDuration }: { media: StoryMedia; playing: boolean; muted: boolean; fit: 'cover' | 'contain'; onDuration: (seconds: number) => void }) {
  const [ready, setReady] = useState(false);
  const player = useVideoPlayer({ uri: mediaUrl(media.url) }, instance => { instance.loop = true; instance.muted = muted; });
  useEffect(() => {
    const update = () => {
      setReady(player.status === 'readyToPlay');
      if (Number.isFinite(player.duration) && player.duration > 0) onDuration(player.duration);
    };
    update();
    const subscription = player.addListener('statusChange', update);
    return () => subscription.remove();
  }, [player, onDuration]);
  useEffect(() => { player.muted = muted; }, [player, muted]);
  useEffect(() => { if (playing) player.play(); else player.pause(); }, [player, playing]);
  return <>
    <VideoView testID="editorial-story-video" style={StyleSheet.absoluteFill} contentFit={fit} player={player} nativeControls={false} surfaceType="textureView" />
    {!ready && media.poster ? <AppImage uri={mediaUrl(media.poster)} decorative style={StyleSheet.absoluteFill} /> : null}
  </>;
}

function StoryGif({ url, playing, fit }: { url: string; playing: boolean; fit: 'cover' | 'contain' }) {
  const image = useRef<ExpoImage>(null);
  useEffect(() => {
    const operation = playing ? image.current?.startAnimating?.() : image.current?.stopAnimating?.();
    void operation?.catch(() => undefined);
  }, [playing]);
  return <ExpoImage ref={image} source={{ uri: mediaUrl(url) }} style={StyleSheet.absoluteFill} autoplay={playing}
    testID="editorial-story-gif" contentFit={fit} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

const close = () => goBack('/stories');

export function EditorialStoryScreen({ id }: { id: string }) {
  const query = useEditorialStory(id);
  const t = useT();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const story = query.story;
  const composition = story && storyPresentation(story);
  if (story && composition) return <StorySlides story={story} composition={composition} />;
  return <View style={[styles.screen, { paddingTop: insets.top }] }>
    {focused ? <StatusBar style="light" /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={t('social.close')} onPress={close} style={styles.control}>
      <Ionicons name="close-outline" color={BRAND.white} size={ICON_SIZE.lg} />
    </Pressable>
    {query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : query.isPending ? <LoadingBlock /> :
      <AppText color={BRAND.white} style={styles.notice}>{t('social.empty')}</AppText>}
  </View>;
}

export function StorySlides({ story, composition }: { story: EditorialStory; composition: StoryEditorial }) {
  const { t, locale } = useI18n();
  const { isRTL } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const reduced = useReduceMotion();
  const sessionId = useSessionId();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(reduced);
  const [muted, setMuted] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [elapsed, setElapsed] = useState(0);
  const [videoSeconds, setVideoSeconds] = useState(15);
  const clock = useRef(0);
  const seen = useRef(false);
  useEffect(() => {
    if (!focused || seen.current) return;
    seen.current = true;
    void sendInteraction({ type: 'view', targetId: story.id, sessionId: sessionId || undefined }).catch(() => null);
  }, [focused, sessionId, story.id]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  const lastIndex = composition.slides.length - 1;
  const step = Math.min(index, lastIndex);
  const slide = composition.slides[step];
  const playing = focused && foreground && !paused;
  const jump = useCallback((target: number) => {
    if (target === step) return;
    if (target > lastIndex) { close(); return; }
    setIndex(Math.max(0, target)); setVideoSeconds(15); clock.current = 0; setElapsed(0);
  }, [lastIndex, step]);
  const onDuration = useCallback((seconds: number) => setVideoSeconds(Math.min(60, Math.max(3, seconds))), []);
  const duration = (slide?.seconds ?? (slide?.media.kind === 'video' ? videoSeconds : 7)) * 1000;
  useEffect(() => {
    if (!playing) return;
    let stamp = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      clock.current += Math.min(250, now - stamp);
      stamp = now;
      setElapsed(clock.current);
      if (clock.current >= duration) { clearInterval(timer); jump(step + 1); }
    }, 80);
    return () => clearInterval(timer);
  }, [playing, duration, jump, step]);
  const favorites = useStoryFavorites();
  if (!slide) return null;
  const local = (value: { text: string; textAr?: string }) => (locale === 'ar' && value.textAr) || value.text;
  const title = local(slide.title) || (step === 0 ? (locale === 'ar' && story.titleAr) || story.title : ''), caption = local(slide.caption);
  const inset = slide.layout === 'inset';
  const products = storySlideProductIds(slide).flatMap(id => { const product = story.products.find(row => row.id === id); return product ? [product] : []; });
  const direction = rowDirectionFor(isRTL);
  const openArticle = () => router.push({ pathname: '/story-article/[id]', params: { id: story.id } });
  const cta = composition.article && slide.action ? <Pressable testID="editorial-story-cta" accessibilityRole="link" onPress={openArticle} style={styles.cta}>
    <AppText color={BRAND.white}>{t(slide.action === 'read' ? 'storiesEditorial.read' : slide.action === 'explore' ? 'storiesEditorial.explore' : 'shopping.discover')}</AppText>
  </Pressable> : null;
  const showMedia = (fit: 'cover' | 'contain' = 'cover') => slide.media.kind === 'video' ?
    <StoryVideo key={`${step}:${slide.media.url}`} media={slide.media} playing={playing} muted={muted} fit={fit} onDuration={onDuration} /> :
    slide.media.kind === 'gif' ? <StoryGif key={`${step}:${slide.media.url}`} url={slide.media.url} playing={playing} fit={fit} /> :
      <AppImage key={`${step}:${slide.media.url}`} testID="editorial-story-image" uri={mediaUrl(slide.media.url)} decorative contentFit={fit} style={StyleSheet.absoluteFill} />;
  const control = (name: React.ComponentProps<typeof Ionicons>['name'], label: string, action: () => void, id: string) =>
    <Pressable testID={id} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={styles.control}>
      <Ionicons name={name} color={BRAND.white} size={ICON_SIZE.lg} />
    </Pressable>;
  const zones = <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.zones, { flexDirection: direction }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('social.previous')} onPress={() => jump(step - 1)} style={styles.zone} />
    <View pointerEvents="none" style={styles.zoneCenter} />
    <Pressable accessibilityRole="button" accessibilityLabel={t('social.next')} onPress={() => jump(step + 1)} style={styles.zone} />
  </View>;
  const page = Math.min(width, STORY.maxWidth);
  return <View testID="editorial-story-viewer" style={styles.screen}>
    {focused ? <StatusBar style="light" /> : null}
    <View style={[styles.inner, { width: page, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8 }]}>
      {!inset ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {showMedia(slide.layout === 'product' ? 'contain' : 'cover')}
        <LinearGradient colors={[veil(0.96), veil(0.6), 'transparent', 'transparent', veil(0.86)]} locations={[0, 0.1, 0.22, 0.72, 1]} style={StyleSheet.absoluteFill} />
      </View> : null}
      <View testID="editorial-story-progress" accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: composition.slides.length, now: step + 1 }}
        style={[styles.bars, { flexDirection: direction }]}>
        {composition.slides.map((_, i) => <View key={i} style={styles.track}>
          <View style={[styles.fill, { width: `${i < step ? 100 : i > step ? 0 : Math.min(100, 100 * elapsed / duration)}%` }]} />
        </View>)}
      </View>
      <View style={[styles.controls, { flexDirection: direction }]}>
        {control(paused ? 'play-circle' : 'pause-circle', t(paused ? 'social.play' : 'social.pause'), () => setPaused(value => !value), 'editorial-story-pause')}
        {control(muted ? 'volume-mute' : 'volume-high', t(muted ? 'social.unmute' : 'social.mute'), () => setMuted(value => !value), 'editorial-story-mute')}
        {control('close-outline', t('social.close'), close, 'editorial-story-close')}
      </View>
      {inset ? <ScrollView style={styles.insetScroll} contentContainerStyle={styles.insetCopy}>
        <View testID="editorial-story-inset" style={[styles.insetMedia, { height: Math.min((page - 2 * STORY.inset) / STORY.aspect, height * 0.49) }]}>
          {showMedia()}{zones}
        </View>
        {title ? <AppText accessibilityRole="header" color={BRAND.white} style={styles.title}>{title}</AppText> : null}
        {caption ? <AppText color={BRAND.white} style={styles.caption}>{caption}</AppText> : null}
      </ScrollView> : <View style={styles.mediaSpace}>{zones}</View>}
      <View style={inset ? styles.insetFooter : styles.fullFooter}>
        {!inset && title ? <AppText accessibilityRole="header" color={BRAND.white} style={slide.layout === 'product' ? undefined : styles.title} numberOfLines={3}>{title}</AppText> : null}
        {!inset && caption ? <AppText color={BRAND.white} style={styles.caption} numberOfLines={4}>{caption}</AppText> : null}
        {products.length === 1 ? <StoryEditorialProduct item={products[0]!} saved={favorites.isFavorite(products[0]!.id)} onFavorite={() => favorites.toggle(products[0]!.id)} /> : null}
        {products.length > 1 ? <ScrollView testID="editorial-story-product-rail" horizontal showsHorizontalScrollIndicator={false}
          snapToInterval={page - 2 * STORY.fullInset - 24 + 8} decelerationRate="fast" contentContainerStyle={[styles.productRail, { direction: isRTL ? 'rtl' : 'ltr' }]}>
          {products.map(product => <View key={product.id} style={{ width: page - 2 * STORY.fullInset - 24 }}>
            <StoryEditorialProduct item={product} saved={favorites.isFavorite(product.id)} onFavorite={() => favorites.toggle(product.id)} />
          </View>)}
        </ScrollView> : null}
        {cta}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HERO_COPY.black, alignItems: 'center' },
  inner: { flex: 1, overflow: 'hidden' },
  bars: { marginHorizontal: STORY.inset, flexDirection: 'row', gap: 4 },
  track: { flex: 1, height: 2, backgroundColor: NEUTRALS.textSecondary, borderRadius: RADIUS.full, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: BRAND.white },
  controls: { justifyContent: 'flex-end', marginHorizontal: STORY.inset, paddingTop: 12, gap: 4 },
  control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mediaSpace: { flex: 1 },
  zones: { justifyContent: 'space-between' },
  zone: { width: '38%' },
  zoneCenter: { flex: 1 },
  insetScroll: { flex: 1 },
  insetCopy: { paddingHorizontal: STORY.inset, paddingTop: 12, paddingBottom: 12, gap: 16 },
  insetMedia: { width: '100%', borderRadius: RADIUS.lg, overflow: 'hidden' },
  productRail: { gap: 8 },
  fullFooter: { paddingHorizontal: STORY.fullInset, gap: 12 },
  insetFooter: { paddingHorizontal: STORY.inset },
  cta: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BRAND.white, borderRadius: RADIUS.full },
  title: { fontSize: STORY.title, lineHeight: STORY.titleLine },
  caption: { lineHeight: STORY.captionLine },
  notice: { padding: 16 },
});
