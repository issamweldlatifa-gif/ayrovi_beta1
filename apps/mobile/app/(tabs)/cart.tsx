/**
 * تبويب السلّة — P5، الشريحة 1: **سلّة AYROVI** (سلّة الشراء).
 *
 * علاش تبدّلت السلّة في التبويب: هذي هي السلّة اللي منها يتكوّن الطلب — تدخلها
 * سطور AYWEBs (بالجسر) وسطور OCEREX (بـ`commit`). سلّة AYWEBs ولّت شاشة فرعية
 * (`/aywebs/cart`) لأنها **منبع**: أسعار المتاجر وتحقّقها.
 *
 * قواعد الصدق في الشاشة:
 *  • كل رقم يجي من `GET /api/cart/items`: المجموع، التوصيل، سطر كل منتوج.
 *  • الكمية **مطلقة** (رقم يبعث للخادم) ثم نعاود نقرا السلّة — ما نزيدوش في الجهاز.
 *  • سطر `STALE` (تسعير فات وقتو) يتقال ويتلوّن، والخادم هو اللي يرفض الطلب:
 *    هنا نقولوها قبل، باش المستعمل ما يوصلش لآخر خطوة ويكتشف.
 *  • الدفع ما هوش في هذي الشريحة: ما فماش زر «خلّص» يدّعي وظيفة ما كايناش —
 *    فماش شي في بلاصتو، والجملة تقول الحقيقة.
 */
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import {AppText, Button, Card, KeyValue, SectionHeader} from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { isApiError, userMessage } from '@/api/errors';
import {
  AYROVI_PRICE_TRUST_REASONS, ayroviCartReadiness, fetchAyroviCart, removeAyroviCartItem,
  updateAyroviCartQuantity, type AyroviCartLine,
} from '@/api/cart';
import { useAyWebsSessionId } from '@/features/aywebs/session';

const MAX_QUANTITY = 99;

export default function AyroviCartScreen() {
  const t = useT();
  const theme = useTheme();
  const { locale } = useI18n();
  const sessionId = useAyWebsSessionId();
  const [note, setNote] = useState('');

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
    onSuccess: () => { setNote(''); reload(); },
    onError: (error) => onNote(error, 'cart.updateFailed'),
  });

  const removeLine = useMutation({
    mutationFn: (itemId: string) => removeAyroviCartItem({ itemId, sessionId }),
    onSuccess: () => { setNote(''); reload(); },
    onError: (error) => onNote(error, 'cart.removeFailed'),
  });

  const cart = cartQuery.data ?? null;
  const gate = useMemo(() => ayroviCartReadiness(cart), [cart]);
  const busy = setQuantity.isPending || removeLine.isPending;

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
      case 'in_stock': return t('lens.avail.in_stock');
      case 'limited': return t('lens.avail.limited');
      case 'out_of_stock': return t('lens.avail.out_of_stock');
      default: return t('lens.avail.unknown');
    }
  };

  const lineBlock = (line: AyroviCartLine) => {
    const image = mediaUrl(line.imageUrl);
    const blocked = line.priceTrust === 'STALE';
    return (
      <View key={line.id} style={[styles.line, { borderTopColor: theme.colors.line }]}>
        {image ? <Image source={{ uri: image }} style={styles.image} resizeMode="contain" /> : null}
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
          <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">
            {trustReasonKey(line) || t('cart.trustReason.default')}
          </AppText>
        ) : null}

        <View style={styles.quantityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cart.decrease')}
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
          />
        </View>
      </View>
    );
  };

  return (
    <AppScreen
      overlayHeader={<AppHeader />}
      hasBottomBar
      chrome onRefresh={reload} refreshing={cartQuery.isFetching && !cartQuery.isPending}>

      {/*
        رسالة القسم — هاذا النصّ كان يعيش في هيدر `Screen` القديم.
        صار `SectionHeader` (§18.2-3): نفس المحتوى، بمكوّن موحّد.
      */}
      <SectionHeader title={t('screen.cart.subtitle')} hint={t('screen.cart.body')} />
      <Card title={t('cart.title')} hint={t('cart.hint')}>
        {!sessionId || cartQuery.isPending ? (
          <LoadingBlock label={{ fr: 'Chargement du panier…', ar: 'جارٍ تحميل السلّة…' }} />
        ) : cartQuery.isError ? (
          <ErrorBlock error={cartQuery.error} onRetry={reload} />
        ) : !cart || cart.items.length === 0 ? (
          <>
            <EmptyBlock>{t('cart.empty')}</EmptyBlock>
            {/* إجراء حقيقي: باب لمنتوجات AYWEBs (بلا زرّ ميّت). */}
            <Button label={t('cart.emptyAction')} onPress={() => router.push('/aywebs')} />
          </>
        ) : (
          <>
            <KeyValue label={t('cart.units')} value={String(cart.units)} />
            <KeyValue label={t('cart.subtotalProducts')} value={`${cart.productSubtotalTND.toFixed(2)} TND`} />
            <KeyValue label={t('cart.delivery')} value={`${cart.deliveryTND.toFixed(2)} TND`} />
            <KeyValue label={t('cart.total')} value={`${cart.totalTND.toFixed(2)} TND`} />

            {note ? (
              <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">{note}</AppText>
            ) : null}

            {gate.blockReason === 'PRICE_VERIFICATION_REQUIRED' ? (
              <AppText variant="caption" color={theme.colors.danger}>
                {t('cart.blockedBody', { count: gate.staleLines.length })}
              </AppText>
            ) : null}

            {/* باب الدفع: يتفتح كان كي الخادم يقبل — والسطر الموقوف يتقال بسببه. */}
            <Button
              label={t('cart.checkout')}
              onPress={() => router.push('/checkout')}
              disabled={!gate.canCheckout}
            />
            {!gate.canCheckout && gate.blockReason === 'PRICE_VERIFICATION_REQUIRED' ? (
              <AppText variant="caption" color={theme.colors.danger}>{t('cart.checkoutBlocked')}</AppText>
            ) : null}
          </>
        )}
      </Card>

      {groups.map(([store, lines]) => (
        <Card key={store} title={store}>
          {lines.map(lineBlock)}
        </Card>
      ))}

      {/* سلّة AYWEBs (المصادر) — باب حقيقي من هنا. */}
      <Card title={t('cart.aywebsTitle')} hint={t('cart.aywebsHint')}>
        <Button label={t('cart.aywebsOpen')} tone="quiet" onPress={() => router.push('/aywebs/cart')} />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  line: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 4 },
  image: { width: '100%', height: 140 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  step: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
