import { PublicationActions } from './PublicationActions';
import { PublicationDescription } from './PublicationDescription';
import { showsPublicationTitle } from '../../../../../shared/publicationPresentation';
import { Pressable, StyleSheet, View } from 'react-native';
import { NavigationIcon as Ionicons } from '@/design/NavigationIcon';
import { router } from 'expo-router';
import type { FeedPost } from '@/api/publicationFeed';
import { PublicationMedia } from './PublicationMedia';
import { PublicationPublisher } from './PublicationPublisher';
import { AppText } from '@/design/ui';
import {
  PUBLICATION_THEME as P,
  PUBLICATION_SPACING as S,
  ICON_SIZE,
} from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { resolvePublicationTemplate } from '../../../../../shared/publicationLayouts';

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
  const template = resolvePublicationTemplate(
    post.content?.template,
    post.content?.type,
    post.content?.media.length,
    post.category
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
          color={P.discovery}
          style={{ flexShrink: 1 }}
        >
          {post.content.actionLabel}
        </AppText>
        <Ionicons
          name={ar ? 'arrow-back' : 'arrow-forward'}
          size={ICON_SIZE.sm}
          color={P.discovery}
        />
      </Pressable>
    ) : null;
  const hasCopy = !!(
    (campaign && editorialLabel) ||
    (showsPublicationTitle(template) &&
      post.content?.showTitle !== false &&
      post.title) ||
    description
  );
  const text = hasCopy ? (
    <View
      testID={`publication-copy-${post.id}`}
      style={[
        styles.copy,
        split
          ? styles.editorialCopy
          : campaign
          ? [styles.campaignCopy, { marginHorizontal: -mediaInset }]
          : undefined,
      ]}
    >
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
        <PublicationDescription text={description} color={P.ink} />
      ) : null}
    </View>
  ) : null;
  return (
    <View
      testID={`publication-${post.id}`}
      style={[
        styles.card,
        compact ? { paddingBottom: S.rule, marginBottom: S.post } : undefined,
      ]}
    >
      <View
        style={[
          styles.publisher,
          { flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
        ]}
      >
        <View style={styles.publisherName}>
          <PublicationPublisher post={post} />
        </View>
      </View>
      {text}
      <View
        testID={`publication-content-${post.id}`}
        style={
          split
            ? styles.editorial
            : campaign
            ? [styles.campaign, { marginHorizontal: -mediaInset }]
            : styles.content
        }
      >
        <View
          style={
            split
              ? styles.splitMedia
              : [
                  'social_mosaic',
                  'social_pair',
                  'social_strip',
                  'caption_photo',
                ].includes(template)
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
      </View>
      {cta}
      <PublicationActions
        post={post}
        onComments={onComments}
        onReaction={onReaction}
        onPreference={onPreference}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    paddingBottom: S.rule,
    marginBottom: S.post,
    gap: S.section,
    backgroundColor: P.paper,
    borderBottomWidth: 1,
    borderBottomColor: P.line,
  },
  publisher: { alignItems: 'center', gap: 8 },
  publisherName: { flex: 1, gap: 2 },
  content: { gap: S.section },
  editorial: { gap: 0, backgroundColor: P.splitPaper },
  editorialCopy: { padding: S.inset, backgroundColor: P.splitPaper },
  splitMedia: { width: '100%' },
  campaign: { gap: 0 },
  campaignCopy: {
    paddingHorizontal: 24,
    paddingVertical: S.inset,
    backgroundColor: P.campaignPaper,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 0,
    minHeight: 44,
  },
  copy: { gap: S.group },
});
