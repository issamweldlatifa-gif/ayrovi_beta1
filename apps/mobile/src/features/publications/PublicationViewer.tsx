import { router } from 'expo-router';
import { PublicationMedia } from './PublicationMedia';
import { PublicationPublisher } from './PublicationPublisher';
import { PublicationProductPreview } from './PublicationProductPreview';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchFeedPage, type FeedPost } from '@/api/publicationFeed';
import { AppText } from '@/design/ui';
import { VIDEO_BACKDROP, ICON_SIZE, PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { Comments } from '@/features/social/Comments';
import { PublicationCard } from './PublicationCard';

/** Full-screen detail of the existing Publication, not a second social entry point. */
export function PublicationViewer({ post: initial, owner, onClose, onPreference }: { post: FeedPost; owner: string; onClose: () => void; onPreference: (action: string, id: string) => void }) {
  const [gallery, setGallery] = useState(false);
  const [productId, setProductId] = useState('');
  const [post, setPost] = useState(initial); const [comments, setComments] = useState(false);
  const insets = useSafeAreaInsets(); const { locale } = useI18n();
  const related = useQuery({ queryKey: ['publication-related', owner, post.id, post.category], queryFn: ({ signal }) => fetchFeedPage({ category: post.category, q: '', post: '', cursor: null }, { signal }) });
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={locale === 'ar' ? 'إغلاق المنشور' : 'Fermer la publication'} onPress={onClose} style={styles.button}><Ionicons name="close" size={ICON_SIZE.md} color={P.ink} /></Pressable><AppText variant="label" color={P.ink}>Publication</AppText></View>
      <ScrollView key={post.id} contentContainerStyle={styles.content}>
        {productId ? <PublicationProductPreview key={productId} id={productId} onBack={() => setProductId('')} onContinue={() => { onClose(); router.push({ pathname: '/product/[id]', params: { id: productId } }); }} /> : <PublicationCard key={post.id} onOpen={() => setGallery(true)} onProductOpen={setProductId} post={post} active={!gallery} compact={false} onComments={() => setComments(!comments)} onPreference={onPreference} onReaction={(_, liked, likes) => setPost(old => ({ ...old, liked, likes }))} />}
        {comments && !productId ? <Comments targetId={post.id} /> : null}
        {(related.data?.items ?? []).filter(item => item.id !== post.id).length ? <AppText variant="h3" color={P.ink}>{locale === 'ar' ? 'من نفس الفئة' : 'Dans la même catégorie'}</AppText> : null}
        {(related.data?.items ?? []).filter(item => item.id !== post.id).slice(0, 4).map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => { setPost(item); setComments(false); setProductId(''); }} style={styles.related}><AppText color={P.ink}>{item.title}</AppText><Ionicons name="chevron-forward" size={ICON_SIZE.md} color={P.ink} /></Pressable>)}
      </ScrollView>
      <Modal visible={gallery} animationType="fade" onRequestClose={() => setGallery(false)}>
        <View style={[styles.gallery, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={locale === 'ar' ? 'إغلاق الوسائط' : 'Fermer le média'} style={styles.button} onPress={() => setGallery(false)}><Ionicons name="close" size={ICON_SIZE.md} color={P.paper} /></Pressable><PublicationPublisher post={post} dark /></View>
          <PublicationMedia key={post.id} post={post} active={gallery} immersive />
          {post.products.length ? <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setGallery(false); setProductId(post.products[0].id); }}><AppText color={P.paper}>{locale === 'ar' ? 'عرض المنتجات' : 'Voir les produits'} · {post.products.length}</AppText></Pressable> : null}
        </View>
      </Modal>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ gallery: { flex: 1, backgroundColor: VIDEO_BACKDROP }, screen: { flex: 1, backgroundColor: P.paper }, header: { flexDirection: 'row', alignItems: 'center', borderBottomColor: P.line, borderBottomWidth: StyleSheet.hairlineWidth }, button: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, content: { padding: 12, width: '100%', maxWidth: 720, alignSelf: 'center' }, related: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 8 } });
