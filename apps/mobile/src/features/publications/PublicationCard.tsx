import {
  PUBLICATION_PALETTE as P,
  PUBLICATION_TYPE,
} from './publicationDesign';
import { PublicationActions } from './PublicationActions';
import { PublicationDescription } from './PublicationDescription';
import { showsPublicationTitle } from '../../../../../shared/publicationPresentation';
import { Pressable, StyleSheet, View } from 'react-native';
import { PublicationIcon as Ionicons } from './publicationDesign';
import { router } from 'expo-router';
import type { FeedPost } from '@/api/publicationFeed';
import { PublicationMedia } from './PublicationMedia';
import { PublicationPublisher } from './PublicationPublisher';
import { PublicationText as AppText } from './publicationDesign';
import { PUBLICATION_SPACING as S, ICON_SIZE } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import {
  resolvePublicationTemplate,
  SOCIAL_TEMPLATES,
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
  onOptions,
  mediaInset = 12,
}: {
  mediaInset?: number;
  onOptions?: () => void;
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
  const ar = locale === 'ar';
  const template = resolvePublicationTemplate(
    post.content?.template,
    post.content?.type,
    post.content?.media.length,
    post.category
  );
  // Règle de largeur des médias (demande du propriétaire) : les images vivent
  // à la largeur de l'écran.
  // • Tuiles à bords FRANCS (grilles sociales, collection) : PLEINE largeur
  //   écran — les marges négatives annulent exactement la gouttière de liste.
  // • Cadre à coins ARRONDIS (radius 16) : toute la largeur de carte, soit
  //   l'écran moins la fine gouttière — « presque pleine largeur ».
  const split = template === 'split';
  const tiledMedia =
    (SOCIAL_TEMPLATES as readonly string[]).includes(template) ||
    (post.content?.type === 'collection' &&
      (post.content?.media.length ?? 0) > 1);
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
          ? styles.campaignCopy
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
        testID={`publication-editorial-header-${post.id}`}
        style={styles.headerBlock}
      >
        <PublicationPublisher post={post} onOptions={onOptions}>
          {text}
        </PublicationPublisher>
      </View>
      <View
        testID={`publication-content-${post.id}`}
        style={
          tiledMedia
            ? { marginHorizontal: -mediaInset }
            : split
            ? styles.editorial
            : styles.content
        }
      >
        <View style={split ? styles.splitMedia : undefined}>
          <PublicationMedia
            post={post}
            active={active}
            onOpen={(index) => (onMediaOpen ? onMediaOpen(index) : onOpen?.())}
            thumbnails={false}
          />
        </View>
      </View>
      <View>{cta}</View>
      <View>
        <PublicationActions
          post={post}
          onComments={onComments}
          onReaction={onReaction}
          onPreference={onPreference}
        />
      </View>
      <View
        pointerEvents="none"
        testID={`publication-separator-${post.id}`}
        style={{
          position: 'absolute',
          bottom: 0,
          left: -mediaInset,
          right: -mediaInset,
          height: 1,
          backgroundColor: P.line,
        }}
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
  },
  headerBlock: { gap: S.group, minHeight: PUBLICATION_TYPE.column },
  content: { gap: S.section },
  editorial: { gap: 0, backgroundColor: P.splitPaper },
  editorialCopy: { backgroundColor: P.splitPaper },
  splitMedia: { width: '100%' },
  campaignCopy: {
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
