/**
 * عارض الستوريهات الكامل (Q3، 08/10/2026).
 *
 * بناء **أصلي** بالكامل: أشرطة تقدّم مجزّأة، تقدّم زمني، لمس يمين/يسار،
 * ضغطة مطوّلة للتوقيف، وإغلاق. ما نقلناش ولا سطر من عرض الستوريهات متاع
 * الموقع — نقلنا **الخاصية** وبنيناهالو شكل من عندنا.
 *
 * وقاعدتان من الخادم محترمتان بالحرف:
 *  • **المشاهدة تُسجَّل مرّة وحدة** لكل مالك (`recorded`) ⇒ ما نكرّرهاش.
 *  • **الإعجاب والتعليق يحتاجو حساباً** (`401 AUTH_REQUIRED`) ⇒ الزر معطّل
 *    **بسبب مكتوب**، موش يفشل بعد الضغطة.
 *
 * الأنيميشن هنا `Animated` مدمج (صفر مكتبة)؛ الترقية الكبرى ⇒ **Q8**.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Image, Modal, Pressable, StatusBar, StyleSheet, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VideoView, useVideoPlayer } from 'expo-video';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { useSession } from '@/state/session';
import { sendInteraction } from '@/api/social';
import type { StoryItem } from '@/api/sections';
import { useAyWebsSessionId } from '@/features/aywebs/session';

/** مدّة الستوري الواحد: صورة 6 ثوانٍ، فيديو مدّته من الخادم. */
const IMAGE_DURATION_MS = 6_000;

export interface StoryViewerProps {
  stories: StoryItem[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  onOpenTarget?: (story: StoryItem) => void;
  /** يُنادى كلّما صار ستوري هو الظاهر — الشاشة تعلّمو «مُشاهَد». */
  onStorySeen?: (story: StoryItem) => void;
}

export function StoryViewer({ stories, initialIndex = 0, visible, onClose, onOpenTarget, onStorySeen }: StoryViewerProps) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const guestSession = useAyWebsSessionId();
  const signedIn = session.status === 'signedIn';

  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  const current = stories[index] ?? null;
  const isVideo = current?.mediaType === 'VIDEO';
  const duration = isVideo ? 15_000 : IMAGE_DURATION_MS;

  // الفيديو: مشغّل واحد، يتوقّف مع التوقيف ومع تغيير الستوري.
  const player = useVideoPlayer(current && isVideo ? { uri: mediaUrl(current.mediaUrl) } : null, (instance) => {
    instance.loop = true;
    instance.play();
  });
  useEffect(() => {
    if (!player) return;
    if (paused) player.pause();
    else player.play();
  }, [player, paused]);

  /** المشاهدة تُسجَّل مرّة وحدة لكل ستوري (الخادم يمنع التكرار أصلاً). */
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!visible || !current || seen.current.has(current.id)) return;
    seen.current.add(current.id);
    sendInteraction({ type: 'view', targetId: current.id, sessionId: guestSession || undefined })
      .catch(() => null); // مشاهدة ما تسجّلتش ⇒ ما نقطعش على المستعمل العرض.
  }, [visible, current, guestSession]);

  useEffect(() => {
    if (visible && current && onStorySeen) onStorySeen(current);
  }, [visible, current, onStorySeen]);

  const goNext = useCallback(() => {
    setLiked(false);
    setIndex((value) => (value + 1 < stories.length ? value + 1 : value));
  }, [stories.length]);

  const goPrev = useCallback(() => {
    setLiked(false);
    setIndex((value) => (value > 0 ? value - 1 : value));
  }, []);

  // التقدّم الزمني: شريط واحد يمشي، والستوري يتعدّى لوحدو.
  useEffect(() => {
    if (!visible || !current) return;
    progress.setValue(0);
    if (paused) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      if (index + 1 < stories.length) goNext();
      else onClose();
    });
    return () => animation.stop();
  }, [visible, current, index, paused, duration, progress, stories.length, goNext, onClose]);

  const toggleLike = useCallback(async () => {
    if (!current || !signedIn) return;
    const result = await sendInteraction({ type: 'like', targetId: current.id, sessionId: guestSession || undefined });
    // رقم الخادم هو الحكم، موش تفاؤلنا.
    setLiked(result.liked ?? !liked);
  }, [current, signedIn, guestSession, liked]);

  const bars = useMemo(() => stories.map((_, position) => position), [stories]);

  if (!current) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.root, { backgroundColor: theme.colors.canvas, paddingTop: insets.top }]}>
        {/* أشرطة التقدّم — شريط لكل ستوري */}
        <View style={styles.bars}>
          {bars.map((position) => (
            <View key={position} style={[styles.barTrack, { backgroundColor: theme.colors.line }]}>
              <Animated.View
                style={{
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: theme.colors.accent,
                  width: position === index
                    ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : position < index ? '100%' : '0%',
                }}
              />
            </View>
          ))}
        </View>

        {/* رأس: الإغلاق */}
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('social.close')}
            onPress={onClose}
            style={styles.close}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* مناطق اللمس */}
        {/* في العربية «التالي» على اليسار: القراءة تبدأ من اليمين. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="previous"
          onPress={goPrev}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          style={[styles.tapZone, theme.isRTL ? styles.tapRight : styles.tapLeft]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="next"
          onPress={goNext}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          style={[styles.tapZone, theme.isRTL ? styles.tapLeft : styles.tapRight]}
        />

        {/* الوسائط */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {isVideo ? (
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          ) : current.mediaUrl ? (
            <Image source={{ uri: mediaUrl(current.mediaUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.emptyMedia, { backgroundColor: theme.colors.surface }]}>
              <AppText variant="label" color={theme.colors.muted}>{current.title || t('sections.stories')}</AppText>
            </View>
          )}
        </View>

        {/* التذييل: العنوان + الإجراءات */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {current.title ? <AppText variant="title" weight="bold" color="#FFFFFF">{current.title}</AppText> : null}
          {current.description ? (
            <AppText variant="caption" color="#FFFFFF" numberOfLines={3}>{current.description}</AppText>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={liked ? t('social.liked') : t('social.like')}
              accessibilityState={{ disabled: !signedIn }}
              disabled={!signedIn}
              onPress={toggleLike}
              style={[styles.action, { opacity: signedIn ? 1 : 0.45 }]}
            >
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? theme.colors.accent : '#FFFFFF'} />
            </Pressable>

            {signedIn ? null : (
              <AppText variant="caption" color="#FFFFFF">{t('social.needAccount')}</AppText>
            )}

            {current.cta && onOpenTarget ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={current.cta}
                onPress={() => onOpenTarget(current)}
                style={[styles.cta, { backgroundColor: theme.colors.accent, borderRadius: theme.radius.cta }]}
              >
                <AppText variant="label" weight="bold" color="#000000">{current.cta}</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 8 },
  barTrack: { flex: 1, height: 3, borderRadius: 999, overflow: 'hidden' },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingTop: 8 },
  close: { padding: 4 },
  tapZone: { position: 'absolute', top: 0, bottom: 0, width: '33%', zIndex: 2 },
  tapLeft: { left: 0 },
  tapRight: { right: 0 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 6, zIndex: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  action: { padding: 4 },
  cta: { paddingHorizontal: 16, paddingVertical: 10, marginInlineStart: 'auto' },
  emptyMedia: { alignItems: 'center', justifyContent: 'center' },
});
