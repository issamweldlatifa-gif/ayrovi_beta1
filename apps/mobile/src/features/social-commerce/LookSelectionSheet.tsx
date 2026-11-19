import { useRef, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueries } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { addCatalogLook, type CatalogueLookInput } from '@/api/cart';
import { fetchCatalogProduct, type CatalogProduct, type SheetDimensionValue } from '@/api/catalog';
import { isApiError } from '@/api/errors';
import { AppSheet } from '@/design/sheet/AppSheet';
import { AppText, Button } from '@/design/ui';
import { LoadingBlock } from '@/design/states';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { variantChoiceState } from '@/features/shopping/variantChoice';
import type { DiscoveryItem } from '@/api/socialCommerce';

export type FeedLook = Extract<DiscoveryItem, { kind: 'look' }>;
type Selection = { size: string; color: string };
const blank: Selection = { size: '', color: '' };
const refusedLookCodes = new Set([
  'INVALID_LOOK', 'LOOK_CHANGED', 'LOOK_PRICE_CHANGED', 'LOOK_CART_PRICE_CHANGED', 'LOOK_REQUEST_REUSED',
  'PRODUCT_NOT_FOUND', 'PRODUCT_UNAVAILABLE', 'NO_PRICE', 'OUT_OF_STOCK', 'SELECTION_REQUIRED',
  'VARIANT_UNAVAILABLE', 'INSUFFICIENT_STOCK', 'CART_QUANTITY_LIMIT',
]);

function choose(product: CatalogProduct, stored = blank) {
  const sheet = product.sheet;
  const colors = sheet?.dimensions.find(dimension => dimension.key === 'color')?.values ?? [];
  const color = stored.color || (colors.length === 1 && colors[0].available ? colors[0].value : '');
  const sizes = (sheet?.dimensions.find(dimension => dimension.key === 'size')?.values ?? []).map(option => ({
    ...option, available: option.available && (!color || variantChoiceState(sheet, { size: option.value, color }).ready),
  }));
  const enabledSizes = sizes.filter(option => option.available);
  const size = stored.size || (enabledSizes.length === 1 ? enabledSizes[0].value : '');
  return { selection: { size, color }, colors, sizes,
    ready: product.finalPrice > 0 && Boolean(sheet?.purchasable) && variantChoiceState(sheet, { size, color }).ready };
}

