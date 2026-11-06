import { useRef, useState } from 'react';
import { addCatalogToCart } from '@/api/cart';
import { useSessionId } from '@/session/session';
import { variantChoiceState } from '@/features/shopping/variantChoice';
import { touchCartReservation } from '@/features/shopping/cartReservation';
import { singleDimensionValue } from '@/features/product/fiche';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCatalogProduct } from '@/api/catalog';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/format/money';

/** UI adapter only: existing catalogue, variantChoiceState, Cart API and reservation Core. No local stock or price calculation. */
export function PublicationProductPreview({ id, onContinue, onBack }: { id: string; onContinue: () => void; onBack: () => void }) {
  const { locale } = useI18n(); const ar = locale === 'ar';
  const sessionId = useSessionId(); const cache = useQueryClient();
  const [size, setSize] = useState(''); const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [notice, setNotice] = useState('');
  const product = useQuery({ queryKey: ['publication-product-preview', id], queryFn: ({ signal }) => fetchCatalogProduct(id, { signal }) });
  const sheet = product.data?.sheet;
  const selection = { size: size || singleDimensionValue(sheet?.dimensions, 'size'), color: color || singleDimensionValue(sheet?.dimensions, 'color') };
  const choice = variantChoiceState(sheet, selection);
  const ready = !!sheet?.purchasable && choice.ready && !!sessionId;
  const add = async () => {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      await addCatalogToCart({ productId: id, sessionId, quantity: 1, requestedSize: selection.size || undefined, requestedColor: selection.color || undefined });
      touchCartReservation(); void cache.invalidateQueries({ queryKey: ['cart'] });
      setNotice(ar ? 'تمت الإضافة إلى السلة' : 'Article ajouté au panier');
    } catch { setNotice(ar ? 'تعذّرت الإضافة. تحقّق من المخزون والاختيار وأعد المحاولة.' : 'Ajout refusé. Vérifiez le stock et votre sélection, puis réessayez.'); void product.refetch(); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.button}><AppText color={P.ink}>{ar ? 'العودة إلى المنشور' : 'Retour à la publication'}</AppText></Pressable>
    {product.isPending ? <LoadingBlock /> : product.isError ? <ErrorBlock error={product.error} onRetry={() => void product.refetch()} /> : !product.data ? <EmptyBlock><AppText color={P.muted}>{ar ? 'المنتج غير متاح' : 'Produit indisponible'}</AppText></EmptyBlock> : <>
      {product.data.image ? <AppImage uri={mediaUrl(product.data.image)} accessibilityLabel={product.data.name} style={styles.image} contentFit="contain" /> : null}
      <AppText variant="captionStrong" color={P.muted}>{product.data.brandName}</AppText>
      <AppText variant="h3" color={P.ink}>{product.data.name}</AppText>
      <AppText color={P.ink}>{formatMoney(product.data.finalPrice)}</AppText>
      <AppText color={P.muted}>{product.data.description}</AppText>
      {(sheet?.dimensions ?? []).map(dimension => <View key={dimension.key} style={styles.content}>
        <AppText variant="captionStrong" color={P.ink}>{dimension.label}</AppText>
        <View style={styles.options}>{dimension.values.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`${dimension.label} ${option.value}`} accessibilityState={{ selected: selection[dimension.key] === option.value, disabled: !option.available || busy }} disabled={!option.available || busy} onPress={() => { setNotice(''); if (dimension.key === 'size') setSize(option.value); else setColor(option.value); }} style={[styles.option, { backgroundColor: selection[dimension.key] === option.value ? P.ink : P.neutral }]}><AppText color={selection[dimension.key] === option.value ? P.paper : P.ink}>{option.value}{!option.available ? (ar ? ' · غير متاح' : ' · indisponible') : ''}</AppText></Pressable>)}</View>
      </View>)}
      {!ready ? <AppText color={P.muted}>{choice.missing ? (ar ? 'اختر المقاس واللون المتاحين' : 'Choisissez les options disponibles') : (ar ? 'هذا الاختيار غير متاح للشراء حاليًا' : 'Cette sélection n’est pas disponible à l’achat')}</AppText> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready || busy, busy }} disabled={!ready || busy} onPress={() => void add()} style={[styles.button, styles.cta]}><AppText color={P.paper}>{busy ? (ar ? 'جارٍ الإضافة…' : 'Ajout en cours…') : (ar ? 'إضافة إلى السلة' : 'Ajouter au panier')}</AppText></Pressable>
      {notice ? <AppText accessibilityLiveRegion="polite" color={P.ink}>{notice}</AppText> : null}
      <Pressable accessibilityRole="button" onPress={onContinue} style={styles.button}><AppText color={P.ink}>{ar ? 'صفحة المنتج الكاملة' : 'Voir la fiche complète'}</AppText></Pressable>
    </>}
  </View>;
}
const styles = StyleSheet.create({ options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, content: { gap: 12 }, image: { width: '100%', aspectRatio: 1 }, button: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }, cta: { backgroundColor: P.ink } });
