/**
 * Panier AYWEBs unifié sur le gabarit officiel Bag / Zalando :
 *   • Zone centrale défilante : articles portrait (`OfficialCartRow`) + état de
 *     synchronisation avec le panier principal ZAYROVI ;
 *   • Pied fixe immobile : total, action vers le panier ZAYROVI et badges des
 *     moyens de paiement acceptés.
 */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { isApiError } from '@/api/errors';
import { addErrorMessage } from '@/features/aywebs/addError';
import {
  AYWEBS_SOURCE_VERIFICATION_REQUIRED,
  acceptAyWebsCartPriceChange,
  bridgeAyWebsCartToAyrovi,
  fetchAyWebsCart,
  removeAyWebsCartItem,
  updateAyWebsCartItem,
  verifyAyWebsCart,
  type AyWebsBridgeOutcome,
  type AyWebsCartItem,
} from '@/api/aywebs';
import {
  OfficialCartRow,
  OfficialCartScaffold,
  OfficialCartStickySummary,
  splitCartVariantLabels,
} from '@/features/shopping/OfficialCartView';
import { useSessionId } from '@/session/session';

const MAX_QUANTITY = 99;

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AyWebsCartScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();

  const [note, setNote] = useState('');
  const [bridge, setBridge] = useState<AyWebsBridgeOutcome | null>(null);

  const cartQuery = useQuery({
    queryKey: ['aywebs', 'cart'],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    staleTime: 0,
  });

  const onNote = useCallback(
    (error: unknown) => {
      setNote(addErrorMessage(error, locale, t));
    },
    [locale, t],
  );

  const adopt = useCallback(
    (next: { cart: unknown }) => {
      queryClient.setQueryData(['aywebs', 'cart'], next.cart);
    },
    [queryClient],
  );

  const setQuantity = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      updateAyWebsCartItem(input.itemId, { quantity: input.quantity }, { sessionId }),
    onSuccess: (result) => {
      setNote('');
      setBridge(null);
      adopt(result);
    },
    onError: onNote,
  });

  const removeLine = useMutation({
    mutationFn: (itemId: string) => removeAyWebsCartItem(itemId, { sessionId }),
    onSuccess: (next) => {
      setNote('');
      setBridge(null);
      queryClient.setQueryData(['aywebs', 'cart'], next);
    },
    onError: onNote,
  });

  const acceptPrice = useMutation({
    mutationFn: (itemId: string) => acceptAyWebsCartPriceChange(itemId, { sessionId }),
    onSuccess: (result) => {
      setNote(t('aywebs.cartAccepted'));
      adopt(result);
    },
    onError: onNote,
  });

  const verify = useMutation({
    mutationFn: () => verifyAyWebsCart({ sessionId, recheckSource: true }),
    onSuccess: (result) => {
      setNote(
        result.changes.length
          ? t('aywebs.cartVerifyChanges', { count: result.changes.length })
          : t('aywebs.cartVerifyNone'),
      );
      adopt(result);
    },
    onError: onNote,
  });

  const linkToAyrovi = useMutation({
    mutationFn: () => bridgeAyWebsCartToAyrovi({ sessionId }),
    onSuccess: (result) => {
      setNote('');
      setBridge(result);
      void cartQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (error) => {
      onNote(error);
      if (isApiError(error) && error.code === AYWEBS_SOURCE_VERIFICATION_REQUIRED) {
        void cartQuery.refetch();
      }
    },
  });

  const cart = cartQuery.data ?? null;
  const blockers = useMemo(() => {
    const map = new Map<string, string>();
    for (const blocker of cart?.blockers ?? []) map.set(blocker.itemId, blocker.message);
    return map;
  }, [cart?.blockers]);

  const busyLine = setQuantity.isPending || removeLine.isPending || acceptPrice.isPending;
  const reload = useCallback(() => {
    void cartQuery.refetch();
  }, [cartQuery]);

  const hasItems = Boolean(cart && cart.hasCart && cart.items.length > 0);
  const unlinkedUnits = cart?.totals.unlinkedUnits ?? 0;

  const renderItem = (item: AyWebsCartItem) => {
    const parsed = splitCartVariantLabels({ variant: item.variantLabel });
    const availabilityLabel =
      item.availability === 'AVAILABLE'
        ? t('aywebs.avail.AVAILABLE')
        : item.availability === 'LOW_STOCK'
          ? t('aywebs.avail.LOW_STOCK')
          : item.availability === 'OUT_OF_STOCK'
            ? t('aywebs.avail.OUT_OF_STOCK')
            : t('aywebs.avail.UNKNOWN');

    return (
      <View key={item.id}>
        <OfficialCartRow
          item={{
            id: item.id,
            brandOrStore: item.storeName || item.storeId || 'AYWEBs',
            title: item.title,
            imageUrl: item.images[0] || '',
            quantity: item.quantity,
            lineTotalTnd: item.lineTotalTnd,
            color: parsed.color,
            size: parsed.size,
            rawVariant: parsed.extra || (!parsed.color && !parsed.size ? item.variantLabel : ''),
            sourcePriceLabel: item.unitPrice != null ? `${item.unitPrice} ${item.currency}`.trim() : t('aywebs.noPrice'),
            availabilityLabel,
            trustLabel: item.linkedToAyrovi ? t('aywebs.cartLinked') : t('aywebs.cartNotLinked'),
            blockedAlert: blockers.get(item.id) ?? '',
          }}
          busy={busyLine}
          maxQuantity={MAX_QUANTITY}
          onDecrease={() => setQuantity.mutate({ itemId: item.id, quantity: Math.max(1, item.quantity - 1) })}
          onIncrease={() => setQuantity.mutate({ itemId: item.id, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) })}
          onRemove={() => removeLine.mutate(item.id)}
        />
        {item.status === 'PRICE_CHANGED' ? (
          <View style={styles.priceChangeBox}>
            <Button
              label={t('aywebs.cartAcceptPrice')}
              tone="quiet"
              busy={acceptPrice.isPending}
              onPress={() => acceptPrice.mutate(item.id)}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas, paddingTop: insets.top }]}>
      <OfficialCartScaffold
        title={t('tabs.cart')}
        itemCount={cart?.totals.units ?? 0}
        onBack={() => goBack('/aywebs')}
        onRefresh={reload}
        refreshing={cartQuery.isFetching && !cartQuery.isPending}
        topNotice={
          hasItems && cart ? (
            <View style={styles.notices}>
              {unlinkedUnits > 0 ? (
                <Card title={t('aywebs.cartTitle')} hint={t('aywebs.cartHint')}>
                  <AppText variant="caption" color={theme.colors.muted}>
                    {t('aywebs.cartUnlinked', { count: unlinkedUnits })}
                  </AppText>
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
                </Card>
              ) : null}

              {note ? (
                <AppText variant="caption" color={theme.colors.ink} accessibilityRole="alert">
                  {note}
                </AppText>
              ) : null}

              {bridge ? (
                <Card title={t('aywebs.cartBridgeMoved', { count: bridge.moved.length })}>
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
                  <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.cartBridgeLater')}</AppText>
                  <Button label={t('aywebs.cartBridgeOpen')} tone="quiet" onPress={() => router.push('/cart')} />
                </Card>
              ) : null}
            </View>
          ) : null
        }
        stickyFooter={
          hasItems && cart ? (
            <OfficialCartStickySummary
              deliveryTnd={null}
              totalTnd={cart.totals.productSubtotalTnd}
              checkoutLabel={unlinkedUnits > 0 ? t('aywebs.cartBridge') : t('aywebs.cartBridgeOpen')}
              checkoutBusy={linkToAyrovi.isPending}
              onCheckout={() => {
                if (unlinkedUnits > 0) {
                  linkToAyrovi.mutate();
                  return;
                }
                router.push('/cart');
              }}
              bottomPadding={Math.max(insets.bottom, 12)}
            />
          ) : null
        }
      >
        {!sessionId || cartQuery.isPending ? (
          <View style={styles.stateBlock}>
            <LoadingBlock labelKey="loading.cart" />
          </View>
        ) : cartQuery.isError ? (
          <View style={styles.stateBlock}>
            <ErrorBlock error={cartQuery.error} onRetry={reload} />
          </View>
        ) : !hasItems ? (
          <View style={styles.emptyWrap}>
            <EmptyBlock>{t('aywebs.cartEmpty')}</EmptyBlock>
            <Button label={t('aywebs.cartEmptyAction')} onPress={() => router.push('/aywebs')} />
          </View>
        ) : (
          cart?.items.map(renderItem)
        )}
      </OfficialCartScaffold>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notices: { gap: 8, paddingTop: 8 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  priceChangeBox: { paddingVertical: 8 },
  stateBlock: { paddingTop: 24 },
  emptyWrap: { paddingTop: 24, gap: 16 },
});
