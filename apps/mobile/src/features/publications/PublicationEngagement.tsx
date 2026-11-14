/**
 * Barre d'interaction + feuille de commentaires des blocs Publication —
 * refonte des interactions du 14/11/2026 (approuvée : « موافق نفذ »).
 *
 * Remplace la consigne « page vidée » du 13/11 pour les blocs NON sponsorisés :
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │ (👍❤️) 12                        3 commentaires · 1 partage │ ← résumé (masqué à zéro)
 *  ├──────────────────────────────────────────────────────────────┤
 *  │    👍 J'aime    │   💬 Commenter   │   ↗ Partager            │ ← tiers égaux, 44 dp
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  • J'aime = le bouton officiel Z-Reactions (toucher = 👍, appui long =
 *    sélecteur), contour gris au repos, BLEU une fois posé (libellé compris) ;
 *  • Commenter = feuille claire façon Facebook : en-tête « 👍❤️ N › » + pouce,
 *    « Soyez la première personne à aimer ça », tri « Plus pertinents »,
 *    état vide, champ « Rédigez un commentaire… » dont l'envoi passe au BLEU.
 *    AUCUN autocollant, GIF, rangée d'émojis ni appareil photo (consigne) ;
 *  • Partager = feuille système ; le partage n'est compté qu'une fois confirmé.
 *
 * Serveur : les blocs actifs non sponsorisés sont des cibles sociales à part
 * entière (`publishedSocialTarget`, source `block`) — mêmes tables, mêmes
 * compteurs, mêmes règles d'authentification que les Reels et les stories.
 * Rangée miroir en arabe (`rowDirectionFor`).
 */
import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View, type ScrollView } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import { apiUrl } from '@/api/client';
import { DEFAULT_API_BASE_URL } from '@/api/config';
import { fetchComments, sendInteraction, type SocialComment, type SocialCounts } from '@/api/social';
import { isApiError, userMessage } from '@/api/errors';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { ReactionButton } from '@/design/reactions/ReactionButton';
import type { ContentReaction } from '@/design/reactions/reactionModel';
import { useContentReaction, type ContentReactionState } from '@/design/reactions/useContentReaction';
import { AppSheet } from '@/design/sheet/AppSheet';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { RADIUS } from '@/design/tokens.mobile';
import { relativeTimeLabel } from '@/format/relativeTime';
import { useI18n, useT } from '@/i18n';
import { ReelGlyph } from '@/features/reels/ReelIcons';
import { sortComments, type CommentSort } from '@/features/social/commentSort';
import { useSession } from '@/state/session';
import { getSessionId, useSessionId } from '@/session/session';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PUBLICATION_PALETTE as P, PublicationText } from './publicationDesign';

const COMMENT_LIMIT = 500;
/** Hauteur fixe de la feuille, comme Facebook : elle ne saute pas à chaque message. */
export const PUBLICATION_COMMENTS_HEIGHT = 0.82;
/** Cible tactile de chaque tiers de la barre (consigne : 44 dp). */
export const PUBLICATION_BAR_HEIGHT = 44;
/** Pastille d'une réaction dans le résumé (👍 bleu, ❤️ rouge), chevauchée de 4 dp. */
const SUMMARY_BADGE = 18;

/** Brouillon par compte et par bloc (mémoire de session). */
const drafts = new Map<string, string>();
/** Identifiant anti-doublon d'un envoi, gardé jusqu'au succès serveur. */
const attempts = new Map<string, string>();

export const publicationEngagementKey = (ids: readonly string[]) => ['social', 'engagement', 'publication', ...ids] as const;

/** Libellés du côté droit du résumé : « 3 commentaires · 1 partage », rien à zéro. */
export function publicationSummaryParts(
  counts: Pick<SocialCounts, 'comments' | 'shares'>,
  t: ReturnType<typeof useT>,
): string[] {
  const parts: string[] = [];
  if (counts.comments > 0) parts.push(counts.comments === 1 ? t('publication.bar.commentsOne') : t('publication.bar.comments', { value: String(counts.comments) }));
  if (counts.shares > 0) parts.push(counts.shares === 1 ? t('publication.bar.sharesOne') : t('publication.bar.shares', { value: String(counts.shares) }));
  return parts;
}

