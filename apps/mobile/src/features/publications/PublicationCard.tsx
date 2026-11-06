import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  followPublisher,
  writePublicationPreference,
  type FeedPost,
} from '@/api/publicationFeed';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PublicationMedia } from './PublicationMedia';
import { PublicationPublisher } from './PublicationPublisher';
import { apiUrl } from '@/api/client';
import { DEFAULT_API_BASE_URL } from '@/api/config';
import { sendInteraction } from '@/api/social';
import { AppText } from '@/design/ui';
import {
  PUBLICATION_THEME as P,
  PUBLICATION_METRICS as PM,
  RADIUS,
  ICON_SIZE,
} from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import type { ProductFavorites } from '@/features/reels/useProductFavorites';
import {
  CAPTION_FIRST_TEMPLATES,
  resolvePublicationTemplate,
} from '../../../../../shared/publicationLayouts';
import { PublicationProductLink } from './PublicationProductLink';

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
  productFavorites,
  mediaInset = 12,
}: {
  mediaInset?: number;
  productFavorites?: ProductFavorites;
  onMediaOpen?: (index: number) => void;
  onProductOpen?: (id: string) => void;
  active?: boolean;
  onOpen?: () => void;
  onPreference?: (action: string, id: string) => void;
  post: FeedPost;
  compact: boolean;
  onComments: () => void;
  onReaction: (id: string, liked: boolean, likes: number) => void;
}) {
  const { locale } = useI18n();
  const theme = useTheme();
  const ar = locale === 'ar';
  const session = useSession();
  const sessionId = useSessionId();
  const signedIn = session.status === 'signedIn';
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [authOpen, setAuthOpen] = useState(false);
  const requireAccount = () => {
    if (signedIn) return false;
    setAuthOpen(true);
    return true;
  };
  const [message, setMessage] = useState('');
  const [productsOpen, setProductsOpen] = useState(
    post.content?.type === 'product' ||
      post.content?.type === 'collection' ||
      ['carousel', 'shoppable'].includes(
        resolvePublicationTemplate(
          post.content?.template,
          post.content?.type,
          post.content?.media.length,
          post.category
        )
      )
  );
  const [expanded, setExpanded] = useState(false);
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
    } catch {
      setMessage(
        ar
          ? 'تعذّر الحفظ. أعد المحاولة.'
          : 'Modification non enregistrée. Réessayez.'
      );
    } finally {
      setPreferenceBusy(false);
    }
  };
  useEffect(() => {
    if (!locked.current) {
      setLiked(post.liked);
      setLikes(post.likes);
    }
  }, [post.liked, post.likes]);
  const like = async () => {
    if (requireAccount() || locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    const before = { liked, likes };
    setLiked(!liked);
    setLikes(Math.max(0, likes + (liked ? -1 : 1)));
    try {
      const result = await sendInteraction({
        type: 'like',
        targetId: post.id,
        sessionId: sessionId || undefined,
      });
      setLiked(result.liked ?? !before.liked);
      setLikes(result.likesCount);
      onReaction(post.id, result.liked ?? !before.liked, result.likesCount);
    } catch {
      setLiked(before.liked);
      setLikes(before.likes);
      setMessage(
        ar
          ? 'تعذّر حفظ الإعجاب. أعد المحاولة.'
          : 'J’aime non enregistré. Réessayez.'
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const sharedUrl = () =>
    new URL(
      apiUrl(`/publications?post=${encodeURIComponent(post.id)}`),
      typeof location !== 'undefined' ? location.origin : DEFAULT_API_BASE_URL
    ).toString();
  const share = async () => {
    if (requireAccount()) return;
    // Links resolve to this exact published post via the existing web route and native route.
    const url = sharedUrl();
    try {
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
    } catch {
      setMessage(
        ar
          ? 'المشاركة غير متاحة. انسخ الرابط.'
          : 'Partage indisponible. Copiez le lien.'
      );
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
  const linkedRows = post.products.map((product) => (
    <PublicationProductLink
      key={product.id}
      product={product}
      outlined={template === 'carousel'}
      onOpen={onProductOpen ? () => onProductOpen(product.id) : undefined}
    />
  ));
  const text = (
    <View style={[styles.copy, split ? styles.editorialCopy : undefined]}>
      {campaign && editorialLabel ? (
        <AppText variant="overline" color={P.ink}>
          {editorialLabel}
        </AppText>
      ) : null}
      {!captionFirst || !description ? (
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
        <>
          <AppText
            variant="body"
            color={captionFirst ? P.ink : P.muted}
            numberOfLines={
              expanded || description.length <= 140 ? undefined : 3
            }
          >
            {description}
          </AppText>
          {description.length > 140 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded(!expanded)}
              style={styles.signIn}
            >
              <AppText variant="captionStrong" color={P.ink}>
                {expanded
                  ? ar
                    ? 'عرض أقل'
                    : 'Voir moins'
                  : ar
                  ? 'عرض المزيد'
                  : 'Voir plus'}
              </AppText>
            </Pressable>
          ) : null}
        </>
      ) : null}
      {post.content?.actionLabel && canAct ? (
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
            name={campaign ? 'arrow-forward' : 'chevron-forward'}
            size={campaign ? ICON_SIZE.md : ICON_SIZE.sm}
            color={P.accent}
          />
        </Pressable>
      ) : null}
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
            thumbnails={template === 'carousel'}
          />
        </View>
        {campaign ? (
          <View style={styles.campaignCopy}>{text}</View>
        ) : split ||
          (!captionFirst && post.content?.descriptionPosition !== 'above') ? (
          text
        ) : null}
      </View>
      {template === 'shoppable' ? (
        <View
          testID={`publication-product-grid-${post.id}`}
          style={{
            flexDirection: theme.isRTL ? 'row-reverse' : 'row',
            flexWrap: 'wrap',
            marginHorizontal: -(PM.productGap / 2),
            paddingTop: 12,
          }}
        >
          {post.products.map((product) => (
            <View
              key={product.id}
              style={{ width: '50%', paddingHorizontal: PM.productGap / 2 }}
            >
              <PublicationProductLink
                product={product}
                tile
                favorite={productFavorites?.isFavorite(product.id)}
                onFavorite={
                  !signedIn || productFavorites
                    ? () => {
                        if (!requireAccount())
                          productFavorites?.toggle(product.id);
                      }
                    : undefined
                }
                onOpen={
                  onProductOpen ? () => onProductOpen(product.id) : undefined
                }
              />
            </View>
          ))}
        </View>
      ) : null}
      {template === 'carousel' && productsOpen ? (
        <View testID={`publication-carousel-products-${post.id}`}>
          {linkedRows}
        </View>
      ) : null}
      <View
        style={[
          styles.actions,
          { flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
        ]}
      >
        <Pressable
          testID={`publication-like-${post.id}`}
          accessibilityRole="button"
          accessibilityLabel={
            liked
              ? ar
                ? 'إلغاء الإعجاب'
                : 'Ne plus aimer'
              : ar
              ? 'أعجبني'
              : 'J’aime'
          }
          accessibilityHint={
            !signedIn
              ? ar
                ? 'سجّل الدخول للإعجاب'
                : 'Connectez-vous pour aimer'
              : undefined
          }
          accessibilityState={{ selected: liked, disabled: busy }}
          disabled={busy}
          onPress={() => void like()}
          style={styles.action}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={PM.icon}
            color={liked ? P.accent : P.ink}
          />
          <AppText variant="caption" color={P.ink}>
            {String(likes)}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'التعليقات' : 'Commentaires'}
          onPress={() => {
            if (!requireAccount()) onComments();
          }}
          style={styles.action}
        >
          <Ionicons name="chatbubble-outline" size={PM.icon} color={P.ink} />
          <AppText variant="caption" color={P.ink}>
            {String(post.comments)}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'مشاركة' : 'Partager'}
          onPress={() => void share()}
          style={styles.icon}
        >
          <Ionicons name="share-outline" size={PM.icon} color={P.ink} />
        </Pressable>
        <View style={styles.grow} />
        <Pressable
          accessibilityRole="button"
          disabled={preferenceBusy}
          accessibilityLabel={
            saved
              ? ar
                ? 'إلغاء الحفظ'
                : 'Retirer des enregistrements'
              : ar
              ? 'حفظ المنشور'
              : 'Enregistrer'
          }
          accessibilityState={{ selected: saved, disabled: preferenceBusy }}
          onPress={() => void preference('save')}
          style={styles.icon}
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={PM.icon}
            color={saved ? P.accent : P.ink}
          />
        </Pressable>
      </View>
      {post.products.length > 0 &&
      template !== 'carousel' &&
      template !== 'shoppable' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setProductsOpen(!productsOpen)}
          style={[styles.productToggle, { borderColor: P.line }]}
        >
          <AppText variant="label" color={P.ink}>
            {ar ? 'المنتجات المرتبطة' : 'Voir les produits'} ·{' '}
            {post.products.length}
          </AppText>
          <Ionicons
            name={productsOpen ? 'chevron-up' : 'chevron-down'}
            size={theme.iconSize.md}
            color={P.ink}
          />
        </Pressable>
      ) : null}
      {template !== 'shoppable' && template !== 'carousel' && productsOpen
        ? linkedRows
        : null}
      <PublicationAuthSheet
        visible={authOpen && !signedIn}
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
  productToggle: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.xl,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
