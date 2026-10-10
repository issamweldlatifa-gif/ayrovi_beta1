/**
 * بطاقة ريلز (Q3، 08/10/2026).
 *
 * قاعدتان تقنيّتان تمنعان «تطبيـق يعلّق»:
 *  • **مشغّل واحد للبطاقة الظاهرة فقط** (`active`): عشرة مشغّلات دفعة وحدة
 *    جهاز متوسّط يخنق. البطاقات البعيدة تعرض إطاراً وتنتظر.
 *  • **الصوت مطفي افتراضياً**: ريلز يبدأ يصرخ في الأماكن العامة أسوأ من ريلز
 *    ينتظر لمسة.
 *
 * وقاعدة الصدق: **الإعجاب يحتاج حساباً** ⇒ الزر معطّل بسبب مكتوب.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VideoView, useVideoPlayer } from 'expo-video';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { MEDIA_RATIO, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import { mediaUrl } from '@/api/client';
import { useSession } from '@/state/session';
import { sendInteraction, type Reel } from '@/api/social';
import { useAyWebsSessionId } from '@/features/aywebs/session';

export interface ReelCardProps {
  reel: Reel;
  /** هل هذه البطاقة هي الظاهرة؟ المشغّل يُنشأ لها وحدها. */
  active: boolean;
  counts?: { likes: number; comments: number; views: number; shares: number };
  onOpenComments: (reel: Reel) => void;
  /**
   * Mode plein écran (visionneuse) : la vidéo remplit `width`×`height`, le texte
   * et les actions se posent par-dessus en blanc. Absent ⇒ carte de la liste.
   */
  fill?: { width: number; height: number };
}

export function ReelCard({ reel, active, counts, onOpenComments, fill }: ReelCardProps) {
  const theme = useTheme();
  const t = useT();
  const session = useSession();
  const guestSession = useAyWebsSessionId();
  const signedIn = session.status === 'signedIn';
  // En plein écran le texte est posé sur la vidéo : blanc, pas la couleur de carte.
  const ink = fill ? theme.colors.onMedia : theme.colors.ink;
  const muted = fill ? theme.colors.onMedia : theme.colors.muted;

  const [liked, setLiked] = useState(false);
  const [paused, setPaused] = useState(false);

  // `null` ⇒ لا مشغّل: البطاقة البعيدة ما تكلّفش الجهاز ولا الشبكة.
  const player = useVideoPlayer(active ? { uri: mediaUrl(reel.videoUrl) } : null, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  useEffect(() => {
    if (!player) return;
    if (paused || !active) player.pause();
    else player.play();
  }, [player, paused, active]);

  const toggleLike = useCallback(async () => {
    if (!signedIn) return;
    const result = await sendInteraction({ type: 'like', targetId: reel.id, sessionId: guestSession || undefined });
    setLiked(result.liked ?? !liked);
  }, [signedIn, reel.id, guestSession, liked]);

  /**
   * المشاركة: نفتح ورقة النظام **ونسجّلها عند الخادم**.
   *
   * التسجيل يسبق الورقة: كان الخادم رفض، المستعمل يعرف قبل ما يشارك رابطاً
   * ما تنجمش تتفتح. والمشاركة تُسجَّل **مرّة وحدة** لكل مالك (عدّاد صادق).
   */
  const share = useCallback(async () => {
    await sendInteraction({ type: 'share', targetId: reel.id, sessionId: guestSession || undefined }).catch(() => null);
    await Share.share({ message: reel.title || reel.description || 'AYROVI' }).catch(() => null);
  }, [reel.id, reel.title, reel.description, guestSession]);

  return (
    <View style={fill
      ? [styles.card, styles.fillCard, { width: fill.width, height: fill.height }]
      : [styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
      <View style={fill ? styles.fillMedia : [styles.media, { backgroundColor: theme.colors.canvas }]}>
        {active && player ? (
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.poster]}>
            <Ionicons name="play-circle-outline" size={44} color={muted} accessibilityElementsHidden />
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? t('social.play') : t('social.pause')}
          onPress={() => setPaused((value) => !value)}
          style={StyleSheet.absoluteFill}
        />

        {!fill && reel.durationSeconds > 0 ? (
          <View style={styles.duration}>
            <AppText variant="caption" color={theme.colors.onMedia}>{`0:${String(reel.durationSeconds % 60).padStart(2, '0')}`}</AppText>
          </View>
        ) : null}
      </View>

      <View style={fill ? styles.fillBody : styles.body}>
        {reel.title ? <AppText variant="label" weight="bold" color={ink} numberOfLines={1}>{reel.title}</AppText> : null}
        {reel.description ? (
          <AppText variant="caption" color={muted} numberOfLines={2}>{reel.description}</AppText>
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
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? theme.status.danger.fg : muted} accessibilityElementsHidden />
            <AppText variant="caption" color={muted}>{String(counts?.likes ?? reel.likes)}</AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('social.comments')}
            onPress={() => onOpenComments(reel)}
            style={styles.action}
          >
            <Ionicons name="chatbubble-outline" size={20} color={muted} accessibilityElementsHidden />
            <AppText variant="caption" color={muted}>{String(counts?.comments ?? 0)}</AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('social.share')}
            onPress={share}
            style={styles.action}
          >
            <Ionicons name="share-social-outline" size={20} color={muted} accessibilityElementsHidden />
            <AppText variant="caption" color={muted}>{String(counts?.shares ?? 0)}</AppText>
          </Pressable>

          {counts && counts.views > 0 ? (
            <AppText variant="caption" color={muted}>{t('social.views', { value: String(counts.views) })}</AppText>
          ) : null}
        </View>

        {!signedIn ? (
          <AppText variant="caption" color={muted}>{t('social.needAccount')}</AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, overflow: 'hidden' },
  media: { width: '100%', aspectRatio: MEDIA_RATIO.reel, justifyContent: 'flex-end' },
  fillCard: { marginBottom: 0, borderRadius: 0, backgroundColor: VIDEO_BACKDROP },
  fillMedia: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: VIDEO_BACKDROP },
  fillBody: { position: 'absolute', start: 0, end: 0, bottom: 0, padding: 16, paddingBottom: 32, gap: 6 },
  poster: { alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', top: 10, start: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  body: { padding: 12, gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