/**
 * Quelles pastilles empiler dans le résumé : 👍 s'il existe au moins un
 * J'aime, ❤️ s'il existe au moins un J'adore — en tenant compte de la réaction
 * optimiste du compte (posée/retirée avant la réponse serveur).
 */
export function summaryBadges(
  counts: Pick<SocialCounts, 'likes' | 'loves'>,
  initial: ContentReaction | null,
  current: ContentReaction | null,
): Array<'like' | 'love'> {
  const likes = counts.likes - (initial === 'like' ? 1 : 0) + (current === 'like' ? 1 : 0);
  const loves = counts.loves - (initial === 'love' ? 1 : 0) + (current === 'love' ? 1 : 0);
  const out: Array<'like' | 'love'> = [];
  if (likes > 0) out.push('like');
  if (loves > 0) out.push('love');
  return out;
}

/** Pastilles empilées 👍❤️ (disque coloré, glyphe blanc plein). */
function ReactionBadges({ badges }: { badges: Array<'like' | 'love'> }) {
  const theme = useTheme();
  if (badges.length === 0) return null;
  return (
    <View style={[styles.badges, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
      {badges.map((badge, index) => (
        <View
          key={badge}
          style={[
            styles.badge,
            {
              backgroundColor: badge === 'like' ? theme.colors.reactionLike : theme.colors.reactionLove,
              borderColor: P.paper,
              marginStart: index === 0 ? 0 : -4,
              zIndex: badges.length - index,
            },
          ]}
        >
          <ReelGlyph name={badge === 'like' ? 'like' : 'heart'} size={SUMMARY_BADGE - 8} color={P.paper} filled />
        </View>
      ))}
    </View>
  );
}

/**
 * Partage d'un bloc : titre + adresse du site. Le serveur n'a pas (encore) de
 * page publique par bloc — `/publications?post=` ne sert que les anciennes
 * publications et répondrait 404 : on ne partage jamais un lien mort.
 */
async function shareBlock(blockId: string, title: string) {
  const url = new URL(
    apiUrl('/'),
    typeof location === 'undefined' ? DEFAULT_API_BASE_URL : location.origin,
  ).toString();
  const result = await Share.share({ message: `${title || 'zayrovi team'}\n${url}` });
  if (result.action !== Share.sharedAction) return false;
  await sendInteraction({ type: 'share', targetId: blockId, sessionId: await getSessionId() }).catch(() => null);
  return true;
}

export interface PublicationBarProps {
  blockId: string;
  title: string;
  counts: SocialCounts;
  mine: ContentReaction | null;
  /** Clé de la requête d'engagement à rafraîchir après un partage / commentaire. */
  engagementKey: readonly unknown[];
}

/** La barre Facebook sous un bloc : résumé, filet, J'aime · Commenter · Partager. */
export function PublicationBar({ blockId, title, counts, mine, engagementKey }: PublicationBarProps) {
  const theme = useTheme();
  const t = useT();
  const session = useSession();
  const sessionId = useSessionId();
  const client = useQueryClient();
  const signedIn = session.status === 'signedIn';
  const [auth, setAuth] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const reaction = useContentReaction({
    targetId: blockId,
    initial: mine,
    initialCount: counts.likes + counts.loves,
    signedIn,
    sessionId: sessionId || undefined,
    onAuthRequired: () => setAuth(true),
    onSettled: () => { void client.invalidateQueries({ queryKey: engagementKey }); },
  });
  const badges = summaryBadges(counts, mine, reaction.reaction);
  const parts = publicationSummaryParts(counts, t);
  const showSummary = reaction.count > 0 || parts.length > 0;
  const direction = rowDirectionFor(theme.isRTL);

  return (
    <View testID={`publication-bar-${blockId}`} style={styles.bar}>
      {showSummary ? (
        <View testID={`publication-summary-${blockId}`} style={[styles.summary, { flexDirection: direction }]}>
          {reaction.count > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('publication.bar.reactions', { value: String(reaction.count) })}
              onPress={() => setCommentsOpen(true)}
              style={[styles.summarySide, { flexDirection: direction }]}
            >
              <ReactionBadges badges={badges} />
              <PublicationText variant="caption" color={P.muted}>{String(reaction.count)}</PublicationText>
            </Pressable>
          ) : <View />}
          {parts.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setCommentsOpen(true)} hitSlop={6}>
              <PublicationText variant="caption" color={P.muted}>{parts.join(' · ')}</PublicationText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.rule, { backgroundColor: P.line }]} />
      <View style={[styles.actions, { flexDirection: direction }]}>
        <ReactionButton
          testID={`publication-like-${blockId}`}
          variant="inline"
          surface="card"
          reaction={reaction.reaction}
          count={t('social.like')}
          accessibilityCount={reaction.count > 0 ? String(reaction.count) : undefined}
          tintLabel
          onTap={reaction.tap}
          onPick={reaction.pick}
          guest={!signedIn}
          ink={P.muted}
          size={theme.iconSize.sm}
          style={styles.third}
        />
        <Pressable
          testID={`publication-comment-${blockId}`}
          accessibilityRole="button"
          accessibilityLabel={t('social.comment')}
          onPress={() => setCommentsOpen(true)}
          style={({ pressed }) => [styles.third, styles.action, { flexDirection: direction, opacity: pressed ? theme.opacity.subtle : 1 }]}
        >
          <ReelGlyph name="comment" size={theme.iconSize.sm} color={P.muted} />
          <PublicationText variant="captionStrong" color={P.muted}>{t('social.comment')}</PublicationText>
        </Pressable>
        <Pressable
          testID={`publication-share-${blockId}`}
          accessibilityRole="button"
          accessibilityLabel={t('social.share')}
          onPress={() => {
            void shareBlock(blockId, title).then((shared) => {
              if (shared) void client.invalidateQueries({ queryKey: engagementKey });
            });
          }}
          style={({ pressed }) => [styles.third, styles.action, { flexDirection: direction, opacity: pressed ? theme.opacity.subtle : 1 }]}
        >
          <ReelGlyph name="share" size={theme.iconSize.sm} color={P.muted} mirrored={theme.isRTL} />
          <PublicationText variant="captionStrong" color={P.muted}>{t('social.share')}</PublicationText>
        </Pressable>
      </View>
      {commentsOpen ? (
        <PublicationCommentsSheet
          blockId={blockId}
          reaction={reaction}
          badges={badges}
          engagementKey={engagementKey}
          onClose={() => setCommentsOpen(false)}
        />
      ) : null}
      {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
    </View>
  );
}

/** Feuille de commentaires claire, façon Facebook — sans autocollant, GIF ni émojis. */
export function PublicationCommentsSheet({ blockId, reaction, badges, engagementKey, onClose }: {
  blockId: string;
  reaction: ContentReactionState;
  badges: Array<'like' | 'love'>;
  engagementKey: readonly unknown[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const direction = rowDirectionFor(theme.isRTL);
  const session = useSession();
  const guest = useSessionId();
  const client = useQueryClient();
  const signedIn = session.status === 'signedIn';
  const owner = signedIn ? session.account?.id || 'guest' : 'guest';
  const draftKey = `publication-comment:${owner}:${blockId}`;
  const queryKey = ['social', 'comments', blockId] as const;

  const [sort, setSort] = useState<CommentSort>('popular');
  const [replyTo, setReplyTo] = useState<SocialComment | null>(null);
  const [draft, setDraft] = useState(drafts.get(draftKey) || '');
  const [auth, setAuth] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState<string[]>([]);
  const input = useRef<TextInput>(null);
  const list = useRef<ScrollView>(null);
  const reactionLock = useRef(false);

  const comments = useQuery({ queryKey, queryFn: ({ signal }) => fetchComments(blockId, { signal }) });

  const change = (value: string) => { setDraft(value); drafts.set(draftKey, value); };
  const patch = (id: string, updater: (comment: SocialComment) => SocialComment) => {
    client.setQueryData<SocialComment[]>(queryKey, (prev) => (prev || []).map((row) => (row.id === id ? updater(row) : row)));
  };
  const failure = (cause: unknown) => (isApiError(cause) ? userMessage(cause)[ar ? 'ar' : 'fr'] : t('common.retry'));

  /** J'aime d'un commentaire (table `social_comment_reactions`). */
  const likeComment = async (comment: SocialComment) => {
    if (!signedIn) { setAuth(true); return; }
    if (reactionLock.current) return;
    reactionLock.current = true;
    const wanted = comment.myReaction === 'like' ? null : 'like';
    patch(comment.id, (row) => ({
      ...row,
      myReaction: wanted,
      likesCount: Math.max(0, (row.likesCount ?? 0) + (wanted === 'like' ? 1 : row.myReaction === 'like' ? -1 : 0)),
    }));
    try {
      const result = await sendInteraction({ type: 'reaction', targetId: comment.id, reaction: wanted, sessionId: guest || undefined });
      patch(comment.id, (row) => ({ ...row, myReaction: result.reaction === 'like' ? 'like' : null, likesCount: result.likesCount }));
    } catch (cause) {
      patch(comment.id, () => comment);
      setError(failure(cause));
    } finally {
      reactionLock.current = false;
    }
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!attempts.has(draftKey)) attempts.set(draftKey, `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
      return sendInteraction({
        type: 'comment',
        clientRequestId: attempts.get(draftKey),
        targetId: blockId,
        text: draft,
        parentId: replyTo?.id,
        sessionId: guest || undefined,
      });
    },
    onSuccess: (result) => {
      attempts.delete(draftKey);
      drafts.delete(draftKey);
      setDraft('');
      setError('');
      setReplyTo(null);
      if (result.comment) {
        const id = result.comment.id;
        setMine((prev) => [id, ...prev.filter((row) => row !== id)]);
        client.setQueryData<SocialComment[]>(queryKey, (prev) => [...(prev || []).filter((row) => row.id !== id), result.comment!]);
        requestAnimationFrame(() => list.current?.scrollTo({ y: 0, animated: true }));
      }
      void client.invalidateQueries({ queryKey });
      void client.invalidateQueries({ queryKey: engagementKey });
    },
    onError: (cause) => {
      if (isApiError(cause) && cause.status === 401) setAuth(true);
      setError(failure(cause));
    },
  });

  // Un fil à un niveau, comme Facebook : chaque commentaire, puis ses réponses en retrait.
  const all = comments.data || [];
  const sorted = sortComments(all.filter((row) => !row.parentId), sort);
  const roots = mine.length
    ? [...mine.map((id) => sorted.find((row) => row.id === id)).filter((row): row is SocialComment => !!row), ...sorted.filter((row) => !mine.includes(row.id))]
    : sorted;
  const repliesOf = (id: string) => sortComments(all.filter((row) => row.parentId === id), 'recent').reverse();
  const canSend = draft.trim().length >= 2 && !send.isPending;
  const liked = reaction.reaction !== null;

  const row = (item: SocialComment, reply: boolean) => (
    <View key={item.id} testID={`publication-comment-row-${item.id}`} style={[styles.commentRow, { flexDirection: direction }, reply ? { marginStart: 40 } : null]}>
      <View style={[styles.avatar, reply ? styles.avatarSmall : null, { backgroundColor: P.neutral }]}>
        <PublicationText variant="captionStrong" color={P.ink}>{item.author.slice(0, 1).toUpperCase()}</PublicationText>
      </View>
      <View style={styles.commentBody}>
        <View style={[styles.bubble, { backgroundColor: P.input, alignSelf: ar ? 'flex-end' : 'flex-start' }]}>
          <PublicationText variant="captionStrong" color={P.ink}>{item.author}</PublicationText>
          <PublicationText variant="body" color={P.ink}>{item.text}</PublicationText>
        </View>
        <View style={[styles.commentMeta, { flexDirection: direction }]}>
          <PublicationText variant="caption" color={P.muted}>{relativeTimeLabel(item.createdAt, ar ? 'ar' : 'fr')}</PublicationText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('social.like')}
            accessibilityState={{ checked: item.myReaction === 'like' }}
            onPress={() => void likeComment(item)}
            hitSlop={8}
          >
            <PublicationText variant="captionStrong" color={item.myReaction === 'like' ? theme.colors.reactionLike : P.muted}>
              {t('social.like')}{(item.likesCount ?? 0) > 0 ? ` · ${item.likesCount}` : ''}
            </PublicationText>
          </Pressable>
          {!reply ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('social.reply')}
              onPress={() => { if (!signedIn) { setAuth(true); return; } setReplyTo(item); input.current?.focus(); }}
              hitSlop={8}
            >
              <PublicationText variant="captionStrong" color={P.muted}>{t('social.reply')}</PublicationText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  const header = (
    <View>
      <View style={[styles.grabber, { backgroundColor: P.line }]} />
      <View style={[styles.sheetHeader, { flexDirection: direction }]}>
        {reaction.count > 0 ? (
          <View testID="publication-comments-reactions" style={[styles.summarySide, { flexDirection: direction }]}>
            <ReactionBadges badges={badges} />
            <PublicationText variant="bodyStrong" color={P.ink}>{String(reaction.count)}</PublicationText>
            <ReelGlyph name="back" size={theme.iconSize.xs} color={P.ink} mirrored={!ar} />
          </View>
        ) : (
          <PublicationText testID="publication-comments-first" variant="bodyStrong" color={P.ink} style={styles.flex}>
            {t('publication.comments.firstLike')}
          </PublicationText>
        )}
        {reaction.count > 0 ? <View style={styles.flex} /> : null}
        <Pressable
          testID="publication-comments-like"
          accessibilityRole="button"
          accessibilityLabel={t('social.like')}
          accessibilityState={{ selected: liked }}
          onPress={reaction.tap}
          style={styles.iconTarget}
        >
          <ReelGlyph
            name={reaction.reaction === 'love' ? 'heart' : 'like'}
            size={theme.iconSize.md}
            filled={liked}
            color={reaction.reaction === 'love' ? theme.colors.reactionLove : liked ? theme.colors.reactionLike : P.ink}
          />
        </Pressable>
      </View>
      <View style={[styles.rule, { backgroundColor: P.line }]} />
      <Pressable
        testID="publication-comments-sort"
        accessibilityRole="button"
        accessibilityLabel={t('social.sortMenu')}
        onPress={() => setSort((value) => (value === 'popular' ? 'recent' : 'popular'))}
        style={[styles.sort, { flexDirection: direction, alignSelf: ar ? 'flex-end' : 'flex-start' }]}
      >
        <PublicationText variant="captionStrong" color={P.ink}>
          {t(sort === 'popular' ? 'publication.comments.relevant' : 'publication.comments.recent')}
        </PublicationText>
        <Ionicons name="chevron-down" size={theme.iconSize.xs} color={P.ink} accessibilityElementsHidden />
      </Pressable>
      {error ? (
        <PublicationText accessibilityRole="alert" variant="caption" color={theme.status.danger.fg} style={styles.error}>{error}</PublicationText>
      ) : null}
    </View>
  );

  return (
    <>
      <AppSheet
        open
        presentation="bottom"
        heightRatio={PUBLICATION_COMMENTS_HEIGHT}
        scrollRef={list}
        surfaceColor={P.paper}
        footerSurfaceColor={P.paper}
        footerLineColor={P.line}
        onDismiss={onClose}
        onClosed={onClose}
        header={header}
        footer={
          <View style={styles.composer}>
            {replyTo ? (
              <View style={[styles.replyBar, { flexDirection: direction }]} testID="publication-reply-bar">
                <PublicationText variant="caption" color={P.muted} numberOfLines={1} style={styles.flex}>
                  {t('publication.comments.replyingTo', { name: replyTo.author })}
                </PublicationText>
                <Pressable accessibilityRole="button" accessibilityLabel={t('social.cancelReply')} onPress={() => setReplyTo(null)} style={styles.iconTarget}>
                  <ReelGlyph name="close" size={theme.iconSize.sm} color={P.muted} />
                </Pressable>
              </View>
            ) : null}
            <View style={[styles.composerRow, { flexDirection: direction }]}>
              <TextInput
                ref={input}
                testID="publication-comment-input"
                value={draft}
                onChangeText={change}
                placeholder={t('publication.comments.placeholder')}
                placeholderTextColor={P.muted}
                maxLength={COMMENT_LIMIT}
                multiline
                style={[styles.field, theme.text('label'), { color: P.ink, backgroundColor: P.input, textAlign: ar ? 'right' : 'left' }]}
              />
              <Pressable
                testID="publication-comment-send"
                accessibilityRole="button"
                accessibilityLabel={t('social.send')}
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => send.mutate()}
                style={styles.iconTarget}
              >
                {/* L'envoi passe au BLEU dès qu'il y a quelque chose à envoyer. */}
                <ReelGlyph name="send" mirrored={ar} size={theme.iconSize.md} filled={canSend} color={canSend ? theme.colors.action : P.muted} />
              </Pressable>
            </View>
          </View>
        }
      >
        {comments.isPending ? <LoadingSpinner size="sm" color={P.muted} /> : null}
        {comments.isError ? (
          <Pressable accessibilityRole="button" onPress={() => void comments.refetch()} style={styles.retry}>
            <PublicationText variant="caption" color={P.ink}>{t('social.retry')}</PublicationText>
          </Pressable>
        ) : null}
        {!comments.isPending && !comments.isError && roots.length === 0 ? (
          <View testID="publication-comments-empty" style={styles.empty}>
            <ReelGlyph name="comment" size={theme.iconSize.xl} color={P.muted} />
            <PublicationText variant="bodyStrong" color={P.ink} align="center">{t('publication.comments.emptyTitle')}</PublicationText>
            <PublicationText variant="caption" color={P.muted} align="center">{t('publication.comments.emptyBody')}</PublicationText>
          </View>
        ) : null}
        {roots.map((item) => (
          <View key={item.id} style={styles.thread}>
            {row(item, false)}
            {repliesOf(item.id).map((reply) => row(reply, true))}
          </View>
        ))}
      </AppSheet>
      {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 4 },
  summary: { alignItems: 'center', justifyContent: 'space-between', minHeight: 32, paddingHorizontal: 8 },
  summarySide: { alignItems: 'center', gap: 6 },
  badges: { alignItems: 'center' },
  badge: {
    width: SUMMARY_BADGE,
    height: SUMMARY_BADGE,
    borderRadius: SUMMARY_BADGE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  actions: { alignItems: 'stretch', minHeight: PUBLICATION_BAR_HEIGHT },
  third: { flex: 1, minHeight: PUBLICATION_BAR_HEIGHT, justifyContent: 'center' },
  action: { alignItems: 'center', gap: 6 },
  grabber: { alignSelf: 'center', marginTop: 8, width: 40, height: 4, borderRadius: RADIUS.full },
  sheetHeader: { alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 52 },
  flex: { flex: 1 },
  iconTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sort: { alignItems: 'center', gap: 4, paddingHorizontal: 16, minHeight: 40 },
  error: { paddingHorizontal: 16, paddingBottom: 4 },
  thread: { gap: 12 },
  commentRow: { gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 28, height: 28, borderRadius: 14 },
  commentBody: { flex: 1, gap: 4 },
  bubble: { borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  commentMeta: { alignItems: 'center', gap: 16, paddingHorizontal: 12 },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 40 },
  composer: { gap: 6, paddingTop: 8 },
  replyBar: { alignItems: 'center', gap: 8, minHeight: 36 },
  composerRow: { alignItems: 'flex-end', gap: 8 },
  field: { flex: 1, minHeight: 44, maxHeight: 112, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 12 },
});
