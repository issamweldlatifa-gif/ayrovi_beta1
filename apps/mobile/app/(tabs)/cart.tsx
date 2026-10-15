/**
 * تبويب السلّة — **سلّة AYROVI** (سلّة الشراء).
 *
 * هذي السلّة اللي منها يتكوّن الطلب.
 *
 * قواعد الصدق في الشاشة:
 *  • كل رقم يجي من `GET /api/cart/items`: المجموع، التوصيل، سطر كل منتوج.
 *  • الكمية **مطلقة** (رقم يبعث للخادم) ثم نعاود نقرا السلّة — ما نزيدوش في الجهاز.
 *  • سطر `STALE` (تسعير فات وقتو) يتقال ويتلوّن، والخادم هو اللي يرفض الطلب:
 *    هنا نقولوها قبل، باش المستعمل ما يوصلش لآخر خطوة ويكتشف.
 *  • السلّة ما تنفّذش الخلاص بنفسها: الزرّ يفتح صفحة الطلب، والوسائل المتاحة
 *    تتحدّد من إعدادات الخادم — لذلك ما نوعدوش ببطاقة ولا بتحويل مسبقاً.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import {AppText, Button, Card, KeyValue, SectionHeader} from '@/design/ui';
import { EmptyBlock, ErrorBlock } from '@/design/states';
import { ListSkeleton } from '@/design/skeleton';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { isApiError, userMessage } from '@/api/errors';
import {
  AYROVI_PRICE_TRUST_REASONS, ayroviCartReadiness, fetchAyroviCart, removeAyroviCartItem,
  updateAyroviCartQuantity, type AyroviCartLine,
} from '@/api/cart';
import { useSessionId } from '@/session/session';
import { earliestCartDeadline, formatCartCountdown, remainingMs, serverClockOffset } from '@/features/lens/lensCartStatus';

const MAX_QUANTITY = 99;

export default function AyroviCartScreen() {
  const t = useT();
  const theme = useTheme();
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

  const reload = useCallback(() => { cartQuery.refetch(); }, [cartQuery]);

  const onNote = useCallback((error: unknown, fallbackKey: 'cart.failed' | 'cart.updateFailed' | 'cart.removeFailed') => {
    setNote(isApiError(error) ? userMessage(error)[locale] : t(fallbackKey));
  }, [locale, t]);

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

  const cart = cartQuery.data ?? null;
  const gate = useMemo(() => ayroviCartReadiness(cart), [cart]);
  const busy = setQuantity.isPending || removeLine.isPending;
  const quoteDeadline = earliestCartDeadline(cart);
  const clockOffset = useMemo(() => cart?.serverNow
    ? serverClockOffset(cart.serverNow, cartQuery.dataUpdatedAt || Date.now()) : 0,
  [cart?.serverNow, cartQuery.dataUpdatedAt]);
  const authoritativeNow = now + clockOffset;
  const quoteExpired = Boolean(quoteDeadline) && remainingMs(quoteDeadline, authoritativeNow) === 0;
  const quoteCountdown = quoteDeadline ? formatCartCountdown(quoteDeadline, authoritativeNow) : '';
  const locallyExpiredLines = (cart?.items ?? []).filter((line) => (
    Boolean(line.priceTrustExpiresAt) && remainingMs(line.priceTrustExpiresAt, authoritativeNow) === 0
  )).length;
  const requiresLensReverification = quoteExpired || gate.blockReason === 'PRICE_VERIFICATION_REQUIRED';
  const staleLensCount = Math.max(gate.staleLines.length, locallyExpiredLines);

  useEffect(() => {
    if (!quoteDeadline) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [quoteDeadline]);

  /** سطور مجموعة حسب المتجر — كما يجي التقسيم في المفهوم، بلا اختراع. */
  const groups = useMemo(() => {
    const byStore = new Map<string, AyroviCartLine[]>();
    for (const line of cart?.items ?? []) {
      const key = line.store || '—';
      byStore.set(key, [...(byStore.get(key) ?? []), line]);
    }
    return [...byStore.entries()];
  }, [cart]);

  const trustLabel = useCallback((line: AyroviCartLine): string => {
    if (line.priceTrust === 'STALE') return t('cart.trust.STALE');
    if (line.priceTrust === 'MANUAL') return t('cart.trust.MANUAL');
    if (line.priceTrust === 'FRESH') return t('cart.trust.FRESH');
    return t('cart.trust.UNKNOWN');
  }, [t]);

  const trustReasonKey = (line: AyroviCartLine): string => {
    const code = AYROVI_PRICE_TRUST_REASONS[line.priceTrustReason] ?? '';
    switch (code) {
      case 'QUOTE_EXPIRED': return t('cart.trustReason.QUOTE_EXPIRED');
      case 'QUOTE_MISSING': return t('cart.trustReason.QUOTE_MISSING');
      case 'MANUAL_REVIEW': return t('cart.trustReason.MANUAL_REVIEW');
      default: return '';
    }
  };

  const availabilityLabel = (value: string): string => {
    switch (value) {
      case 'in_stock': return t('product.avail.in_stock');
      case 'limited': return t('product.avail.limited');
      case 'out_of_stock': return t('product.avail.out_of_stock');
      default: return t('product.avail.unknown');
    }
  };

  const lineBlock = (line: AyroviCartLine) => {
    const image = mediaUrl(line.imageUrl);
    const blocked = line.priceTrust === 'STALE';
    return (
      <View key={line.id} style={[styles.line, { borderTopColor: theme.colors.line }]}>
        {image ? (
          <AppImage uri={image} style={styles.image} contentFit="contain" accessibilityLabel={line.title} />
        ) : null}
        <AppText variant="label" weight="bold">{line.title}</AppText>
        {line.variant ? <KeyValue label={t('cart.variant')} value={line.variant} /> : null}
        <KeyValue
          label={t('cart.sourcePrice')}
          value={`${line.sourcePrice} ${line.sourceCurrency || '?'}`}
        />
        <KeyValue
          label={t('cart.lineTotal')}
          value={line.lineTotalTND != null ? `${line.lineTotalTND.toFixed(2)} TND` : t('cart.noLineTotal')}
        />
        {line.discountTND ? (
          <AppText variant="caption" color={theme.colors.muted}>
            {t('cart.promo', { percent: line.promoLabel, amount: line.discountTND.toFixed(2) })}
          </AppText>
        ) : null}
        <KeyValue label={t('cart.availability')} value={availabilityLabel(line.availability)} />
        <KeyValue label={t('cart.priceTrust')} value={trustLabel(line)} />

        {blocked ? (
          <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">
            {trustReasonKey(line) || t('cart.trustReason.default')}
          </AppText>
        ) : null}

        <View style={[styles.quantityRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cart.decrease')}
            testID={`cart-line-${line.id}-minus`}
            disabled={busy || line.quantity <= 1}
            onPress={() => setQuantity.mutate({ itemId: line.id, quantity: line.quantity - 1 })}
            style={[styles.step, {
              borderColor: theme.colors.line,
              borderRadius: theme.radius.control,
              minHeight: theme.geometry.minTarget,
              minWidth: theme.geometry.minTarget,
              opacity: busy || line.quantity <= 1 ? 0.4 : 1,
            }]}
          >
            <AppText variant="title">−</AppText>
          </Pressable>
          <AppText variant="label" weight="bold">{String(line.quantity)}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cart.increase')}
            testID={`cart-line-${line.id}-plus`}
            disabled={busy || line.quantity >= MAX_QUANTITY}
            onPress={() => setQuantity.mutate({ itemId: line.id, quantity: line.quantity + 1 })}
            style={[styles.step, {
              borderColor: theme.colors.line,
              borderRadius: theme.radius.control,
              minHeight: theme.geometry.minTarget,
              minWidth: theme.geometry.minTarget,
              opacity: busy || line.quantity >= MAX_QUANTITY ? 0.4 : 1,
            }]}
          >
            <AppText variant="title">+</AppText>
          </Pressable>
          <Button
            label={t('cart.remove')}
            tone="quiet"
            busy={removeLine.isPending && removeLine.variables === line.id}
            disabled={busy}
            onPress={() => removeLine.mutate(line.id)}
            testID={`cart-line-${line.id}-remove`}
          />
        </View>
      </View>
    );
  };

  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} />}
      hasBottomBar
      chrome onRefresh={reload} refreshing={cartQuery.isFetching && !cartQuery.isPending}>

      {/*
        رسالة القسم — هاذا النصّ كان يعيش في هيدر `Screen` القديم.
        صار `SectionHeader` (§18.2-3): نفس المحتوى، بمكوّن موحّد.
      */}
      <SectionHeader title={t('screen.cart.subtitle')} hint={t('screen.cart.body')} />
      <Card title={t('cart.title')} hint={t('cart.hint')}>
        {!sessionId || cartQuery.isPending ? (
          <ListSkeleton count={3} />
        ) : cartQuery.isError ? (
          <ErrorBlock error={cartQuery.error} onRetry={reload} />
        ) : !cart || cart.items.length === 0 ? (
          <>
            <EmptyBlock>{t('cart.empty')}</EmptyBlock>
          </>
        ) : (
          <>
            <KeyValue label={t('cart.units')} value={String(cart.units)} />
            <KeyValue label={t('cart.subtotalProducts')} value={`${cart.productSubtotalTND.toFixed(2)} TND`} />
            <KeyValue label={t('cart.delivery')} value={`${cart.deliveryTND.toFixed(2)} TND`} />
            <KeyValue label={t('cart.total')} value={`${cart.totalTND.toFixed(2)} TND`} />
            {quoteDeadline ? (
              <View style={[styles.quoteTimer, { backgroundColor: theme.colors.infoSoft }]}>
                <AppText variant="caption" weight="bold" style={{ color: quoteExpired ? theme.status.danger.fg : theme.colors.ink }}>
                  {quoteExpired ? t('cart.quoteExpired') : t('cart.quoteCountdown', { time: quoteCountdown })}
                </AppText>
              </View>
            ) : null}

            {note ? (
              <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
            ) : null}

            {requiresLensReverification ? (
              <>
                <AppText variant="caption" color={theme.status.danger.fg}>
                  {t('cart.blockedBody', { count: Math.max(1, staleLensCount) })}
                </AppText>
                <Button label={t('cart.reverifyLens')} onPress={() => router.push('/lens')} testID="cart-reverify-lens" />
              </>
            ) : null}

            {/* باب الدفع: يتفتح كان كي الخادم يقبل — والسطر الموقوف يتقال بسببه. */}
            <Button
              label={t('cart.checkout')}
              tone="main"
              onPress={() => router.push('/checkout')}
              disabled={!gate.canCheckout || quoteExpired}
              testID="cart-checkout"
            />
            {requiresLensReverification ? (
              <AppText variant="caption" color={theme.status.danger.fg}>{t('cart.checkoutBlocked')}</AppText>
            ) : null}
          </>
        )}
      </Card>

      {groups.map(([store, lines]) => (
        <Card key={store} title={store}>
          {lines.map(lineBlock)}
        </Card>
      ))}

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  line: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 4 },
  image: { width: '100%', height: 140 },
  quantityRow: { alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  step: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quoteTimer: { minHeight: 42, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});
