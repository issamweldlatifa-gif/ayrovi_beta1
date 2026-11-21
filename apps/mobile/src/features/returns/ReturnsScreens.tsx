import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchOrderDetail, fetchOrders, type RecentOrder } from '@/api/account';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { OrderHelp, OrderSection, OrderShell } from '@/features/orders/OrderLayout';
import { formatOrderDate } from '@/features/orders/orderPresentation';
import { formatMoney } from '@/format/money';
import { useI18n, useT } from '@/i18n';
import { useSession } from '@/state/session';
import { returnsPaths } from './paths';

function Frame({ title, fallback = '/returns', children }: { title: string; fallback?: string; children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return <OrderShell title={title} fallback={fallback}>
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}>
      {children}
    </ScrollView>
  </OrderShell>;
}

function RouteLink({ label, href }: { label: string; href: Href }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={[styles.link, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
    <AppText variant="bodyStrong" style={styles.grow}>{label}</AppText>
    <Ionicons name={theme.isRTL ? 'arrow-back' : 'arrow-forward'} size={theme.iconSize.sm} color={theme.colors.ink} />
  </Pressable>;
}

function Help({ orderNumber, onClose, children }: { orderNumber?: string; onClose: () => void; children?: ReactNode }) {
  const t = useT();
  return <OrderHelp title={t('returns.contact')} hint={t(orderNumber ? 'returns.orderContactHint' : 'returns.contactHint')}
    orderNumber={orderNumber} context={children} onClose={onClose} showPolicy={false} />;
}

function useReturnOrders(accountId: string) {
  return useQuery({ queryKey: ['account', 'orders', accountId], queryFn: ({ signal }) => fetchOrders({ signal }), staleTime: 30_000 });
}

export function ReturnsHome() {
  const theme = useTheme();
  const t = useT();
  const [help, setHelp] = useState(false);
  return <Frame title={t('returns.title')} fallback="/(tabs)/account">
    <View style={[styles.notice, { backgroundColor: theme.colors.accentSoft }]}>
      <AppText variant="bodyStrong" color={theme.colors.onAccentSoft}>{t('returns.noticeTitle')}</AppText>
      <AppText color={theme.colors.onAccentSoft}>{t('returns.notice')}</AppText>
    </View>
    <AppText variant="h2" accessibilityRole="header">{t('returns.title')}</AppText>
    <RouteLink label={t('returns.guide')} href={returnsPaths.guide} />
    <View style={styles.history}>
      <View style={[styles.glyph, { borderColor: theme.colors.lineControl }]}>
        <Ionicons name="bag-handle-outline" size={theme.iconSize.xl} color={theme.colors.ink} />
      </View>
      <AppText variant="subtitle" align="center">{t('returns.historyTitle')}</AppText>
      <AppText align="center" color={theme.colors.muted}>{t('returns.historyUnavailable')}</AppText>
    </View>
    <Button label={t('orders.returnItem')} block size="lg" onPress={() => router.push(returnsPaths.request)} />
    <Button label={t('returns.followUp')} block tone="quiet" onPress={() => setHelp(true)} />
    <RouteLink label={t('orders.returnPolicy')} href={returnsPaths.policy} />
    {help ? <Help onClose={() => setHelp(false)} /> : null}
  </Frame>;
}

export function ReturnRequest() {
  const t = useT();
  const { status, account } = useSession();
  const accountId = status === 'signedIn' ? account?.id : undefined;
  const [generalHelp, setGeneralHelp] = useState(false);
  return <Frame title={t('orders.returnItem')}>
    <AppText variant="h2" accessibilityRole="header">{t('returns.requestTitle')}</AppText>
    <View>
      <RouteLink label={t('returns.guide')} href={returnsPaths.guide} />
      <RouteLink label={t('orders.returnPolicy')} href={returnsPaths.policy} />
    </View>
    {status === 'loading' ? <LoadingBlock /> : accountId ? <ReturnSelection key={accountId} accountId={accountId} /> : <>
      <AppText>{t('returns.signInHint')}</AppText>
      <Button label={t('account.signIn')} onPress={() => router.push('/sign-in')} />
      <Button label={t('returns.contact')} tone="quiet" onPress={() => setGeneralHelp(true)} />
      {generalHelp ? <Help onClose={() => setGeneralHelp(false)} /> : null}
    </>}
  </Frame>;
}

function ReturnSelection({ accountId }: { accountId: string }) {
  const t = useT();
  const theme = useTheme();
  const { locale } = useI18n();
  const orders = useReturnOrders(accountId);
  const [limit, setLimit] = useState(6);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [generalHelp, setGeneralHelp] = useState(false);
  const delivered = (orders.data ?? []).filter(order => order.status === 'DELIVERED');
  const chosen = delivered.find(order => order.id === orderId);
  return <>
    {orders.isPending ? <LoadingBlock /> : orders.isError ? <ErrorBlock error={orders.error} onRetry={() => void orders.refetch()} /> :
      delivered.length ? <View style={styles.stack}>
        <AppText variant="subtitle" accessibilityRole="header">{t('returns.chooseOrder')}</AppText>
        <AppText color={theme.colors.muted}>{t('returns.selectionHint')}</AppText>
        {delivered.slice(0, limit).map(order => <Pressable key={order.id} accessibilityRole="radio" accessibilityState={{ checked: order.id === orderId }}
          style={[styles.choice, { borderColor: order.id === orderId ? theme.colors.ink : theme.colors.lineControl, flexDirection: rowDirectionFor(theme.isRTL) }]}
          onPress={() => setOrderId(order.id)}>
          <Ionicons name={order.id === orderId ? 'radio-button-on-outline' : 'radio-button-off-outline'} size={theme.iconSize.md} color={theme.colors.ink} />
          <View style={styles.grow}>
            <AppText variant="bodyStrong">{order.orderNumber || order.id}</AppText>
            <AppText variant="bodySmall">{formatOrderDate(order.createdAt, locale)}</AppText>
          </View>
        </Pressable>)}
        {delivered.length > limit ? <Button label={t('returns.moreOrders')} tone="quiet" onPress={() => setLimit(value => value + 6)} /> : null}
        {chosen ? <ReturnItems key={chosen.id} accountId={accountId} order={chosen} /> : null}
      </View> : <AppText>{t('returns.noDelivered')}</AppText>}
    <View style={[styles.accordion, { borderColor: theme.colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: missingOpen }} onPress={() => setMissingOpen(value => !value)}
        style={[styles.link, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <Ionicons name="information-circle-outline" size={theme.iconSize.md} color={theme.colors.ink} />
        <AppText variant="bodyStrong" style={styles.grow}>{t('returns.cantFind')}</AppText>
        <Ionicons name={missingOpen ? 'chevron-up' : 'chevron-down'} size={theme.iconSize.md} color={theme.colors.ink} />
      </Pressable>
      {missingOpen ? <View style={styles.accordionBody}>
        <AppText>{t('returns.cantFindBody')}</AppText>
        <RouteLink label={t('returns.title')} href={returnsPaths.home} />
        <Button label={t('returns.contact')} tone="quiet" onPress={() => setGeneralHelp(true)} />
      </View> : null}
    </View>
    {generalHelp ? <Help onClose={() => setGeneralHelp(false)} /> : null}
  </>;
}

function ReturnItems({ accountId, order }: { accountId: string; order: RecentOrder }) {
  const theme = useTheme();
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);
  const [help, setHelp] = useState(false);
  const detail = useQuery({ queryKey: ['account', 'order', accountId, order.id], queryFn: ({ signal }) => fetchOrderDetail(order.id, { signal }), staleTime: 30_000 });
  const items = detail.data?.id === order.id && detail.data.status === 'DELIVERED' ? detail.data.items : [];
  const selection = items.filter(item => selected.includes(item.id));
  return <OrderSection title={t('returns.chooseItems')}>
    {detail.isPending ? <LoadingBlock /> : detail.isError ? <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} /> : items.length ? <>
      {items.map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id) }}
        accessibilityLabel={[item.title, item.variant].filter(Boolean).join(' · ')}
        style={[styles.choice, { borderColor: theme.colors.line, flexDirection: rowDirectionFor(theme.isRTL) }]}
        onPress={() => { setShowError(false); setSelected(value => value.includes(item.id) ? value.filter(id => id !== item.id) : [...value, item.id]); }}>
        <Ionicons name={selected.includes(item.id) ? 'checkbox-outline' : 'square-outline'} size={theme.iconSize.md} color={theme.colors.ink} />
        {item.imageUrl ? <AppImage uri={mediaUrl(item.imageUrl)} decorative contentFit="contain" style={styles.thumb} /> : null}
        <View style={styles.grow}>
          <AppText variant="bodyStrong">{item.title || '—'}</AppText>
          {item.variant ? <AppText variant="bodySmall">{item.variant}</AppText> : null}
        </View>
      </Pressable>)}
      <AppText variant="bodyStrong">{t('returns.selectedCount', { count: selection.length })}</AppText>
      <Button label={t('returns.contactForItems')} block size="lg" onPress={() => { if (selection.length) setHelp(true); else setShowError(true); }} />
      {showError ? <View style={[styles.notice, { backgroundColor: theme.status.danger.soft }]}>
        <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{t('returns.selectError')}</AppText>
      </View> : null}
    </> : <>
      <AppText>{t('returns.noItems')}</AppText>
      <Button label={t('returns.contact')} tone="quiet" onPress={() => setHelp(true)} />
    </>}
    {help && !detail.isError ? <Help orderNumber={order.orderNumber || order.id} onClose={() => setHelp(false)}>
      {selection.map(item => <AppText key={item.id} variant="bodySmall">{[item.title, item.variant].filter(Boolean).join(' · ')}</AppText>)}
    </Help> : null}
  </OrderSection>;
}

