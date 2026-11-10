import { memo, useCallback, useEffect, useRef, useState } from 'react';
/**
 * « Cover » d'accueil — le NOUVEAU bloc d'entrée, plein écran sous les onglets.
 *
 * Remplace l'ancienne section « à la une » (image + titre dessous + bouton bloc).
 * Modèle de référence : splash « Nouveautés — votre dose hebdomadaire · Je découvre » :
 *  • média PLEIN ÉCRAN (image, vidéo, ou une suite des deux) qui défile ;
 *  • grand texte blanc posé SUR le média, en bas ;
 *  • bouton contour TRANSPARENT par-dessus le média ;
 *  • bouton pause (comme la référence) : arrête le défilement ET la vidéo.
 *
 * Piloté par le CRM (`/api/public/home-cover`) : réglage vide ou masqué ⇒ rien,
 * jamais un bloc vide. Le bouton ouvre une page de l'APPLICATION uniquement.
 */
import {
  AccessibilityInfo, AppState, FlatList, Pressable, StyleSheet, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router, useIsFocused } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useHomeCover } from '@/api/hooks';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useResponsive } from '@/design/layout';
import { ICON_SIZE, RADIUS, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import type { HomeCoverSlide } from '@/api/public';
import { withAlpha } from './heroPalette';
import { isStillAfterDrag } from './heroCarouselLogic';

/** Hauteur du bloc : ~1,4 × la largeur, comme le splash de référence. */
export const COVER_ASPECT = 10 / 14;

/** Destination fermée : des pages de l'APPLICATION, jamais du site. */
const DESTINATION_ROUTES = {
  publications: '/publications',
  catalog: '/catalog',
  promotions: '/promotions',
} as const;

/** Vidéo d'une cover : muette, en boucle, lisible seulement quand elle est active. */
const CoverVideo = memo(function CoverVideo({
  slide, active, playing,
}: { slide: HomeCoverSlide; active: boolean; playing: boolean }) {
  const [loaded, setLoaded] = useState(active);
  useEffect(() => {
    if (active) setLoaded(true);
  }, [active]);
  const player = useVideoPlayer(loaded ? { uri: mediaUrl(slide.url) } : null, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });
  useEffect(() => {
    if (active && playing) void player.play();
    else player.pause();
  }, [active, playing, player]);
  return (
    <View testID={`home-cover-video-${slide.id}`} style={styles.fill}>
      {slide.poster ? (
        <AppImage uri={mediaUrl(slide.poster)} style={styles.fill} contentFit="cover" decorative />
      ) : null}
      {loaded ? <VideoView player={player} style={styles.fill} nativeControls={false} contentFit="cover" /> : null}
    </View>
  );
});

