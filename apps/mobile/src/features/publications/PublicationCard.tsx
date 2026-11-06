import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { followPublisher, writePublicationPreference, type FeedPost } from '@/api/publicationFeed';
import { PublicationMedia } from './PublicationMedia';
import { PublicationPublisher } from './PublicationPublisher';
import { apiUrl } from '@/api/client';
import { DEFAULT_API_BASE_URL } from '@/api/config';
import { sendInteraction } from '@/api/social';
import { AppText } from '@/design/ui';
import { PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';
import { PublicationReactionIcon } from './PublicationReactionIcon';

export function PublicationCard({ post, compact, onComments, onReaction, active = false, onOpen, onPreference, onProductOpen }: { onProductOpen?: (id: string) => void; active?: boolean; onOpen?: () => void; onPreference?: (action: string, id: string) => void; post: FeedPost; compact: boolean; onComments: () => void; onReaction: (id: string, liked: boolean, likes: number) => void }) {
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
  const [productsOpen, setProductsOpen] = useState(post.content?.type === 'product' || post.content?.type === 'collection');
  const [expanded, setExpanded] = useState(false); const [options, setOptions] = useState(false);
  const [saved, setSaved] = useState(!!post.saved); const [following, setFollowing] = useState(!!post.following); const [preferenceBusy, setPreferenceBusy] = useState(false);
  useEffect(() => { setSaved(!!post.saved); setFollowing(!!post.following); }, [post.saved, post.following]);
  const preference = async (action: 'save' | 'follow' | 'hidden' | 'not_interested' | 'undo') => {
    if (!signedIn) { router.push('/sign-in'); return; }
    if (preferenceBusy) return; setPreferenceBusy(true);
    try {
      if (action === 'follow') { await followPublisher(post.channelId, !following); setFollowing(!following); }
      else if (action === 'save') { await writePublicationPreference(post.id, { saved: !saved }); setSaved(!saved); }
      else { await writePublicationPreference(post.id, { feedback: action === 'undo' ? '' : action }); setMessage(action === 'undo' ? '' : (ar ? 'تم إخفاء المنشور' : 'Publication masquée')); }
      onPreference?.(action, post.id);
    } catch { setMessage(ar ? 'تعذّر الحفظ. أعد المحاولة.' : 'Modification non enregistrée. Réessayez.'); }
    finally { setPreferenceBusy(false); }
  };
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
  const description = post.content?.description || post.subtitle;
  const text = <View style={styles.copy}>
    <Pressable accessibilityRole={onOpen ? "button" : undefined} onPress={onOpen}><AppText variant="h3" color={P.ink}>{post.title}</AppText></Pressable>
    {description ? <><AppText variant="body" color={P.muted} numberOfLines={expanded ? undefined : 3}>{description}</AppText>{description.length > 140 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.signIn}><AppText variant="captionStrong" color={P.ink}>{expanded ? (ar ? 'عرض أقل' : 'Voir moins') : (ar ? 'عرض المزيد' : 'Voir plus')}</AppText></Pressable> : null}</> : null}
  </View>;
  return <View testID={`publication-${post.id}`} style={styles.card}>
    <View style={[styles.publisher, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      <View style={styles.publisherName}><PublicationPublisher post={post} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'خيارات المنشور' : 'Options de la publication'} accessibilityState={{ expanded: options }} onPress={() => setOptions(!options)} style={styles.icon}><Ionicons name="ellipsis-horizontal-outline" size={theme.iconSize.md} color={P.ink} /></Pressable>
    </View>
    {options ? <View style={styles.copy}>{(['follow', 'hidden', 'not_interested', 'undo'] as const).map(action => <Pressable key={action} disabled={preferenceBusy} accessibilityRole="button" onPress={() => void preference(action)} style={styles.signIn}><AppText color={P.ink}>{action === 'follow' ? (following ? (ar ? 'إلغاء المتابعة' : 'Ne plus suivre') : (ar ? 'متابعة الناشر' : 'Suivre cet éditeur')) : action === 'hidden' ? (ar ? 'إخفاء' : 'Masquer') : action === 'not_interested' ? (ar ? 'غير مهتم' : 'Pas intéressé') : (ar ? 'إلغاء الإخفاء' : 'Annuler le masquage')}</AppText></Pressable>)}</View> : null}
    {post.content?.descriptionPosition === 'above' ? text : null}
    <View style={compact || post.content?.type === 'editorial' ? styles.editorial : undefined}>
      <View style={compact || post.content?.type === 'editorial' ? { width: '48%' } : undefined}><PublicationMedia post={post} active={active} onOpen={onOpen} /></View>
      {post.content?.descriptionPosition !== 'above' ? text : null}
    </View>
    <View style={[styles.actions, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      <Pressable testID={`publication-like-${post.id}`} accessibilityRole="button" accessibilityLabel={liked ? (ar ? 'إلغاء الإعجاب' : 'Ne plus aimer') : (ar ? 'أعجبني' : 'J’aime')}
        accessibilityHint={!signedIn ? (ar ? 'سجّل الدخول للإعجاب' : 'Connectez-vous pour aimer') : undefined}
        accessibilityState={{ selected: liked, disabled: !signedIn || busy }} disabled={!signedIn || busy} onPress={() => void like()} style={styles.action}>
        <PublicationReactionIcon active={liked} color={liked ? P.accent : P.ink} />
        <AppText variant="caption" color={P.ink}>{String(likes)}</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'التعليقات' : 'Commentaires'} onPress={onComments} style={styles.action}>
        <Ionicons name="chatbubble-outline" size={theme.iconSize.md} color={P.ink} /><AppText variant="caption" color={P.ink}>{String(post.comments)}</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'مشاركة' : 'Partager'} onPress={() => void share()} style={styles.icon}><Ionicons name="share-outline" size={theme.iconSize.md} color={P.ink} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'نسخ رابط المنشور' : 'Copier le lien'} onPress={() => void copy()} style={styles.icon}><Ionicons name="link-outline" size={theme.iconSize.md} color={P.ink} /></Pressable>
      <View style={styles.grow} />
      <Pressable accessibilityRole="button" disabled={preferenceBusy} accessibilityLabel={saved ? (ar ? 'إلغاء الحفظ' : 'Retirer des enregistrements') : (ar ? 'حفظ المنشور' : 'Enregistrer')} accessibilityState={{ selected: saved, disabled: preferenceBusy }} onPress={() => void preference('save')} style={styles.icon}>
        <Ionicons name="bookmark-outline" size={theme.iconSize.md} color={saved ? P.accent : P.ink} />
      </Pressable>
    </View>
    {(post.views || post.shares) ? <AppText variant="caption" color={P.muted}>{post.views ? `${post.views} ${ar ? 'مشاهدة فريدة' : 'vues uniques'}` : ''}{post.views && post.shares ? ' · ' : ''}{post.shares ? `${post.shares} ${ar ? 'مشاركة فريدة' : 'partages uniques'}` : ''}</AppText> : null}
    {!signedIn ? <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={styles.signIn}><AppText variant="caption" color={P.muted}>{ar ? 'سجّل الدخول للإعجاب والتعليق' : 'Connectez-vous pour aimer et commenter'}</AppText></Pressable> : null}
    {post.products.length > 0 ? <Pressable accessibilityRole="button" onPress={() => setProductsOpen(!productsOpen)} style={[styles.productToggle, { borderColor: P.line }]}>
      <AppText variant="label" color={P.ink}>{ar ? 'المنتجات المرتبطة' : 'Voir les produits'} · {post.products.length}</AppText>
      <Ionicons name={productsOpen ? 'chevron-up' : 'chevron-down'} size={theme.iconSize.md} color={P.ink} />
    </Pressable> : null}
    {productsOpen ? post.products.map(product => <LinkedProductCard key={product.id} product={product} onOpen={onProductOpen ? () => onProductOpen(product.id) : undefined} />) : null}
    {message ? <AppText variant="caption" color={P.muted} accessibilityLiveRegion="polite">{message}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { paddingBottom: 24, gap: 8 }, publisher: { alignItems: 'center', gap: 8 }, publisherName: { flex: 1, gap: 2 },
  editorial: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  copy: { flex: 1, gap: 4, paddingTop: 8 }, actions: { alignItems: 'center', gap: 8 }, action: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1 }, signIn: { minHeight: 44, justifyContent: 'center' },
  productToggle: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.xl, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