export function ReturnGuide() {
  const t = useT();
  const [help, setHelp] = useState(false);
  return <Frame title={t('returns.guide')}>
    <AppText variant="h2" accessibilityRole="header">{t('returns.guideTitle')}</AppText>
    <AppText>{t('returns.guideIntro')}</AppText>
    <Button label={t('orders.returnItem')} block size="lg" onPress={() => router.push(returnsPaths.request)} />
    <OrderSection title={t('returns.refundQ')}><AppText>{t('returns.refundA')}</AppText></OrderSection>
    <OrderSection title={t('returns.shippingQ')}><AppText>{t('returns.shippingA')}</AppText></OrderSection>
    <OrderSection title={t('returns.historyTitle')}>
      <AppText>{t('returns.historyUnavailable')}</AppText>
      <Button label={t('returns.followUp')} tone="quiet" onPress={() => setHelp(true)} />
    </OrderSection>
    <RouteLink label={t('orders.returnPolicy')} href={returnsPaths.policy} />
    {help ? <Help onClose={() => setHelp(false)} /> : null}
  </Frame>;
}

export function ReturnPolicy() {
  const t = useT();
  const { status, account } = useSession();
  const accountId = status === 'signedIn' ? account?.id : undefined;
  const [help, setHelp] = useState(false);
  return <Frame title={t('orders.returnPolicy')}>
    <AppText variant="h2" accessibilityRole="header">{t('orders.returnPolicy')}</AppText>
    <OrderSection title={t('returns.policyQ')}><AppText>{t('returns.policyA')}</AppText></OrderSection>
    <OrderSection title={t('returns.specialQ')}><AppText>{t('returns.specialA')}</AppText></OrderSection>
    <OrderSection title={t('returns.combinedQ')}><AppText>{t('returns.combinedA')}</AppText></OrderSection>
    <RouteLink label={t('returns.fullTerms')} href="/legal/terms" />
    {accountId ? <OrderSupportCards accountId={accountId} key={accountId} /> : null}
    <OrderSection title={t('returns.moreHelpTitle')}>
      <Button label={t('returns.contact')} block tone="quiet" onPress={() => setHelp(true)} />
    </OrderSection>
    {help ? <Help onClose={() => setHelp(false)} /> : null}
  </Frame>;
}