export const HomeCover = memo(function HomeCover() {
  const theme = useTheme();
  const { locale } = useI18n();
  const { gutter } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const cover = useHomeCover();

  const [viewportWidth, setViewportWidth] = useState(windowWidth);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    if (measured > 0) setViewportWidth(measured);
  }, []);

  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(false);
  const listRef = useRef<FlatList<HomeCoverSlide>>(null);

  // Mouvement réduit (préférence système) : pas de défilement automatique.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  const slides = cover.data?.slides ?? [];
  const paused = interacting || !isFocused || !appActive || userPaused;
  const hasVideo = slides.some((slide) => slide.type === 'video');

  // Défilement automatique d'un média au suivant, même philosophie que le Hero :
  // arrêt sur le dernier (pas de saut brusque), pause au toucher et hors foyer.
  const indexRef = useRef(0);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => {
    if (slides.length < 2 || paused || reduceMotion) return;
    const timer = setInterval(() => {
      const next = Math.min(indexRef.current + 1, slides.length - 1);
      if (next === indexRef.current) return;
      indexRef.current = next;
      const offset = theme.isRTL ? -next * viewportWidth : next * viewportWidth;
      listRef.current?.scrollToOffset({ offset, animated: true });
      setIndex(next);
    }, cover.data?.autoplayIntervalMs ?? 5000);
    return () => clearInterval(timer);
  }, [slides.length, paused, reduceMotion, viewportWidth, cover.data?.autoplayIntervalMs, theme.isRTL]);

  const onScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setInteracting(false);
    const offset = Math.abs(event.nativeEvent.contentOffset.x);
    if (viewportWidth <= 0) return;
    setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(offset / viewportWidth))));
  }, [slides.length, viewportWidth]);

  // Masquée par le CRM (ou réponse vide) ⇒ rien, jamais un bloc vide.
  if (cover.isPending || !cover.data || !cover.data.enabled) return null;

  const title = cover.data.title;
  const ctaLabel = cover.data.ctaLabel || (locale === 'ar' ? 'اكتشف' : 'Je découvre');
  const route = DESTINATION_ROUTES[cover.data.destination] ?? '/publications';
  const pauseLabel = userPaused
    ? (locale === 'ar' ? 'تشغيل التمرير' : 'Reprendre le défilement')
    : (locale === 'ar' ? 'إيقاف التمرير مؤقتًا' : 'Mettre le défilement en pause');

  return (
    <View
      testID="home-cover"
      onLayout={onLayout}
      style={[styles.section, { marginHorizontal: -gutter, backgroundColor: theme.colors.shimmer }]}
      accessibilityLabel={title || undefined}
    >
      <View style={[styles.media, { aspectRatio: COVER_ASPECT, borderRadius: theme.radius.card }]}>
        <FlatList
          testID="home-cover-list"
          horizontal
          pagingEnabled
          inverted={theme.isRTL}
          data={slides}
          keyExtractor={(slide) => slide.id}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          getItemLayout={(_, i) => ({ length: viewportWidth, offset: viewportWidth * i, index: i })}
          onScrollBeginDrag={() => setInteracting(true)}
          onScrollEndDrag={(event) => {
            if (isStillAfterDrag(event.nativeEvent.velocity?.x)) setInteracting(false);
          }}
          onMomentumScrollEnd={onScrollEnd}
          accessibilityLabel={`${index + 1}/${slides.length}`}
          renderItem={({ item, index: slideIndex }) => (
            <View style={{ width: viewportWidth, height: '100%' }}>
              {item.type === 'video' ? (
                <CoverVideo slide={item} active={slideIndex === index} playing={!paused} />
              ) : (
                <Pressable
                  accessibilityRole={route ? 'button' : undefined}
                  accessibilityLabel={item.alt || title || undefined}
                  onPress={() => router.push(route as never)}
                  style={styles.fill}
                >
                  <AppImage
                    testID={`home-cover-image-${item.id}`}
                    uri={item.localImage != null ? null : mediaUrl(item.url)}
                    localSource={item.localImage}
                    style={styles.fill}
                    contentFit="cover"
                    accessibilityLabel={item.alt || title || undefined}
                  />
                </Pressable>
              )}
            </View>
          )}
        />
        {/* Voile bas SEULEMENT derrière le texte : le média reste clair ailleurs. */}
        <LinearGradient
          colors={['transparent', withAlpha(VIDEO_BACKDROP, 0.62)]}
          locations={[0, 1]}
          style={styles.veil}
          pointerEvents="none"
        />
        <View style={styles.overlay} pointerEvents="box-none">
          {title ? (
            <AppText
              testID="home-cover-title"
              variant="h1"
              color={theme.colors.onMedia}
              numberOfLines={3}
              style={[styles.title, { fontFamily: theme.font('bold') }]}
            >
              {title}
            </AppText>
          ) : null}
          <Pressable
            testID="home-cover-cta"
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            onPress={() => router.push(route as never)}
            style={[styles.cta, { borderColor: theme.colors.onMedia }]}
          >
            <AppText variant="bodyStrong" color={theme.colors.onMedia}>{ctaLabel}</AppText>
          </Pressable>
        </View>
        {slides.length > 1 || hasVideo ? (
          <Pressable
            testID="home-cover-pause"
            accessibilityRole="button"
            accessibilityLabel={pauseLabel}
            accessibilityState={{ selected: !userPaused }}
            onPress={() => setUserPaused((value) => !value)}
            style={[styles.pause, { backgroundColor: withAlpha(VIDEO_BACKDROP, 0.55) }]}
          >
            <Ionicons
              name={userPaused ? 'play-outline' : 'pause-outline'}
              size={ICON_SIZE.sm}
              color={theme.colors.onMedia}
            />
          </Pressable>
        ) : null}
      </View>
      <AppText variant="caption" color={theme.colors.muted} style={styles.counter}>
        {`${index + 1}/${slides.length}`}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  // Marge négative = celle de l'écran : le média vit PLEIN ÉCRAN (règle des
  // médias de l'accueil), coins arrondis seulement sur le bloc lui-même.
  section: { paddingVertical: 16 },
  media: { width: '100%', overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill },
  veil: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '52%' },
  // Texte + bouton posés SUR le média, en bas, centrés comme la référence.
  overlay: {
    position: 'absolute', left: 0, right: 0, bottom: 20,
    alignItems: 'center', gap: 16, paddingHorizontal: 20,
  },
  title: { textAlign: 'center' },
  // Bouton contour TRANSPARENT : le média reste visible à travers lui.
  cta: {
    minHeight: 48,
    minWidth: 200,
    paddingHorizontal: 32,
    borderWidth: 1.5,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pause: {
    position: 'absolute', bottom: 14, end: 14,
    width: 44, height: 44, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  counter: { marginTop: 6, textAlign: 'center' },
});
