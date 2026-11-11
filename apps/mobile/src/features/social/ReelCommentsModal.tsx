/**
 * Feuille des commentaires d'un Reel — refonte 10/11 (référence vidéo du
 * propriétaire, planches `/home/user/reel-reference/`).
 *
 * ── Ce qui a changé, et pourquoi ────────────────────────────────────────────
 *  • **Feuille sombre fidèle à la référence** (#121212 mesuré image par image)
 *    qui monte du bas par-dessus la vidéo (AppSheet `presentation: 'bottom'`),
 *    poignée + « 9 Commentaires » + tri + croix, champ pilule
 *    « Partager votre avis » avec compteur 0/500 et barre de défilement
 *    orange. La feuille des Reels ne suit PAS le thème : elle vit sur un
 *    média, toujours sombre — le noir n'est pas « le mode sombre », c'est le
 *    SUPPORT.
 *  • **Réactions par commentaire** (référence : pouce qui passe au BLEU avec le
 *    compteur 1 → 2, pouce bas au ROUGE) — la table serveur
 *    `social_comment_reactions` les porte ; le pouce du commentaire est
 *    distinct du like de publication.
 *  • **« Répondre » → « Réponses »** : sous-vue filtrée avec retour et citation
 *    du parent, comme la référence (25.8 s).
 *  • **Dates relatives** (« il y a 1 semaine », « il y a 2 mois ») —
 *    `format/relativeTime.ts` ; l'horodatage complet reste dans la feuille des
 *    publications, qui n'est pas touchée.
 *
 * Les lignes vivent DANS le ScrollView du tiroir (pas de FlatList imbriquée :
 * un défilement virtuel sans hauteur propre rendrait tout, sans rien gagner —
 * la feuille affiche au plus 100 commentaires). `Comments.tsx` reste celle des
 * publications : cette feuille pose ses lignes à plat sur le fond sombre,
 * comme la référence.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { RADIUS } from '@/design/tokens.mobile';
import { AppSheet } from '@/design/sheet/AppSheet';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { PublicationAuthSheet } from '@/features/publications/PublicationAuthSheet';
import { fetchComments, sendInteraction, type Reel, type SocialComment } from '@/api/social';
import { isApiError, userMessage } from '@/api/errors';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import { relativeTimeLabel } from '@/format/relativeTime';

const COMMENT_LIMIT = 500;
/** Brouillon par compte et par Reel, conservé en mémoire (plus AsyncStorage). */
const drafts = new Map<string, string>();
/** Identifiant de tentative anti-doublon, conservé jusqu'au succès du serveur. */
const attempts = new Map<string, string>();