function OrderSupportCards({ accountId }: { accountId: string }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const orders = useReturnOrders(accountId);
  const [selected, setSelected] = useState<string | null>(null);
  const recent = orders.data?.slice(0, 5) ?? [];
  const current = recent.find(order => order.id === selected);
  if (!recent.length && !orders.isError && !orders.isPending) return null;
  return <OrderSection title={t('returns.orderHelpTitle')}>
    {orders.isPending ? <LoadingBlock /> : orders.isError ? <ErrorBlock error={orders.error} onRetry={() => void orders.refetch()} /> :
      <ScrollView horizontal showsHorizontalScrollIndicator={recent.length > 1} contentContainerStyle={styles.cards}>
        {recent.map(order => <View key={order.id} style={[styles.card, { borderColor: theme.colors.lineControl }]}>
          <AppText variant="h3">{formatMoney(order.totalTnd)}</AppText>
          <AppText variant="bodyStrong">{order.orderNumber || order.id}</AppText>
          <AppText>{formatOrderDate(order.createdAt, locale)}</AppText>
          {order.imageUrl ? <AppImage uri={mediaUrl(order.imageUrl)} decorative contentFit="contain" style={styles.thumb} /> : null}
          <Button label={t('order.help')} tone="quiet" block onPress={() => setSelected(order.id)} />
        </View>)}
      </ScrollView>}
    {current && !orders.isError ? <Help orderNumber={current.orderNumber || current.id} onClose={() => setSelected(null)} /> : null}
  </OrderSection>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingTop: 24, paddingHorizontal: 16, gap: 20 },
  grow: { flex: 1 }, stack: { gap: 12 },
  link: { minHeight: 48, alignItems: 'center', gap: 8, paddingVertical: 8 },
  notice: { padding: 16, gap: 8, borderRadius: RADIUS.sm },
  history: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  glyph: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.full },
  accordion: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  accordionBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  choice: { borderWidth: 1, padding: 12, borderRadius: RADIUS.sm, alignItems: 'center', gap: 12, minHeight: 48 },
  thumb: { width: 64, height: 80, borderRadius: RADIUS.sm, overflow: 'hidden' },
  cards: { gap: 12 }, card: { width: 252, borderWidth: StyleSheet.hairlineWidth, padding: 16, borderRadius: RADIUS.md, gap: 8 },
});
