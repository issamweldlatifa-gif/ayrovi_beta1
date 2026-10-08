/**
 * المنشورات (Q3، 08/10/2026).
 *
 * المنشور منشور **صورة** (موّش فيديو): العنوان، العنوان الفرعي، والصورة.
 * والاجتماعي (إعجاب · تعليق) يخدم عليه بنفس مفتاح الهدف متاع الستوري والريلز
 * — الخادم يجمع الثلاثة في `story_interactions` بنفس `targetId`.
 *
 * والقاعدة ثابتة: **الإعجاب يحتاج حساباً** ⇒ الزر معطّل بسبب مكتوب.
 */
import { useCallback, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { usePublications, useSocialCounts } from '@/api/hooks';
import { useSession } from '@/state/session';
import { sendInteraction } from '@/api/social';
import { Comments } from '@/features/social/Comments';
import { useAyWebsSessionId } from '@/features/aywebs/session';
import type { Publication } from '@/api/social';

export default function PublicationsScreen() {
  const theme = useTheme();
  const t = useT();
  const session = useSession();
  const guestSession = useAyWebsSessionId();
  const signedIn = session.status === 'signedIn';

  const publications = usePublications();
  const [commentsFor, setCommentsFor] = useState<Publication | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  const rows = publications.data ?? [];
  const counts = useSocialCounts(rows.map((row) => row.id));

  const toggleLike = useCallback(async (item: Publication) => {
    if (!signedIn) return;
    const result = await sendInteraction({ type: 'like', targetId: item.id, sessionId: guestSession || undefined });
    setLiked((previous) => ({ ...previous, [item.id]: result.liked ?? !previous[item.id] }));
  }, [signedIn, guestSession]);

  const closeComments = useCallback(() => setCommentsFor(null), []);

  return (
    <SubScreen
      title={t('social.publications')}
      subtitle={t('social.title')}
      onRefresh={() => { publications.refetch(); counts.refetch(); }}
      refreshing={publications.isFetching}
      fallback="/(tabs)"
    >
      {publications.isPending ? <LoadingBlock /> : null}
      {publications.isError ? <ErrorBlock error={publications.error} onRetry={() => publications.refetch()} /> : null}
      {!publications.isPending && !publications.isError && rows.length === 0 ? (
        <EmptyBlock>{t('social.empty')}</EmptyBlock>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const countsFor = counts.data?.[item.id];
          return (
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
              {item.imageUrl ? (
                <Image source={{ uri: mediaUrl(item.imageUrl) }} style={styles.image} resizeMode="cover" />
              ) : null}
              <View style={styles.body}>
                {item.title ? <AppText variant="label" weight="bold">{item.title}</AppText> : null}
                {item.subtitle ? (
                  <AppText variant="caption" color={theme.colors.muted}>{item.subtitle}</AppText>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={liked[item.id] ? t('social.liked') : t('social.like')}
                    accessibilityState={{ disabled: !signedIn }}
                    disabled={!signedIn}
                    onPress={() => toggleLike(item)}
                    style={[styles.action, { opacity: signedIn ? 1 : 0.45 }]}
                  >
                    <Ionicons
                      name={liked[item.id] ? 'heart' : 'heart-outline'}
                      size={20}
                      color={liked[item.id] ? theme.status.danger.fg : theme.colors.muted}
                    />
                    <AppText variant="caption" color={theme.colors.muted}>{String(countsFor?.likes ?? 0)}</AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('social.comments')}
                    onPress={() => setCommentsFor(item)}
                    style={styles.action}
                  >
                    <Ionicons name="chatbubble-outline" size={20} color={theme.colors.muted} />
                    <AppText variant="caption" color={theme.colors.muted}>{String(countsFor?.comments ?? 0)}</AppText>
                  </Pressable>
                </View>

                {!signedIn ? (
                  <AppText variant="caption" color={theme.colors.muted}>{t('social.needAccount')}</AppText>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <View style={styles.spacer} />

      <Modal visible={commentsFor !== null} animationType="slide" onRequestClose={closeComments}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.canvas }]}>
          <AppText variant="title" weight="bold">{t('social.comments')}</AppText>
          {commentsFor ? <Comments targetId={commentsFor.id} /> : null}
          <Pressable accessibilityRole="button" onPress={closeComments} style={styles.closeBtn}>
            <AppText variant="label" weight="bold" color={theme.colors.ink}>{t('social.close')}</AppText>
          </Pressable>
        </View>
      </Modal>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 4 / 3 },
  body: { padding: 12, gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spacer: { height: 24 },
  sheet: { flex: 1, padding: 20, gap: 10, paddingTop: 48 },
  closeBtn: { paddingVertical: 12, alignSelf: 'flex-start' },
});