export function ReelCommentsModal({ reel, onClose }: { reel: Reel; onClose: () => void }) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const session = useSession();
  const guest = useSessionId();
  const client = useQueryClient();
  const signedIn = session.status === 'signedIn';
  const owner = signedIn ? session.account?.id || 'guest' : 'guest';
  const draftKey = `reel-comment-draft:${owner}:${reel.id}`;

  const [sort, setSort] = useState<'recent' | 'oldest'>('recent');
  const [replyTo, setReplyTo] = useState<SocialComment | null>(null);
  const [draft, setDraft] = useState(drafts.get(draftKey) || '');
  const [auth, setAuth] = useState(false);
  const [error, setError] = useState('');
  const reactionLock = useRef(false);

  const comments = useQuery({
    queryKey: ['social', 'comments', reel.id],
    queryFn: ({ signal }) => fetchComments(reel.id, { signal }),
  });

  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(draftKey)
      .then((value) => { if (live && value && !drafts.has(draftKey)) { drafts.set(draftKey, value); setDraft(value); } })
      .catch(() => {});
    return () => { live = false; };
  }, [draftKey]);

  const change = (value: string) => {
    setDraft(value);
    drafts.set(draftKey, value);
    void AsyncStorage.setItem(draftKey, value).catch(() => {});
  };

  /** Mise à jour locale d'une ligne (réaction optimiste, puis état serveur). */
  const patch = (id: string, updater: (comment: SocialComment) => SocialComment) => {
    client.setQueryData<SocialComment[]>(['social', 'comments', reel.id], (prev) =>
      (prev || []).map((comment) => (comment.id === id ? updater(comment) : comment)));
  };

  const react = async (comment: SocialComment, wanted: 'like' | 'dislike' | null) => {
    if (!signedIn) { setAuth(true); return; }
    if (reactionLock.current) return;
    reactionLock.current = true;
    setError('');
    patch(comment.id, (row) => ({
      ...row,
      myReaction: wanted,
      likesCount: Math.max(0, (row.likesCount ?? 0)
        + (wanted === 'like' && row.myReaction !== 'like' ? 1 : 0)
        - (wanted !== 'like' && row.myReaction === 'like' ? 1 : 0)),
    }));
    try {
      const result = await sendInteraction({
        type: 'reaction',
        targetId: comment.id,
        reaction: wanted,
        sessionId: guest || undefined,
      });
      patch(comment.id, (row) => ({ ...row, myReaction: result.reaction, likesCount: result.likesCount }));
    } catch (cause) {
      patch(comment.id, () => comment);
      setError(isApiError(cause) ? userMessage(cause)[ar ? 'ar' : 'fr'] : t('common.retry'));
    } finally {
      reactionLock.current = false;
    }
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!attempts.has(draftKey)) {
        attempts.set(draftKey, `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
      }
      return sendInteraction({
        type: 'comment',
        clientRequestId: attempts.get(draftKey),
        targetId: reel.id,
        text: draft,
        parentId: replyTo?.id,
        sessionId: guest || undefined,
      });
    },
    onSuccess: (result) => {
      attempts.delete(draftKey);
      drafts.delete(draftKey);
      void AsyncStorage.removeItem(draftKey).catch(() => {});
      setDraft('');
      setError('');
      if (result.comment) {
        client.setQueryData<SocialComment[]>(['social', 'comments', reel.id], (prev) => [
          ...(prev || []).filter((row) => row.id !== result.comment!.id),
          result.comment!,
        ]);
      }
      void client.invalidateQueries({ queryKey: ['social', 'comments', reel.id] });
      void client.invalidateQueries({ queryKey: ['social', 'counts'] });
    },
    onError: (cause) => {
      if (isApiError(cause) && cause.status === 401) setAuth(true);
      setError(isApiError(cause) ? userMessage(cause)[ar ? 'ar' : 'fr'] : t('common.retry'));
    },
  });

  const rows = (comments.data || []).slice().sort((a, b) => sort === 'recent'
    ? b.createdAt.localeCompare(a.createdAt)
    : a.createdAt.localeCompare(b.createdAt));
  const visible = replyTo ? rows.filter((row) => row.parentId === replyTo.id) : rows;
  const canSend = draft.trim().length >= 2;

  const header = (
    <View>
      {/* Poignée : la référence montre une barre grise centrée sous le bord. */}
      <View style={[styles.grabber, { backgroundColor: theme.colors.reelSheetLine }]} />
      <View style={[styles.headerRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
        {replyTo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('social.back')}
            onPress={() => setReplyTo(null)}
            style={styles.iconTarget}
          >
            <Ionicons name={ar ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.md} color={theme.colors.reelSheetInk} />
          </Pressable>
        ) : null}
        <AppText variant="bodyStrong" color={theme.colors.reelSheetInk}>
          {replyTo
            ? t('social.replies')
            : rows.length === 1
              ? t('social.commentsTitleOne')
              : t('social.commentsTitle', { value: String(rows.length) })}
        </AppText>
        <View style={styles.spacer} />
        {!replyTo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(sort === 'recent' ? 'social.sortRecent' : 'social.sortOldest')}
            onPress={() => setSort((value) => (value === 'recent' ? 'oldest' : 'recent'))}
            style={styles.sortButton}
          >
            <Ionicons name="options-outline" size={theme.iconSize.xs} color={theme.colors.reelSheetMuted} />
            <AppText variant="caption" color={theme.colors.reelSheetMuted}>
              {t(sort === 'recent' ? 'social.sortRecent' : 'social.sortOldest')}
            </AppText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('social.close')}
          onPress={onClose}
          style={styles.iconTarget}
        >
          <Ionicons name="close" size={theme.iconSize.md} color={theme.colors.reelSheetInk} />
        </Pressable>
      </View>
      {replyTo ? (
        <View style={[styles.quote, { flexDirection: ar ? 'row-reverse' : 'row' }]} pointerEvents="none">
          <Ionicons name="return-down-forward" size={theme.iconSize.xs} color={theme.colors.reelSheetMuted} />
          <AppText variant="caption" color={theme.colors.reelSheetMuted} numberOfLines={1}>
            {replyTo.author} · {replyTo.text}
          </AppText>
        </View>
      ) : null}
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.commentDislike} style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <>
      <AppSheet
        open
        presentation="bottom"
        surfaceColor={theme.colors.reelSheet}
        footerSurfaceColor={theme.colors.reelSheet}
        footerLineColor={theme.colors.reelSheetLine}
        // Barre de défilement orange — la référence 10/11 l'impose (Android).
        indicatorColor={theme.colors.reelAccent}
        onDismiss={onClose}
        onClosed={onClose}
        header={header}
        footer={
          <View style={styles.composer}>
            <AppText variant="caption" color={theme.colors.reelSheetMuted} style={styles.charCount}>
              {t('social.charCount', { value: String(draft.length) })}
            </AppText>
            <View style={[styles.composerRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
              <TextInput
                value={draft}
                onChangeText={change}
                placeholder={t('social.placeholder')}
                placeholderTextColor={theme.colors.reelSheetMuted}
                maxLength={COMMENT_LIMIT}
                multiline
                style={[styles.field, theme.text('label'), { color: theme.colors.reelSheetInk, backgroundColor: theme.colors.reelSheetField }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('social.send')}
                accessibilityState={{ disabled: !canSend || send.isPending }}
                disabled={!canSend || send.isPending}
                onPress={() => send.mutate()}
                style={styles.iconTarget}
              >
                <Ionicons
                  name="paper-plane-outline"
                  size={theme.iconSize.sm}
                  color={canSend ? theme.colors.reelAccent : theme.colors.reelSheetMuted}
                />
              </Pressable>
            </View>
          </View>
        }
      >
        {comments.isPending ? <LoadingSpinner size="sm" color={theme.colors.reelSheetMuted} /> : null}
        {comments.isError ? (
          <Pressable accessibilityRole="button" onPress={() => void comments.refetch()} style={styles.retry}>
            <AppText variant="caption" color={theme.colors.reelSheetInk}>{t('social.retry')}</AppText>
          </Pressable>
        ) : null}
        {!comments.isPending && !comments.isError && visible.length === 0 ? (
          <AppText variant="caption" color={theme.colors.reelSheetMuted} style={styles.empty}>
            {t('social.noComments')}
          </AppText>
        ) : null}
        {visible.map((item) => (
          <View key={item.id} style={[styles.row, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.reelSheetLine }]}>
              <AppText variant="captionStrong" color={theme.colors.reelSheetInk}>
                {item.author.slice(0, 1)}
              </AppText>
            </View>
            <View style={styles.middle}>
              <View style={[styles.nameRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
                <AppText variant="captionStrong" color={theme.colors.reelSheetInk}>
                  {item.author}
                </AppText>
                <Ionicons name="checkmark-circle" size={theme.iconSize.xs} color={theme.colors.commentLike} accessibilityElementsHidden />
                <View style={styles.spacer} />
                <AppText variant="caption" color={theme.colors.reelSheetMuted}>
                  {relativeTimeLabel(item.createdAt, ar ? 'ar' : 'fr')}
                </AppText>
              </View>
              {item.parentId ? (
                <AppText variant="caption" color={theme.colors.reelSheetMuted}>
                  {t('social.reply')} · {rows.find((row) => row.id === item.parentId)?.author || ''}
                </AppText>
              ) : null}
              <AppText variant="body" color={theme.colors.reelSheetInk}>
                {item.text}
              </AppText>
              <View style={[styles.actions, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('social.like')}
                  accessibilityState={{ checked: item.myReaction === 'like' || undefined }}
                  onPress={() => void react(item, item.myReaction === 'like' ? null : 'like')}
                  style={styles.reaction}
                >
                  <Ionicons
                    name={item.myReaction === 'like' ? 'thumbs-up' : 'thumbs-up-outline'}
                    size={theme.iconSize.xs}
                    color={item.myReaction === 'like' ? theme.colors.commentLike : theme.colors.reelSheetMuted}
                  />
                  {(item.likesCount ?? 0) > 0 ? (
                    <AppText variant="caption" color={item.myReaction === 'like' ? theme.colors.commentLike : theme.colors.reelSheetMuted}>
                      {String(item.likesCount ?? 0)}
                    </AppText>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('social.dislike')}
                  accessibilityState={{ checked: item.myReaction === 'dislike' || undefined }}
                  onPress={() => void react(item, item.myReaction === 'dislike' ? null : 'dislike')}
                  style={styles.reaction}
                >
                  <Ionicons
                    name={item.myReaction === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'}
                    size={theme.iconSize.xs}
                    color={item.myReaction === 'dislike' ? theme.colors.commentDislike : theme.colors.reelSheetMuted}
                  />
                </Pressable>
                {!item.parentId ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('social.reply')}
                    onPress={() => { if (!signedIn) { setAuth(true); return; } setReplyTo(item); }}
                    style={styles.replyButton}
                  >
                    <AppText variant="caption" color={theme.colors.reelSheetMuted}>
                      {t('social.reply')}
                    </AppText>
                  </Pressable>
                ) : null}
                <View style={styles.spacer} />
                {/**
                 * « Signaler » de la référence : AUCUNE route serveur n'existe
                 * pour un signalement — le bouton reste VISIBLE mais désactivé
                 * (honnêteté à l'écran, règle du propriétaire) jusqu'à ce qu'un
                 * endpoint le serve.
                 */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('social.report')}
                  accessibilityState={{ disabled: true }}
                  disabled
                  style={styles.reaction}
                >
                  <Ionicons name="flag-outline" size={theme.iconSize.xs} color={theme.colors.reelSheetMuted} />
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </AppSheet>
      {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', marginTop: 8, width: 40, height: 4, borderRadius: RADIUS.full },
  headerRow: { alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 48 },
  spacer: { flex: 1 },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 44, minHeight: 44 },
  iconTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  quote: { alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  error: { paddingHorizontal: 16, paddingBottom: 4 },
  row: { gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, gap: 4 },
  nameRow: { alignItems: 'center', gap: 4 },
  actions: { alignItems: 'center', gap: 16, marginTop: 4 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 32, minHeight: 32 },
  replyButton: { minWidth: 44, minHeight: 32, justifyContent: 'center' },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', paddingVertical: 32 },
  composer: { gap: 6, paddingTop: 8 },
  charCount: { alignSelf: 'flex-start' },
  composerRow: { alignItems: 'flex-end', gap: 8 },
  field: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
