import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { FeedPost } from '@/api/publicationFeed';
import { apiUrl, mediaUrl } from '@/api/client';
import { DEFAULT_API_BASE_URL } from '@/api/config';
import { sendInteraction } from '@/api/social';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { PUBLICATION_THEME as P, MEDIA_RATIO, RADIUS } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';
import { PublicationReactionIcon } from './PublicationReactionIcon';

export function PublicationCard({ post, compact, onComments, onReaction }: { post: FeedPost; compact: boolean; onComments: () => void; onReaction: (id: string, liked: boolean, likes: number) => void }) {
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
  const [message, setMessage] = useState('');
  const [productsOpen, setProductsOpen] = useState(false);
  useEffect(() => { if (!locked.current) { setLiked(post.liked); setLikes(post.likes); } }, [post.liked, post.likes]);
  const like = async () => {
    if (!signedIn || locked.current) return;
    locked.current = true; setBusy(true); setMessage('');
    const before = { liked, likes };
    setLiked(!liked); setLikes(Math.max(0, likes + (liked ? -1 : 1)));
    try {
      const result = await sendInteraction({ type: 'like', targetId: post.id, sessionId: sessionId || undefined });
      setLiked(result.liked ?? !before.liked); setLikes(result.likesCount);
      onReaction(post.id, result.liked ?? !before.liked, result.likesCount);
    } catch { setLiked(before.liked); setLikes(before.likes); setMessage(ar ? 'تعذّر حفظ الإعجاب. أعد المحاولة.' : 'J’aime non enregistré. Réessayez.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const sharedUrl = () => new URL(apiUrl(`/publications?post=${encodeURIComponent(post.id)}`), typeof location !== 'undefined' ? location.origin : DEFAULT_API_BASE_URL).toString();
  const share = async () => {
    // Links resolve to this exact published post via the existing web route and native route.
    const url = sharedUrl();
    try {
      const result = await Share.share({ title: post.title, message: `${post.title}\n${url}`, url });
      if (result.action === Share.sharedAction) await sendInteraction({ type: 'share', targetId: post.id, sessionId: sessionId || undefined });
    } catch { setMessage(ar ? 'المشاركة غير متاحة. انسخ الرابط.' : 'Partage indisponible. Copiez le lien.'); }
  };
  const copy = async () => {
    try { await Clipboard.setStringAsync(sharedUrl()); setMessage(ar ? 'تم نسخ الرابط.' : 'Lien copié.'); }
    catch { setMessage(ar ? 'تعذّر نسخ الرابط.' : 'Copie impossible.'); }
  };
  const text = <View style={styles.copy}>
    <AppText variant="h3" color={P.ink}>{post.title}</AppText>
    {post.subtitle ? <AppText variant="body" color={P.muted} numberOfLines={3}>{post.subtitle}</AppText> : null}
  </View>;
  return <View testID={`publication-${post.id}`} style={styles.card}>
    <View style={[styles.publisher, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      <View style={styles.publisherName}><AppText variant="captionStrong" color={P.ink}>{post.channelName || 'ZAYROVI'}</AppText>
        {post.generated ? <AppText variant="caption" color={P.muted}>{ar ? 'تصميم بصري بالذكاء الاصطناعي' : 'Création visuelle IA'}</AppText> : null}
      </View>
      <Pressable disabled accessibilityRole="button" accessibilityLabel={ar ? 'خيارات إضافية — مرحلة لاحقة' : 'Plus d’options — prochaine phase'} accessibilityState={{ disabled: true }} style={styles.icon}>
        <Ionicons name="ellipsis-horizontal-outline" size={theme.iconSize.sm} color={P.muted} />
      </Pressable>
    </View>
    <View style={compact ? [styles.editorial, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }] : undefined}>
      {post.imageUrl ? <AppImage testID={`publication-media-${post.id}`} uri={mediaUrl(post.imageUrl)} accessibilityLabel={post.title}
        contentFit="contain" style={[styles.media, { borderRadius: theme.radius.card }, compact ? styles.compactMedia : styles.heroMedia]} /> : null}
      {text}
    </View>
    <View style={[styles.actions, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      <Pressable testID={`publication-like-${post.id}`} accessibilityRole="button" accessibilityLabel={liked ? (ar ? 'إلغاء الإعجاب' : 'Ne plus aimer') : (ar ? 'أعجبني' : 'J’aime')}
        accessibilityHint={!signedIn ? (ar ? 'سجّل الدخول للإعجاب' : 'Connectez-vous pour aimer') : undefined}
        accessibilityState={{ selected: liked, disabled: !signedIn || busy }} disabled={!signedIn || busy} onPress={() => void like()} style={styles.action}>
        <PublicationReactionIcon active={liked} color={liked ? P.accent : P.ink} />
        <AppText variant="caption" color={P.ink}>{String(likes)}</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'التعليقات' : 'Commentaires'} onPress={onComments} style={styles.action}>
        <Ionicons name="chatbubble-outline" size={theme.iconSize.sm} color={P.ink} /><AppText variant="caption" color={P.ink}>{String(post.comments)}</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'مشاركة' : 'Partager'} onPress={() => void share()} style={styles.icon}><Ionicons name="share-outline" size={theme.iconSize.sm} color={P.ink} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'نسخ رابط المنشور' : 'Copier le lien'} onPress={() => void copy()} style={styles.icon}><Ionicons name="link-outline" size={theme.iconSize.sm} color={P.ink} /></Pressable>
      <View style={styles.grow} />
      <Pressable disabled accessibilityRole="button" accessibilityLabel={ar ? 'حفظ المنشورات — مرحلة لاحقة' : 'Enregistrer — prochaine phase'} accessibilityState={{ disabled: true }} style={styles.icon}>
        <Ionicons name="bookmark-outline" size={theme.iconSize.sm} color={P.muted} />
      </Pressable>
    </View>
    {!signedIn ? <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={styles.signIn}><AppText variant="caption" color={P.muted}>{ar ? 'سجّل الدخول للإعجاب والتعليق' : 'Connectez-vous pour aimer et commenter'}</AppText></Pressable> : null}
    {post.products.length > 0 ? <Pressable accessibilityRole="button" onPress={() => setProductsOpen(!productsOpen)} style={[styles.productToggle, { borderColor: P.line }]}>
      <AppText variant="label" color={P.ink}>{ar ? 'المنتجات المرتبطة' : 'Voir les produits'} · {post.products.length}</AppText>
      <Ionicons name={productsOpen ? 'chevron-up' : 'chevron-down'} size={theme.iconSize.sm} color={P.ink} />
    </Pressable> : null}
    {productsOpen ? post.products.map(product => <LinkedProductCard key={product.id} product={product} />) : null}
    {message ? <AppText variant="caption" color={P.muted} accessibilityLiveRegion="polite">{message}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { paddingBottom: 24, gap: 8 }, publisher: { alignItems: 'center', gap: 8 }, publisherName: { flex: 1, gap: 2 },
  media: { backgroundColor: P.neutral, overflow: 'hidden' }, heroMedia: { width: '100%', aspectRatio: MEDIA_RATIO.editorialPortrait },
  compactMedia: { width: '52%', aspectRatio: 3 / 4 }, editorial: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  copy: { flex: 1, gap: 4, paddingTop: 8 }, actions: { alignItems: 'center', gap: 8 }, action: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1 }, signIn: { minHeight: 44, justifyContent: 'center' },
  productToggle: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.xl, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
