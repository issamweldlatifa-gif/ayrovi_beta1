/**
 * سلّة AYWEBs — P3، الشريحة 3 (شاشة فرعية من تبويب AYWEBs منذ P5.1):
 * السلّة الحقيقية متاع الشراء ولّت في تبويب «السلّة» (`app/(tabs)/cart.tsx`)؛
 * هذي هي سلّة **المصادر**: أسعار المتاجر وتحقّقها، ومنها يتعمل الجسر.
 *
 * ما تعرضوش أرقاماً محسوبة هنا: المجموع، السطر، التوفّر، الحالة — الكل يجي من
 * `GET /cart`. والكمية **تُضبط** (رقم مطلق يبعث للخادم)، ما تتجمعش في الجهاز:
 * هكذا ما تصيرش مضاعفة كي يتبدّل الرقم في بلاصة أخرى.
 *
 * الجسر (`/cart/bridge-to-ayrovi`) يربط نفس السطور في سلّة AYROVI — مزامنة،
 * موش إضافة ثانية. والخادم يعيد التحقّق من المصادر قبل الربط: كان لقى تغييراً
 * يردّ `409`، وهنا نعرض السبب ونعاود نقرا السلّة — ما نكمّلوش على حالة قديمة.
 */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useI18n, useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { isApiError, userMessage } from '@/api/errors';
import {
  AYWEBS_SOURCE_VERIFICATION_REQUIRED, acceptAyWebsCartPriceChange, bridgeAyWebsCartToAyrovi,
  fetchAyWebsCart, removeAyWebsCartItem, updateAyWebsCartItem, verifyAyWebsCart,
  type AyWebsBridgeOutcome, type AyWebsCartItem,
} from '@/api/aywebs';
import { useAyWebsSessionId } from '@/features/aywebs/session';

const MAX_QUANTITY = 99;

