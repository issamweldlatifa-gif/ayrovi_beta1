import { publicationCount } from './publicationFormat';
import { PUBLICATION_PALETTE as P } from './publicationDesign';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { ReactionButton } from '@/design/reactions/ReactionButton';
import { useContentReaction } from '@/design/reactions/useContentReaction';
import type { ContentReaction } from '@/design/reactions/reactionModel';
import { PublicationIcon as Ionicons } from './publicationDesign';
import { useQueryClient } from '@tanstack/react-query';
import {
  PUBLICATION_TYPE,
  PublicationText as AppText,
} from './publicationDesign';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import { apiUrl } from '@/api/client';
import { DEFAULT_API_BASE_URL } from '@/api/config';
import { sendInteraction } from '@/api/social';
import {
  writePublicationPreference,
  type FeedPost,
} from '@/api/publicationFeed';
import { isApiError, userMessage } from '@/api/errors';
import { PublicationAuthSheet } from './PublicationAuthSheet';

export function PublicationActions({
  post,
  onComments,
  onReaction,
  onPreference,
  presentation = 'feed',
  backdrop = 'dark',
  optionsRequest = 0,
  loveRequest = 0,
}: {
  /** Double-tap sur le média (carte) : J'adore, sans retrait. */
  loveRequest?: number;
  presentation?: 'feed' | 'viewer';
  /** Toolbar request to open the official reaction picker, not a second action core. */
  optionsRequest?: number;
  backdrop?: 'dark' | 'light';
  post: FeedPost;
  onComments: () => void;
  onReaction?: (
    id: string,
    liked: boolean,
    likes: number,
    disliked?: boolean,
    loved?: boolean
  ) => void;
  onPreference?: (action: string, id: string) => void;
}) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const session = useSession();
  const sessionId = useSessionId();
  const client = useQueryClient();
  const [auth, setAuth] = useState(false);
  const [saved, setSaved] = useState(!!post.saved);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!lock.current) setSaved(!!post.saved);
  }, [post.saved]);
  const signedIn = session.status === 'signedIn';
  /**
   * Z-Reactions (11/11) : le bouton officiel unique (J'aime · J'adore · Je
   * n'aime pas), le même que sur les Reels. Optimiste, « le dernier geste
   * gagne », retour à l'état confirmé si l'écriture échoue.
   */
  const reactionChanged = useRef(onReaction);
  reactionChanged.current = onReaction;
  const reaction = useContentReaction({
    targetId: post.id,
    initial: post.disliked ? 'dislike' : post.loved ? 'love' : post.liked ? 'like' : null,
    initialCount: post.likes + (post.loves ?? 0),
    signedIn,
    sessionId: sessionId || undefined,
    onAuthRequired: useCallback(() => setAuth(true), []),
    onSettled: useCallback((current: ContentReaction | null, count: number) => {
      reactionChanged.current?.(post.id, current === 'like', count, current === 'dislike', current === 'love');
      void client.invalidateQueries({ queryKey: ['publication-feed'] });
    }, [post.id, client]),
  });
  const lastLove = useRef(loveRequest);
  useEffect(() => {
    if (loveRequest === lastLove.current) return;
    lastLove.current = loveRequest;
    reaction.love();
  }, [loveRequest, reaction]);
  const reactionError = reaction.error
    ? ar ? 'تعذّر الحفظ. أعد المحاولة.' : 'Modification non enregistrée. Réessayez.'
    : '';
  const account = () => {
    if (signedIn) return true;
    setAuth(true);
    return false;
  };
  const perform = async (work: () => Promise<void>) => {
    if (!account() || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
      void client.invalidateQueries({ queryKey: ['publication-feed'] });
    } catch (e) {
      if (isApiError(e) && e.status === 401) setAuth(true);
      else
        setError(
          isApiError(e)
            ? userMessage(e)[ar ? 'ar' : 'fr']
            : ar
            ? 'تعذّر الحفظ. أعد المحاولة.'
            : 'Modification non enregistrée. Réessayez.'
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const share = () =>
    void perform(async () => {
      const url = new URL(
        apiUrl(`/publications?post=${encodeURIComponent(post.id)}`),
        typeof location !== 'undefined' ? location.origin : DEFAULT_API_BASE_URL
      ).toString();
      const result = await Share.share({
        title: post.title,
        message: `${post.title}\n${url}`,
        url,
      });
      if (result.action === Share.sharedAction)
        await sendInteraction({
          type: 'share',
          targetId: post.id,
          sessionId: sessionId || undefined,
        });
    });
  const immersive = presentation === 'viewer';
  const ink = immersive && backdrop === 'dark' ? P.paper : P.icon;
  const button = {
    minHeight: 44,
    minWidth: 44,
    justifyContent: immersive ? ('center' as const) : ('flex-start' as const),
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 4,
    flexShrink: 1,
  };
  return (
    <View
      testID={`publication-actions-${presentation}-${post.id}`}
      style={{ gap: 4 }}
    >
      <View
        testID={`publication-action-row-${presentation}-${post.id}`}
        style={{
          paddingHorizontal: 0,
          minHeight: 44,
          flexDirection: ar ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: immersive ? 'center' : 'flex-start',
          gap: immersive ? 8 : 12,
        }}
      >
        <ReactionButton
          testID={`publication-like-${post.id}`}
          variant="inline"
          surface={immersive && backdrop === 'dark' ? 'media' : 'card'}
          reaction={reaction.reaction}
          count={reaction.count > 0 ? publicationCount(reaction.count, locale) : null}
          accessibilityCount={String(reaction.count)}
          onTap={reaction.tap}
          onPick={reaction.pick}
          guest={!signedIn}
          ink={ink}
          size={PUBLICATION_TYPE.icon}
          openRequest={optionsRequest}
          style={{ justifyContent: immersive ? 'center' : 'flex-start', flexShrink: 1 }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'التعليقات' : 'Commentaires'}
          accessibilityValue={{ text: String(post.comments) }}
          onPress={onComments}
          style={button}
        >
          <Ionicons
            name="chatbubble-outline"
            size={PUBLICATION_TYPE.icon}
            color={ink}
          />
          {post.comments > 0 ? (
            <AppText
              variant="caption"
              numberOfLines={1}
              color={ink}
              style={{
                fontSize: PUBLICATION_TYPE.countSize,
                lineHeight: PUBLICATION_TYPE.countLine,
              }}
            >
              {publicationCount(post.comments, locale)}
            </AppText>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'مشاركة' : 'Partager'}
          onPress={share}
          style={button}
        >
          <Ionicons
            name="share-outline"
            size={PUBLICATION_TYPE.icon}
            color={ink}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            saved
              ? ar
                ? 'إلغاء الحفظ'
                : 'Retirer des enregistrements'
              : ar
              ? 'حفظ المنشور'
              : 'Enregistrer'
          }
          disabled={busy}
          accessibilityState={{ selected: saved, disabled: busy }}
          onPress={() =>
            void perform(async () => {
              await writePublicationPreference(post.id, { saved: !saved });
              setSaved(!saved);
              onPreference?.('save', post.id);
            })
          }
          style={button}
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={PUBLICATION_TYPE.icon}
            color={ink}
          />
        </Pressable>
      </View>
      {error || reactionError ? (
        <AppText
          accessibilityLiveRegion="polite"
          variant="caption"
          color={P.reactionError}
        >
          {error || reactionError}
        </AppText>
      ) : null}
      <PublicationAuthSheet visible={auth} onClose={() => setAuth(false)} />
    </View>
  );
}
