import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText, Button } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { RADIUS } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { fetchOrders } from '@/api/account';
import { statusText } from '@/api/labels';
import { mediaUrl } from '@/api/client';
import { useSession } from '@/state/session';
import { formatMoney } from '@/format/money';
import { OrderFact, OrderShell } from '@/features/orders/OrderLayout';
import { returnsPaths } from '@/features/returns/paths';
import { formatOrderDate, orderDate, orderMonth, orderPeriods, sixMonthsBefore, type OrderPeriod } from '@/features/orders/orderPresentation';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function OrdersScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { bottom } = useSafeAreaInsets();
  const { status, account } = useSession();
  const accountId = status === 'signedIn' ? account?.id : undefined;
  const [period, setPeriod] = useState<OrderPeriod>('recent');
  const [choosing, setChoosing] = useState(false);
  const query = useQuery({
    queryKey: ['account', 'orders', accountId], enabled: Boolean(accountId),
    queryFn: ({ signal }) => fetchOrders({ signal }), staleTime: 30_000,
  });
  const now = new Date();
  const cutoff = sixMonthsBefore(now);
  const orders = query.data ?? [];
  const visible = orders.map(order => ({ order, date: orderDate(order.createdAt) }))
    .filter(({ date }) => period === 'all' || date === null || date >= cutoff);
  const direction = rowDirectionFor(theme.isRTL);
  const retry = () => { void query.refetch(); };

  return <OrderShell title={t('orders.title')} fallback="/(tabs)/account">
    {status === 'loading' ? <LoadingBlock /> : !accountId ? <View style={styles.guest}>
      <AppText color={theme.colors.muted}>{t('orders.subtitle')}</AppText>
      <Button label={t('account.signIn')} onPress={() => router.push('/sign-in')} />
    </View> : <>
      <FlatList style={styles.list} data={visible} keyExtractor={({ order }) => order.id}
        refreshing={query.isRefetching} onRefresh={retry}
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
        ListHeaderComponent={<View style={styles.tools}>
          <Button label={t('orders.returnItem')} block size="lg" onPress={() => router.push(returnsPaths.request)} />
          <Pressable accessibilityRole="link" style={styles.link} onPress={() => router.push(returnsPaths.policy)}>
            <AppText variant="bodyStrong" style={styles.underlined}>{t('orders.returnPolicy')}</AppText>
          </Pressable>
          <AppText variant="h2" accessibilityRole="header">{t('orders.title')}</AppText>
          {orders.length > 0 ? <>
            <Pressable testID="orders-period" accessibilityRole="button" accessibilityState={{ expanded: choosing }}
              style={[styles.period, { flexDirection: direction, borderColor: theme.colors.lineControl }]} onPress={() => setChoosing(value => !value)}>
              <AppText style={styles.label}>{t(`orders.period.${period}`)}</AppText>
              <Ionicons name={choosing ? 'chevron-up' : 'chevron-down'} size={theme.iconSize.md} color={theme.colors.ink} />
            </Pressable>
            {choosing ? <View style={[styles.periodChoices, { borderColor: theme.colors.line }]}>
              {orderPeriods.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === period }}
                style={styles.choice} onPress={() => { setPeriod(item); setChoosing(false); }}>
                <AppText variant={item === period ? 'bodyStrong' : 'body'}>{t(`orders.period.${item}`)}</AppText>
              </Pressable>)}
            </View> : null}
          </> : null}
          {query.isLoading ? <LoadingBlock /> : null}
          {query.isError ? <ErrorBlock error={query.error} onRetry={retry} /> : null}
        </View>}
        ListEmptyComponent={!query.isLoading && !query.isError ? <View testID="orders-empty" style={styles.empty}>
          <View style={[styles.emptyGlyph, { borderColor: theme.colors.lineControl }]}>
            <Ionicons name="bag-handle-outline" size={theme.iconSize.xl} color={theme.colors.ink} />
          </View>
          <AppText variant="subtitle" align="center">{t(orders.length ? 'orders.periodEmpty' : 'orders.empty')}</AppText>
          {orders.length ? <Button label={t('orders.period.all')} tone="quiet" onPress={() => setPeriod('all')} /> :
            <Button label={t('orders.continue')} onPress={() => router.navigate('/(tabs)')} />}
        </View> : null}
        renderItem={({ item: { order, date }, index }) => {
          const previous = visible[index - 1]?.date;
          const month = date ? orderMonth(date) : null;
          const newMonth = index === 0 || month !== (previous ? orderMonth(previous) : null);
          const orderStatus = statusText('order', order.status, t);
          return <View style={styles.group}>
            {newMonth ? <AppText variant="h3" accessibilityRole="header" style={styles.month}>
              {month === orderMonth(now) ? t('orders.thisMonth') : date ? formatOrderDate(order.createdAt, locale, true) : t('orders.undated')}
            </AppText> : null}
            <Pressable testID={`order-${order.id}`} accessibilityRole="link"
              accessibilityLabel={`${t('orders.view')} · ${order.orderNumber || order.id} · ${orderStatus}`}
              onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
              style={[styles.order, { borderBottomColor: theme.colors.line }]}>
              <AppText variant="subtitle">{t('orders.number')} : {order.orderNumber || order.id}</AppText>
              <View style={[styles.viewOrder, { flexDirection: direction }]}>
                <AppText variant="bodyStrong">{t('orders.view')}</AppText>
                <Ionicons name={theme.isRTL ? 'arrow-back' : 'arrow-forward'} size={theme.iconSize.sm} color={theme.colors.ink} />
              </View>
              <View style={[styles.facts, { flexDirection: direction }]}>
                <OrderFact label={t('orders.createdAt')} value={formatOrderDate(order.createdAt, locale)} />
                <OrderFact label={t('orders.total')} value={formatMoney(order.totalTnd)} />
              </View>
              <View style={[styles.facts, { flexDirection: direction }]}><OrderFact label={t('orders.payment')} value={statusText('payment', order.paymentStatus, t)} /></View>
              <AppText variant="bodyStrong">{orderStatus}</AppText>
              {order.imageUrl || order.previewName || order.previewSize ? <View style={styles.preview}>
                {order.imageUrl ? <AppImage uri={mediaUrl(order.imageUrl)} decorative contentFit="contain" style={[styles.thumb, { backgroundColor: theme.colors.accentSoft }]} /> : null}
                {order.previewName ? <AppText variant="bodySmall">{order.previewName}</AppText> : null}
                {order.previewSize ? <AppText variant="caption" color={theme.colors.muted}>{t('orders.size', { size: order.previewSize })}</AppText> : null}
              </View> : null}
              <AppText variant="caption" color={theme.colors.muted}>{t('orders.items', { count: order.itemCount })}</AppText>
            </Pressable>
          </View>;
        }} />
    </>}
  </OrderShell>;
}

const styles = StyleSheet.create({
  list: { flex: 1 }, content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, flexGrow: 1 },
  guest: { padding: 24, gap: 16 }, tools: { gap: 12 }, link: { minHeight: 44, justifyContent: 'center' }, underlined: { textDecorationLine: 'underline' },
  period: { minHeight: 50, borderWidth: 1, borderRadius: RADIUS.sm, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }, label: { flex: 1 },
  periodChoices: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.sm }, choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  group: { gap: 12 }, month: { marginTop: 20 }, order: { paddingVertical: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  viewOrder: { alignItems: 'center', gap: 6 }, facts: { flexWrap: 'wrap', gap: 12 }, preview: { width: '48%', maxWidth: 168, gap: 4 },
  thumb: { width: '100%', aspectRatio: 0.85, borderRadius: RADIUS.md, overflow: 'hidden' },
  empty: { paddingVertical: 24, gap: 24, alignItems: 'center' }, emptyGlyph: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.full },
});
