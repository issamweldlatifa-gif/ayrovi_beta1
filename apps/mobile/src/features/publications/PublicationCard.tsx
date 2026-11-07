import { PublicationActions } from './PublicationActions';
import { PublicationDescription } from './PublicationDescription';
import { showsPublicationTitle } from '../../../../../shared/publicationPresentation';
import { isApiError, userMessage } from '@/api/errors';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NavigationIcon as Ionicons } from '@/design/NavigationIcon';
import { router } from 'expo-router';
import {
  followPublisher,
  writePublicationPreference,
  type FeedPost,
} from '@/api/publicationFeed';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PublicationMedia } from './PublicationMedia';
import { PublicationPublisher } from './PublicationPublisher';
import { AppText } from '@/design/ui';
import { PUBLICATION_THEME as P, ICON_SIZE } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import {
  CAPTION_FIRST_TEMPLATES,
  resolvePublicationTemplate,
} from '../../../../../shared/publicationLayouts';

export function PublicationCard({
  post,
  compact,
  onComments,
  onReaction,
  active = false,
  onOpen,
  onPreference,
  onProductOpen,
  onMediaOpen,
  mediaInset = 12,
}: {
  mediaInset?: number;
  onMediaOpen?: (index: number) => void;
  onProductOpen?: (id: string) => void;
  active?: boolean;
  onOpen?: () => void;
  onPreference?: (action: string, id: string) => void;
  post: FeedPost;
  compact: boolean;
  onComments: () => void;
  onReaction: (
    id: string,
    liked: boolean,
    likes: number,
    disliked?: boolean
  ) => void;
}) {
  const { locale } = useI18n();
  const theme = useTheme();
  const ar = locale === 'ar';
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const [authOpen, setAuthOpen] = useState(false);
  const requireAccount = () => {
    if (signedIn) return false;
    setAuthOpen(true);
    return true;
  };
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(!!post.saved);
  const [following, setFollowing] = useState(!!post.following);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  useEffect(() => {
    setSaved(!!post.saved);
    setFollowing(!!post.following);
  }, [post.saved, post.following]);
  const preference = async (
    action: 'save' | 'follow' | 'hidden' | 'not_interested' | 'undo'
  ) => {
    if (requireAccount()) return;
    if (preferenceBusy) return;
    setPreferenceBusy(true);
    setMessage('');
    try {
      if (action === 'follow') {
        await followPublisher(post.channelId, !following);
        setFollowing(!following);
      } else if (action === 'save') {
        await writePublicationPreference(post.id, { saved: !saved });
        setSaved(!saved);
      } else {
        await writePublicationPreference(post.id, {
          feedback: action === 'undo' ? '' : action,
        });
        setMessage(
          action === 'undo'
            ? ''
            : ar
            ? 'تم إخفاء المنشور'
            : 'Publication masquée'
        );
      }
      onPreference?.(action, post.id);
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        setAuthOpen(true);
        return;
      }
      setMessage(
        isApiError(error)
          ? userMessage(error)[ar ? 'ar' : 'fr']
          : ar
          ? 'تعذّر الحفظ. أعد المحاولة.'
          : 'Modification non enregistrée. Réessayez.'
      );
    } finally {
      setPreferenceBusy(false);
    }
  };
  const template = resolvePublicationTemplate(
    post.content?.template,
    post.content?.type,
    post.content?.media.length,
    post.category
  );
  const captionFirst = (CAPTION_FIRST_TEMPLATES as readonly string[]).includes(
    template
  );
  const split = template === 'split';
  const campaign = template === 'campaign';
  const action = () => {
    if (post.content?.actionTarget === 'products') {
      const id = post.products[0]?.id;
      if (id) {
        if (onProductOpen) onProductOpen(id);
        else router.push({ pathname: '/product/[id]', params: { id } });
      }
    } else onOpen?.();
  };
  const canAct =
    post.content?.actionTarget === 'products'
      ? !!post.products.length
      : !!onOpen;
  const description = post.content?.description || post.subtitle;
  const editorialLabel = (
    {
      beauty: ar ? 'جمال' : 'BEAUTÉ',
      fashion: ar ? 'أناقة' : 'STYLE',
      style: ar ? 'أناقة' : 'STYLE',
      home: ar ? 'المنزل' : 'MAISON',
    } as Record<string, string>
  )[post.category];
  const cta =
    post.content?.actionLabel && canAct ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={post.content.actionLabel}
        onPress={action}
        style={styles.cta}
      >
        <AppText
          variant={campaign ? 'bodyStrong' : 'captionStrong'}
          color={P.accent}
          style={{ flexShrink: 1 }}
        >
          {post.content.actionLabel}
        </AppText>
        <Ionicons
          name={ar ? 'arrow-back' : 'arrow-forward'}
          size={ICON_SIZE.sm}
          color={P.accent}
        />
      </Pressable>
    ) : null;
  const text = (
    <View style={[styles.copy, split ? styles.editorialCopy : undefined]}>
      {campaign && editorialLabel ? (
        <AppText variant="overline" color={P.ink}>
          {editorialLabel}
        </AppText>
      ) : null}
      {showsPublicationTitle(template) &&
      post.content?.showTitle !== false &&
      post.title ? (
        <Pressable
          accessibilityRole={onOpen ? 'button' : undefined}
          onPress={onOpen}
        >
          <AppText
            testID={`publication-headline-${post.id}`}
            variant={
              campaign
                ? 'h1'
                : split
                ? 'h2'
                : template === 'carousel'
                ? 'h3'
                : 'bodyStrong'
            }
            color={P.ink}
          >
            {post.title}
          </AppText>
        </Pressable>
      ) : null}
      {description ? (
        <PublicationDescription
          text={description}
          color={captionFirst ? P.ink : P.muted}
        />
      ) : null}
      {!captionFirst ? cta : null}
    </View>
  );
  return (
    <View
      testID={`publication-${post.id}`}
      style={[
        styles.card,
        compact ? { paddingBottom: 12, marginBottom: 12 } : undefined,
      ]}
    >
      <View
        style={[
          styles.publisher,
          { flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
        ]}
      >
        <View style={styles.publisherName}>
          <PublicationPublisher
            post={post}
            onFollow={() => void preference('follow')}
            following={following}
            busy={preferenceBusy}
          />
        </View>
      </View>
      {!split &&
      !campaign &&
      (captionFirst || post.content?.descriptionPosition === 'above')
        ? text
        : null}
      <View
        style={
          split
            ? styles.editorial
            : campaign
            ? [styles.campaign, { marginHorizontal: -mediaInset }]
            : undefined
        }
      >
        <View
          style={
            split
              ? styles.splitMedia
              : captionFirst && template !== 'shoppable'
              ? { marginHorizontal: -mediaInset }
              : undefined
          }
        >
          <PublicationMedia
            post={post}
            active={active}
            onOpen={(index) => (onMediaOpen ? onMediaOpen(index) : onOpen?.())}
            thumbnails={false}
          />
        </View>
        {campaign ? (
          <View style={styles.campaignCopy}>{text}</View>
        ) : split ||
          (!captionFirst && post.content?.descriptionPosition !== 'above') ? (
          text
        ) : null}
      </View>
      {captionFirst ? cta : null}
      <PublicationActions
        post={post}
        onComments={onComments}
        onReaction={onReaction}
        onPreference={onPreference}
      />
      <PublicationAuthSheet
        visible={authOpen}
        onClose={() => setAuthOpen(false)}
      />
      {message ? (
        <AppText
          variant="caption"
          color={P.muted}
          accessibilityLiveRegion="polite"
        >
          {message}
        </AppText>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    paddingBottom: 20,
    marginBottom: 20,
    gap: 8,
    backgroundColor: P.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.line,
  },
  publisher: { alignItems: 'center', gap: 8 },
  publisherName: { flex: 1, gap: 2 },
  editorial: { gap: 8, backgroundColor: P.splitPaper },
  editorialCopy: { padding: 12 },
  splitMedia: { width: '100%' },
  campaign: { gap: 0 },
  campaignCopy: { padding: 24, backgroundColor: P.campaignPaper },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 0,
    minHeight: 44,
    marginTop: 4,
  },
  copy: { gap: 4, paddingTop: 4 },
  actions: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 0,
    minHeight: 44,
  },
  action: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  signIn: { minHeight: 44, justifyContent: 'center' },
});
