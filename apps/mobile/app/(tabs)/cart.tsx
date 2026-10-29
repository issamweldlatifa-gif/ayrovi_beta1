/**
 * Panier officiel ZAYROVI (style Bag / Zalando) — l'unique panier d'achat de
 * l'application :
 *   • Zone centrale défilante (`ScrollView flex: 1`) : liste des articles avec
 *     vignette portrait, marque/boutique en gras + menu `•••`, titre sur 1 ligne,
 *     prix en rouge + prix d'origine barré en cas de remise (ou prix régulier),
 *     variantes empilées (`Couleur`, `Taille`), et contrôle de quantité.
 *   • Bloc inférieur FIXE (immobile pendant le défilement) : `Livraison`,
 *     `Total` (`TVA incluse`), bouton noir compact `Commander`, et badges des
 *     moyens de paiement acceptés.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyBlock, ErrorBlock } from '@/design/states';
import { ListSkeleton } from '@/design/skeleton';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { useI18n, useT } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  AYROVI_PRICE_TRUST_REASONS,
  ayroviCartReadiness,
  fetchAyroviCart,
  removeAyroviCartItem,
  updateAyroviCartQuantity,
  type AyroviCartLine,
} from '@/api/cart';
import { bridgeAyWebsCartToAyrovi, fetchAyWebsCart } from '@/api/aywebs';
import { pendingAyWebsLines, pendingAyWebsUnits } from '@/features/aywebs/storeShopping';
import {
  OfficialCartRow,
  OfficialCartScaffold,
  OfficialCartStickySummary,
  splitCartVariantLabels,
  type OfficialCartItemModel,
} from '@/features/shopping/OfficialCartView';
import { earliestCartDeadline, formatCartCountdown, remainingMs, serverClockOffset } from '@/features/lens/lensCartStatus';
import { useSessionId } from '@/session/session';
import { formatMoney } from '@/format/money';

const MAX_QUANTITY = 99;

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AyroviCartScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());

  const cartQuery = useQuery({
    queryKey: ['cart', 'ayrovi'],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyroviCart({ sessionId, signal }),
    staleTime: 0,
  });

  const reload = useCallback(() => {
    void cartQuery.refetch();
  }, [cartQuery]);

  const aywebsQuery = useQuery({
    queryKey: ['aywebs', 'cart', sessionId],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    staleTime: 0,
  });

  const onNote = useCallback(
    (error: unknown, fallbackKey: 'cart.failed' | 'cart.updateFailed' | 'cart.removeFailed' | 'cart.linkFailed') => {
      setNote(isApiError(error) ? userMessage(error)[locale] : t(fallbackKey));
    },
    [locale, t],
  );

  const setQuantity = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      updateAyroviCartQuantity({ ...input, sessionId }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (error) => onNote(error, 'cart.updateFailed'),
  });

  const removeLine = useMutation({
    mutationFn: (itemId: string) => removeAyroviCartItem({ itemId, sessionId }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (error) => onNote(error, 'cart.removeFailed'),
  });

  const pendingLines = useMemo(
    () => pendingAyWebsLines(aywebsQuery.data?.items ?? []),
    [aywebsQuery.data],
  );
  const pendingUnits = useMemo(
    () => pendingAyWebsUnits(aywebsQuery.data?.items ?? []),
    [aywebsQuery.data],
  );

  const linkPending = useMutation({
    mutationFn: () => bridgeAyWebsCartToAyrovi({ sessionId }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['aywebs'] });
    },
    onError: (error) => onNote(error, 'cart.linkFailed'),
  });

  const cart = cartQuery.data ?? null;
  const gate = useMemo(() => ayroviCartReadiness(cart), [cart]);
  const busy = setQuantity.isPending || removeLine.isPending;
  const quoteDeadline = earliestCartDeadline(cart);
  const clockOffset = useMemo(
    () => (cart?.serverNow ? serverClockOffset(cart.serverNow, cartQuery.dataUpdatedAt || Date.now()) : 0),
    [cart?.serverNow, cartQuery.dataUpdatedAt],
  );
  const authoritativeNow = now + clockOffset;
  const quoteExpired = Boolean(quoteDeadline) && remainingMs(quoteDeadline, authoritativeNow) === 0;
  const quoteCountdown = quoteDeadline ? formatCartCountdown(quoteDeadline, authoritativeNow) : '';
  const locallyExpiredLines = (cart?.items ?? []).filter(
    (line) => Boolean(line.priceTrustExpiresAt) && remainingMs(line.priceTrustExpiresAt, authoritativeNow) === 0,
  ).length;
  const requiresLensReverification = quoteExpired || gate.blockReason === 'PRICE_VERIFICATION_REQUIRED';
  const staleLensCount = Math.max(gate.staleLines.length, locallyExpiredLines);

  useEffect(() => {
    if (!quoteDeadline) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [quoteDeadline]);

  const trustLabel = useCallback(
    (line: AyroviCartLine): string => {
      if (line.priceTrust === 'STALE') return t('cart.trust.STALE');
      if (line.priceTrust === 'MANUAL') return t('cart.trust.MANUAL');
      if (line.priceTrust === 'FRESH') return t('cart.trust.FRESH');
      return t('cart.trust.UNKNOWN');
    },
    [t],
  );

  const trustReasonText = useCallback(
    (line: AyroviCartLine): string => {
      const code = AYROVI_PRICE_TRUST_REASONS[line.priceTrustReason] ?? '';
      switch (code) {
        case 'QUOTE_EXPIRED':
          return t('cart.trustReason.QUOTE_EXPIRED');
        case 'QUOTE_MISSING':
          return t('cart.trustReason.QUOTE_MISSING');
        case 'MANUAL_REVIEW':
          return t('cart.trustReason.MANUAL_REVIEW');
        default:
          return '';
      }
    },
    [t],
  );

  const availabilityLabel = useCallback(
    (value: string): string => {
      switch (value) {
        case 'in_stock':
          return t('product.avail.in_stock');
        case 'limited':
          return t('product.avail.limited');
        case 'out_of_stock':
          return t('product.avail.out_of_stock');
        default:
          return t('product.avail.unknown');
      }
    },
    [t],
  );

  const itemModels = useMemo<OfficialCartItemModel[]>(() => {
    return (cart?.items ?? []).map((line) => {
      const parsedVariants = splitCartVariantLabels({
        requestedColor: line.requestedColor,
        requestedSize: line.requestedSize,
        variant: line.variant,
      });
      const blocked = line.priceTrust === 'STALE';
      return {
        id: line.id,
        brandOrStore: line.store || 'ZAYROVI',
        title: line.title,
        imageUrl: line.imageUrl,
        quantity: line.quantity,
        lineTotalTnd: line.lineTotalTND,
        originalLineTotalTnd: line.originalLineTotalTND,
        color: parsedVariants.color,
        size: parsedVariants.size,
        rawVariant: parsedVariants.extra || (!parsedVariants.color && !parsedVariants.size ? line.variant : ''),
        sourcePriceLabel: line.sourcePrice > 0 ? `${line.sourcePrice} ${line.sourceCurrency || ''}`.trim() : '',
        availabilityLabel: availabilityLabel(line.availability),
        trustLabel: trustLabel(line),
        blockedAlert: blocked ? (trustReasonText(line) || t('cart.trustReason.default')) : '',
      };
    });
  }, [availabilityLabel, cart?.items, t, trustLabel, trustReasonText]);

  const hasItems = Boolean(cart && cart.items.length > 0);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas, paddingTop: insets.top }]}>
      <OfficialCartScaffold
        title={t('tabs.cart')}
        itemCount={cart?.units ?? 0}
        onBack={() => goBack('/')}
        onRefresh={reload}
        refreshing={cartQuery.isFetching && !cartQuery.isPending}
        topNotice={(
          <View style={styles.notices}>
            {quoteDeadline && hasItems ? (
              <View
                style={[
                  styles.quoteBanner,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="semibold"
                  color={quoteExpired ? theme.status.danger.fg : theme.colors.ink}
                >
                  {quoteExpired ? t('cart.quoteExpired') : t('cart.quoteCountdown', { time: quoteCountdown })}
                </AppText>
              </View>
            ) : null}

            {note ? (
              <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">
                {note}
              </AppText>
            ) : null}

            {requiresLensReverification && hasItems ? (
              <View style={styles.reverifyBox}>
                <AppText variant="caption" color={theme.status.danger.fg}>
                  {t('cart.blockedBody', { count: Math.max(1, staleLensCount) })}
                </AppText>
                <Button
                  label={t('cart.reverifyLens')}
                  tone="quiet"
                  onPress={() => router.push('/lens')}
                  testID="cart-reverify-lens"
                />
              </View>
            ) : null}

            {pendingLines.length > 0 ? (
              <Card title={t('cart.pendingTitle')}>
                <AppText variant="caption" color={theme.colors.muted}>
                  {t('cart.pendingBody', { count: pendingUnits })}
                </AppText>
                {pendingLines.map((item) => (
                  <KeyValue
                    key={item.id}
                    label={item.title}
                    value={
                      item.lineTotalTnd != null
                        ? `${item.quantity} · ${formatMoney(item.lineTotalTnd)}`
                        : `${item.quantity} · ${item.unitPrice ?? '?'} ${item.currency}`
                    }
                  />
                ))}
                <Button
                  label={t('cart.pendingLink')}
                  tone="quiet"
                  onPress={() => linkPending.mutate()}
                  busy={linkPending.isPending}
                  testID="cart-link-pending"
                />
              </Card>
            ) : null}
          </View>
        )}
        stickyFooter={
          hasItems && cart ? (
            <OfficialCartStickySummary
              deliveryTnd={cart.deliveryTND}
              totalTnd={cart.totalTND}
              checkoutLabel={t('cart.checkout')}
              checkoutDisabled={!gate.canCheckout || quoteExpired}
              onCheckout={() => router.push('/checkout')}
              checkoutTestID="cart-checkout"
              bottomPadding={12}
              extraAboveButton={
                requiresLensReverification ? (
                  <AppText variant="caption" color={theme.status.danger.fg}>
                    {t('cart.checkoutBlocked')}
                  </AppText>
                ) : null
              }
            />
          ) : null
        }
      >
        {!sessionId || cartQuery.isPending ? (
          <View style={styles.stateBlock}>
            <ListSkeleton count={3} />
          </View>
        ) : cartQuery.isError ? (
          <View style={styles.stateBlock}>
            <ErrorBlock error={cartQuery.error} onRetry={reload} />
          </View>
        ) : !hasItems ? (
          <View style={styles.stateBlock}>
            <EmptyBlock>{t('cart.empty')}</EmptyBlock>
          </View>
        ) : (
          itemModels.map((model) => (
            <OfficialCartRow
              key={model.id}
              item={model}
              busy={busy}
              maxQuantity={MAX_QUANTITY}
              onDecrease={() => setQuantity.mutate({ itemId: model.id, quantity: model.quantity - 1 })}
              onIncrease={() => setQuantity.mutate({ itemId: model.id, quantity: model.quantity + 1 })}
              onRemove={() => removeLine.mutate(model.id)}
            />
          ))
        )}
      </OfficialCartScaffold>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notices: { gap: 8, paddingTop: 8 },
  quoteBanner: {
    minHeight: 36,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reverifyBox: { gap: 8 },
  stateBlock: { paddingTop: 24 },
});