export default function AyWebsCartScreen() {
  const t = useT();
  const theme = useTheme();
  const { locale } = useI18n();
  const sessionId = useAyWebsSessionId();
  const queryClient = useQueryClient();

  /** رسالة واحدة للعمليات: الخادم يقولو، وإحنا نعرضوه كما هو. */
  const [note, setNote] = useState('');
  const [bridge, setBridge] = useState<AyWebsBridgeOutcome | null>(null);

  const cartQuery = useQuery({
    queryKey: ['aywebs', 'cart'],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    staleTime: 0,
  });

  const onNote = useCallback((error: unknown) => {
    setNote(isApiError(error) ? userMessage(error)[locale] : t('aywebs.captureFailed'));
  }, [locale, t]);

  const adopt = useCallback((next: { cart: unknown }) => {
    // الخادم رجّع السلّة كاملة: نعرضو هي، ما نعيدش نبنيو نسخة في الجهاز.
    queryClient.setQueryData(['aywebs', 'cart'], next.cart);
  }, [queryClient]);

  const setQuantity = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      updateAyWebsCartItem(input.itemId, { quantity: input.quantity }, { sessionId }),
    onSuccess: (result) => { setNote(''); setBridge(null); adopt(result); },
    onError: onNote,
  });

  const removeLine = useMutation({
    mutationFn: (itemId: string) => removeAyWebsCartItem(itemId, { sessionId }),
    onSuccess: (next) => { setNote(''); setBridge(null); queryClient.setQueryData(['aywebs', 'cart'], next); },
    onError: onNote,
  });

  const acceptPrice = useMutation({
    mutationFn: (itemId: string) => acceptAyWebsCartPriceChange(itemId, { sessionId }),
    onSuccess: (result) => { setNote(t('aywebs.cartAccepted')); adopt(result); },
    onError: onNote,
  });

  const verify = useMutation({
    mutationFn: () => verifyAyWebsCart({ sessionId, recheckSource: true }),
    onSuccess: (result) => {
      // قراءة جديدة من التاجر: كل سطر تحقّق، والتغييرات من الخادم لا من عندنا.
      setNote(result.changes.length
        ? t('aywebs.cartVerifyChanges', { count: result.changes.length })
        : t('aywebs.cartVerifyNone'));
      adopt(result);
    },
    onError: onNote,
  });

  const linkToAyrovi = useMutation({
    mutationFn: () => bridgeAyWebsCartToAyrovi({ sessionId }),
    onSuccess: (result) => {
      setNote('');
      setBridge(result);
      // الربط يبدّل `linked_to_ayrovi` على السطور: نعاود نقرا السلّة من الخادم.
      cartQuery.refetch();
    },
    onError: (error) => {
      onNote(error);
      // 409 = المصدر تبدّل: نعرض السبب ونجيب الحالة الجديدة (blockers) من الخادم.
      if (isApiError(error) && error.code === AYWEBS_SOURCE_VERIFICATION_REQUIRED) cartQuery.refetch();
    },
  });

  const cart = cartQuery.data ?? null;
  const blockers = useMemo(() => {
    const map = new Map<string, string>();
    for (const blocker of cart?.blockers ?? []) map.set(blocker.itemId, blocker.message);
    return map;
  }, [cart?.blockers]);

  const busyLine = setQuantity.isPending || removeLine.isPending || acceptPrice.isPending;

  const quantityRow = (item: AyWebsCartItem) => (
    <View style={styles.quantityRow}>
      <Button
        label="−"
        tone="quiet"
        disabled={busyLine || item.quantity <= 1}
        onPress={() => setQuantity.mutate({ itemId: item.id, quantity: Math.max(1, item.quantity - 1) })}
      />
      <AppText variant="lead" weight="bold">{String(item.quantity)}</AppText>
      <Button
        label="+"
        tone="quiet"
        disabled={busyLine || item.quantity >= MAX_QUANTITY}
        onPress={() => setQuantity.mutate({ itemId: item.id, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) })}
      />
    </View>
  );

  const lineBlock = (item: AyWebsCartItem) => (
    <View key={item.id} style={[styles.line, { borderColor: theme.colors.line }]}>
      {item.images[0] ? (
        <AppImage uri={mediaUrl(item.images[0])} style={styles.image} contentFit="contain" accessibilityLabel={item.title} />
      ) : null}
      <AppText variant="label" weight="bold">{item.title}</AppText>
      {item.variantLabel ? (
        <KeyValue label={t('aywebs.variant')} value={item.variantLabel} />
      ) : null}
      <KeyValue
        label={t('aywebs.sourcePrice')}
        value={item.unitPrice != null ? `${item.unitPrice} ${item.currency}`.trim() : t('aywebs.noPrice')}
      />
      {item.lineTotalTnd != null ? (
        <KeyValue label={t('aywebs.totalTnd')} value={`${item.lineTotalTnd.toFixed(2)} TND`} />
      ) : null}
      <KeyValue
        label={t('aywebs.availability')}
        value={item.availability === 'AVAILABLE'
          ? t('aywebs.avail.AVAILABLE')
          : item.availability === 'LOW_STOCK'
            ? t('aywebs.avail.LOW_STOCK')
            : item.availability === 'OUT_OF_STOCK'
              ? t('aywebs.avail.OUT_OF_STOCK')
              : t('aywebs.avail.UNKNOWN')}
      />
      {item.linkedToAyrovi === true ? (
        <KeyValue label={t('aywebs.cartLinked')} value="✓" />
      ) : item.linkedToAyrovi === false ? (
        <KeyValue label={t('aywebs.cartNotLinked')} value="—" />
      ) : null}
      {blockers.get(item.id) ? (
        <AppText variant="caption" color={theme.status.danger.fg}>{blockers.get(item.id)}</AppText>
      ) : null}
      {item.status === 'PRICE_CHANGED' ? (
        <Button
          label={t('aywebs.cartAcceptPrice')}
          tone="quiet"
          busy={acceptPrice.isPending}
          onPress={() => acceptPrice.mutate(item.id)}
        />
      ) : null}
      {quantityRow(item)}
      <Button
        label={t('aywebs.cartRemove')}
        tone="quiet"
        disabled={busyLine}
        onPress={() => removeLine.mutate(item.id)}
      />
    </View>
  );

  const reload = useCallback(() => { cartQuery.refetch(); }, [cartQuery]);

  return (
    <SubScreen title={t('aywebs.cartTitle')} subtitle={t('aywebs.cartHint')} fallback="/aywebs" onRefresh={reload} refreshing={cartQuery.isFetching && !cartQuery.isPending}>
      <Card hint={t('aywebs.cartHint')}>
        {!sessionId || cartQuery.isPending ? (
          <LoadingBlock labelKey="loading.cart" />
        ) : cartQuery.isError ? (
          <ErrorBlock error={cartQuery.error} onRetry={reload} />
        ) : !cart || !cart.hasCart || cart.items.length === 0 ? (
          <EmptyBlock>{t('aywebs.cartEmpty')}</EmptyBlock>
        ) : (
          <>
            <KeyValue label={t('aywebs.cartUnits')} value={String(cart.totals.units)} />
            {cart.totals.productSubtotalTnd != null ? (
              <KeyValue
                label={t('aywebs.cartSubtotal')}
                value={`${cart.totals.productSubtotalTnd.toFixed(2)} ${cart.totals.currency || 'TND'}`}
              />
            ) : null}
            <KeyValue label={t('aywebs.cartBlockers')} value={String(cart.totals.blockedItems)} />
            <KeyValue
              label={t('aywebs.cartReady')}
              value={cart.totals.checkoutReady ? t('aywebs.cartReady') : t('aywebs.cartNotReady')}
            />
            {cart.totals.unlinkedUnits != null ? (
              <AppText variant="caption" color={theme.colors.muted}>
                {cart.totals.unlinkedUnits === 0
                  ? t('aywebs.cartAllLinked')
                  : t('aywebs.cartUnlinked', { count: cart.totals.unlinkedUnits })}
              </AppText>
            ) : null}

            {note ? (
              <AppText variant="caption" color={theme.colors.ink} accessibilityRole="alert">{note}</AppText>
            ) : null}

            <View style={styles.actions}>
              <Button
                label={t('aywebs.cartVerify')}
                tone="quiet"
                busy={verify.isPending}
                onPress={() => verify.mutate()}
              />
              <Button
                label={t('aywebs.cartBridge')}
                busy={linkToAyrovi.isPending}
                onPress={() => linkToAyrovi.mutate()}
              />
            </View>

            {bridge ? (
              <View style={styles.bridge}>
                <AppText variant="label" weight="bold">
                  {t('aywebs.cartBridgeMoved', { count: bridge.moved.length })}
                </AppText>
                {bridge.message ? (
                  <AppText variant="caption" color={theme.colors.muted}>{bridge.message}</AppText>
                ) : null}
                {bridge.skipped.length ? (
                  <>
                    <KeyValue label={t('aywebs.cartBridgeSkipped')} value={String(bridge.skipped.length)} />
                    {bridge.skipped.map((line) => (
                      <AppText key={line.aywebsItemId} variant="caption" color={theme.status.danger.fg}>
                        {line.code}{line.message ? ` — ${line.message}` : ''}
                      </AppText>
                    ))}
                  </>
                ) : null}
                {/* الربط صار فعلاً؛ السطور انتقلت إلى سلّة AYROVI، والزرّ يفتحها. */}
                <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.cartBridgeLater')}</AppText>
                <Button label={t('aywebs.cartBridgeOpen')} tone="quiet" onPress={() => router.push('/cart')} />
              </View>
            ) : null}
          </>
        )}
      </Card>

      {cart?.groups.map((group) => (
        <Card key={group.storeId} title={group.storeName || group.storeId} hint={group.integrationType}>
          {group.subtotalTnd != null ? (
            <KeyValue
              label={t('aywebs.cartSubtotal')}
              value={`${group.subtotalTnd.toFixed(2)} ${cart.totals.currency || 'TND'}`}
            />
          ) : null}
          {group.items.map(lineBlock)}
        </Card>
      ))}

      {/* سلّة فارغة ⇒ إجراء حقيقي: نرجعو لتبويب AYWEBs (بلا زرّ ميّت). */}
      {!cartQuery.isPending && !cartQuery.isError && (!cart || !cart.hasCart || cart.items.length === 0) ? (
        <Button label={t('aywebs.cartEmptyAction')} onPress={() => router.push('/aywebs')} />
      ) : null}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  bridge: { gap: 4, marginTop: 8 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 4 },
  image: { width: '100%', height: 140 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
});