export function LookSelectionSheet({ look, editionNumber, sessionId, attempt, onClose, onAdded, onFeedChanged }: {
  look: FeedLook; editionNumber: number; sessionId: string; attempt: RefObject<CatalogueLookInput | null>; onClose: () => void;
  onAdded: (units: number, added: number) => void; onFeedChanged: () => void;
}) {
  const t = useT();
  const [choices, setChoices] = useState<Record<string, Selection>>(() => Object.fromEntries(
    (attempt.current?.selections ?? []).map(({ productId, size, color }) => [productId, { size, color }]),
  ));
  const [unconfirmed, setUnconfirmed] = useState(Boolean(attempt.current));
  const sending = useRef(false);
  const queries = useQueries({ queries: look.pins.map(({ product }) => ({
    queryKey: ['social', 'look-product', product.id], queryFn: ({ signal }) => fetchCatalogProduct(product.id, { signal }),
    retry: false, refetchOnMount: 'always' as const,
  })) });
  const rows = queries.map((query, index) => {
    const pin = look.pins[index];
    const product = query.data;
    return { pin, product, model: product ? choose(product, choices[product.id]) : null };
  });
  const loading = queries.some(query => query.isFetching || query.isPending);
  const paused = queries.some(query => query.isPaused);
  const incomplete = queries.some(query => query.isError || query.data === null);
  const ready = !loading && !paused && !incomplete && rows.every(row => row.model?.ready);
  const total = !loading && !paused && !incomplete && rows.every(row => (row.product?.finalPrice ?? 0) > 0)
    ? rows.reduce((sum, row) => sum + (row.product?.finalPrice ?? 0), 0) : null;
  const mutation = useMutation({
    mutationFn: (input: CatalogueLookInput) => addCatalogLook(input, sessionId),
    onSuccess: result => {
      attempt.current = null;
      onAdded(result.totalItemsCount, result.addedCount);
    },
    onError: error => {
      const definite = isApiError(error) && error.kind === 'http' && refusedLookCodes.has(error.code);
      if (definite) attempt.current = null;
      setUnconfirmed(!definite);
    },
    onSettled: () => { sending.current = false; },
  });
  const code = isApiError(mutation.error) ? mutation.error.code : '';
  const changed = code === 'LOOK_CHANGED';
  const priceChanged = code === 'LOOK_PRICE_CHANGED';
  const ambiguity = unconfirmed && attempt.current !== null;
  const canSubmit = Boolean(sessionId) && (ambiguity || (ready && !mutation.isError));
  const confirm = () => {
    if (sending.current || !canSubmit) return;
    const input = attempt.current ?? { lookId: look.id, editionNumber, requestId: randomUUID(), selections: rows.map(({ product, model }) => ({
      productId: product!.id, ...model!.selection, price: product!.finalPrice,
    })) };
    attempt.current = input;
    sending.current = true;
    mutation.mutate(input);
  };
  const refresh = () => {
    mutation.reset();
    void Promise.all(queries.map(query => query.refetch()));
  };
  const options = (key: 'size' | 'color', values: SheetDimensionValue[], productId: string, selection: Selection) => values.length ? <View style={styles.optionGroup}>
    <AppText variant="label">{t(key === 'size' ? 'catalog.size' : 'catalog.color')}</AppText>
    <View style={styles.options}>
      {values.map(value => <Button key={value.value} label={value.value} disabled={!value.available || mutation.isPending || ambiguity}
        size="md" tone={value.value === selection[key] ? 'solid' : 'quiet'}
        onPress={() => setChoices(previous => ({ ...previous, [productId]: key === 'color' ? { size: '', color: value.value } : { ...selection, size: value.value } }))} />)}
    </View>
  </View> : null;
  return <AppSheet open onDismiss={() => { if (!sending.current) onClose(); }} presentation="bottom" heightRatio={0.85}
    header={<View style={styles.header}><AppText variant="h3" accessibilityRole="header">{look.title}</AppText>
      <Button label={t('common.close')} size="md" tone="quiet" disabled={mutation.isPending} onPress={() => { if (!sending.current) onClose(); }} />
    </View>}
    footer={<View style={styles.footer}>
      {total !== null ? <AppText variant="captionStrong">{t('socialCommerce.lookSubtotal', { price: formatMoney(total) })}</AppText> : null}
      <Button testID="look-confirm" tone="commerce" size="lg" block label={t(ambiguity ? 'socialCommerce.lookRetry' : 'socialCommerce.lookAdd')}
        disabled={!canSubmit} busy={mutation.isPending} onPress={confirm} />
    </View>}>
    <View style={styles.body}>
      {loading && !paused ? <LoadingBlock /> : null}
      {incomplete || paused ? <View style={styles.optionGroup}>
        <AppText accessibilityRole="alert">{t('socialCommerce.lookUnavailable')}</AppText>
        <Button label={t('common.retry')} tone="quiet" onPress={refresh} />
      </View> : null}
      {rows.map(({ pin, product, model }) => <View key={pin.product.id} style={styles.part}>
        <AppText variant="h3">{product?.name || pin.product.name}</AppText>
        {product && !loading && !paused && model ? <>
          {product.finalPrice > 0 && product.sheet?.purchasable ? <AppText variant="captionStrong">{formatMoney(product.finalPrice)}</AppText> :
            <AppText variant="caption">{t('shopping.unavailable')}</AppText>}
          {options('color', model.colors, product.id, model.selection)}
          {options('size', model.sizes, product.id, model.selection)}
        </> : null}
      </View>)}
      {mutation.isError || ambiguity ? <View style={styles.optionGroup}>
        <AppText accessibilityRole="alert">{t(ambiguity ? 'socialCommerce.lookUnconfirmed' : changed ? 'socialCommerce.lookChanged' :
          priceChanged ? 'socialCommerce.lookPriceChanged' : code === 'LOOK_CART_PRICE_CHANGED' ? 'socialCommerce.lookCartPriceChanged' : 'socialCommerce.lookUnavailable')}</AppText>
        {!ambiguity ? <Button label={t('common.retry')} tone="quiet" onPress={changed ? onFeedChanged : refresh} /> : null}
      </View> : null}
    </View>
  </AppSheet>;
}

const styles = StyleSheet.create({
  header: { padding: 16, gap: 8, alignItems: 'flex-start' },
  body: { padding: 16, gap: 16 },
  part: { gap: 8, paddingVertical: 8 },
  optionGroup: { gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
});
