import {
  PUBLICATION_THEME as P,
  RADIUS,
  ICON_SIZE,
} from '@/design/tokens.mobile';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/design/ui';
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
import {
  PUBLICATION_SOCIAL_SURFACE,
  PUBLICATION_LIKE,
  PUBLICATION_DISLIKE,
} from '../../../../../shared/publicationPresentation';

export function PublicationActions({
  post,
  onComments,
  onReaction,
  onPreference,
  presentation = 'feed',
  backdrop = 'dark',
}: {
  presentation?: 'feed' | 'viewer';
  backdrop?: 'dark' | 'light';
  post: FeedPost;
  onComments: () => void;
  onReaction?: (
    id: string,
    liked: boolean,
    likes: number,
    disliked?: boolean
  ) => void;
  onPreference?: (action: string, id: string) => void;
}) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const session = useSession();
  const sessionId = useSessionId();
  const client = useQueryClient();
  const [auth, setAuth] = useState(false);
  const [picker, setPicker] = useState(false);
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(
    post.disliked ? 'dislike' : post.liked ? 'like' : null
  );
  const [likes, setLikes] = useState(post.likes);
  const [saved, setSaved] = useState(!!post.saved);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!lock.current) {
      setReaction(post.disliked ? 'dislike' : post.liked ? 'like' : null);
      setLikes(post.likes);
      setSaved(!!post.saved);
    }
  }, [post.liked, post.disliked, post.likes, post.saved]);
  const account = () => {
    if (session.status === 'signedIn') return true;
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
  const choose = (choice: 'like' | 'dislike') => {
    setPicker(false);
    void perform(async () => {
      const next = reaction === choice ? null : choice;
      const before = { reaction, likes };
      setReaction(next);
      setLikes(
        Math.max(
          0,
          likes + (next === 'like' ? 1 : 0) - (reaction === 'like' ? 1 : 0)
        )
      );
      let result;
      try {
        result = await sendInteraction({
          type: 'reaction',
          targetId: post.id,
          reaction: next,
          sessionId: sessionId || undefined,
        });
      } catch (e) {
        setReaction(before.reaction);
        setLikes(before.likes);
        throw e;
      }
      const current = result.disliked
        ? 'dislike'
        : result.liked
        ? 'like'
        : null;
      setReaction(current);
      setLikes(result.likesCount);
      onReaction?.(
        post.id,
        current === 'like',
        result.likesCount,
        current === 'dislike'
      );
    });
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
  const ink = immersive && backdrop === 'dark' ? P.paper : P.ink;
  const floatingSurface =
    backdrop === 'dark' ? P.viewerDarkSurface : P.viewerLightSurface;
  const button = {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 4,
    ...(immersive
      ? {
          backgroundColor: floatingSurface,
          borderRadius: RADIUS.full,
          paddingHorizontal: 8,
        }
      : {}),
  };
  return (
    <View
      testID={`publication-actions-${presentation}-${post.id}`}
      style={{ gap: 4 }}
    >
      {picker ? (
        <View
          accessibilityLabel={ar ? 'اختيار التفاعل' : 'Choisir une réaction'}
          style={{
            backgroundColor: immersive
              ? floatingSurface
              : PUBLICATION_SOCIAL_SURFACE,
            borderRadius: RADIUS.full,
            padding: 8,
            flexDirection: ar ? 'row-reverse' : 'row',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {(['like', 'dislike'] as const).map((v) => (
            <Pressable
              key={v}
              accessibilityLabel={
                v === 'like'
                  ? ar
                    ? 'أعجبني'
                    : 'J’aime'
                  : ar
                  ? 'لم يعجبني'
                  : 'Je n’aime pas'
              }
              accessibilityRole="button"
              accessibilityState={{ selected: reaction === v }}
              onPress={() => choose(v)}
              style={button}
            >
              <Ionicons
                name={v === 'like' ? 'heart' : 'thumbs-down-outline'}
                size={ICON_SIZE.md}
                color={v === 'like' ? PUBLICATION_LIKE : PUBLICATION_DISLIKE}
              />
              <AppText variant="captionStrong" color={ink}>
                {v === 'like'
                  ? ar
                    ? 'أعجبني'
                    : 'J’aime'
                  : ar
                  ? 'لم يعجبني'
                  : 'Je n’aime pas'}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ar ? 'إغلاق' : 'Fermer'}
            onPress={() => setPicker(false)}
            style={button}
          >
            <Ionicons name="close" size={ICON_SIZE.md} color={ink} />
          </Pressable>
        </View>
      ) : null}
      <View
        style={{
          paddingHorizontal: 0,
          minHeight: 48,
          flexDirection: ar ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <Pressable
          testID={`publication-like-${post.id}`}
          accessibilityRole="button"
          accessibilityLabel={
            reaction === 'dislike'
              ? ar
                ? 'إلغاء عدم الإعجاب'
                : 'Retirer Je n’aime pas'
              : reaction === 'like'
              ? ar
                ? 'إلغاء الإعجاب'
                : 'Ne plus aimer'
              : ar
              ? 'أعجبني'
              : 'J’aime'
          }
          accessibilityHint={
            ar
              ? 'اضغط مطوّلا لاختيار التفاعل'
              : 'Appui long pour choisir une réaction'
          }
          accessibilityState={{ selected: !!reaction, disabled: busy }}
          disabled={busy}
          onLongPress={() => {
            if (account()) setPicker(true);
          }}
          onPress={() => {
            choose(reaction === 'dislike' ? 'dislike' : 'like');
          }}
          style={button}
        >
          <Ionicons
            name={
              reaction === 'dislike'
                ? 'thumbs-down-outline'
                : reaction === 'like'
                ? 'heart'
                : 'heart-outline'
            }
            size={ICON_SIZE.md}
            color={
              reaction === 'like'
                ? PUBLICATION_LIKE
                : reaction === 'dislike'
                ? PUBLICATION_DISLIKE
                : ink
            }
          />
          {likes > 0 ? (
            <AppText variant="caption" color={ink}>
              {likes}
            </AppText>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'خيارات التفاعل' : 'Options de réaction'}
          onPress={() => {
            if (account()) setPicker(!picker);
          }}
          style={button}
        >
          <Ionicons name="chevron-down" size={ICON_SIZE.sm} color={ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'التعليقات' : 'Commentaires'}
          onPress={onComments}
          style={button}
        >
          <Ionicons name="chatbubble-outline" size={ICON_SIZE.md} color={ink} />
          {post.comments > 0 ? (
            <AppText variant="caption" color={ink}>
              {post.comments}
            </AppText>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'مشاركة' : 'Partager'}
          onPress={share}
          style={button}
        >
          <Ionicons name="share-outline" size={ICON_SIZE.md} color={ink} />
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
            size={ICON_SIZE.md}
            color={ink}
          />
        </Pressable>
      </View>
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          variant="caption"
          color={P.reactionError}
        >
          {error}
        </AppText>
      ) : null}
      <PublicationAuthSheet visible={auth} onClose={() => setAuth(false)} />
    </View>
  );
}
