import { useLoyaltyDemo } from '@/features/loyalty/LoyaltyDemoProvider';
import { loyaltyProgress } from '@/features/loyalty/loyaltyDemo';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { fetchOverview } from '@/api/account';
import { AppScreen } from '@/design/layout';
import { rowDirectionFor } from '@/design/layoutLogic';
import { LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useI18n, type TranslationKey } from '@/i18n';
import { returnsPaths } from '@/features/returns/paths';
import { giftWallet } from '@/features/giftCards/paths';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

const loyaltyRoute = '/account/loyalty' as Href;

type MenuItem = { id: string; label: TranslationKey; icon: keyof typeof Ionicons.glyphMap; route: Href; public?: boolean };
const groups = [
  { id: 'overview', title: 'account.hub.overview', items: [
    { id: 'loyalty', label: 'account.hub.loyalty', icon: 'star-outline', route: loyaltyRoute, public: true },
    { id: 'notifications', label: 'account.menu.notifications', icon: 'notifications-outline', route: '/account/notifications' },
    { id: 'orders', label: 'account.menu.orders', icon: 'cube-outline', route: '/orders' },
    { id: 'gifts', label: 'tabs.gift-cards', icon: 'gift-outline', route: giftWallet, public: true },
    { id: 'returns', label: 'returns.title', icon: 'return-down-back-outline', route: returnsPaths.home, public: true },
    { id: 'profile', label: 'account.hub.personal', icon: 'person-outline', route: '/account/profile' },
    { id: 'addresses', label: 'account.menu.addresses', icon: 'location-outline', route: '/account/addresses' },
  ] },
  { id: 'preferences', title: 'account.hub.preferences', items: [
    { id: 'favorites', label: 'account.menu.favorites', icon: 'heart-outline', route: '/account/favorites' },
    { id: 'settings', label: 'settings.title', icon: 'settings-outline', route: '/account/settings' as Href, public: true },
  ] },
  { id: 'more', title: 'account.hub.more', items: [
    { id: 'about', label: 'account.menu.about', icon: 'information-circle-outline', route: '/account/about', public: true },
  ] },
  { id: 'privacy', title: 'account.hub.privacy', items: [
    { id: 'security', label: 'account.menu.security', icon: 'lock-closed-outline', route: '/account/security' },
    { id: 'data', label: 'personal.dataTitle', icon: 'folder-outline', route: '/account/data' as Href },
    { id: 'privacy', label: 'auth.legal.privacy', icon: 'shield-checkmark-outline', route: '/legal/privacy', public: true },
  ] },
] satisfies ReadonlyArray<{ id: string; title: TranslationKey; items: MenuItem[] }>;

export default function AccountScreen() {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const { left, right } = useSafeAreaInsets();
  const { status, account, verified, notice, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [demo] = useLoyaltyDemo();
  const { points, pending, level, next } = loyaltyProgress(demo);
  const signedIn = status === 'signedIn';
  const overview = useQuery({
    queryKey: ['account', 'overview', account?.id ?? 'anon', locale],
    queryFn: ({ signal }) => fetchOverview({ signal, headers: { 'Accept-Language': locale } }),
    enabled: signedIn && Boolean(account?.id),
    staleTime: 30_000,
  });
  const unread = signedIn && verified ? overview.data?.counts.unreadNotifications : undefined;
  const direction = rowDirectionFor(theme.isRTL);
  const surface = theme.colors.surface;
  const open = (item: MenuItem) => router.push(item.public || signedIn ? item.route : '/sign-in');

  return <AppScreen testID="account-hub" hasBottomBar padded={false} keyboard={false} chrome={false}
    onRefresh={signedIn ? () => { void overview.refetch(); } : undefined} refreshing={overview.isRefetching}
    contentStyle={styles.scroll} style={{ backgroundColor: surface, paddingLeft: left, paddingRight: right }}>
    <View style={styles.frame}>
      <Pressable testID="account-loyalty-banner" accessibilityRole="link"
        accessibilityLabel={`${t('loyalty.brand')} · ${t('loyalty.demo')} · ${t('loyalty.points', { points })}`}
        onPress={() => router.push(loyaltyRoute)} style={styles.banner}>
        <View style={[styles.bannerRow, { flexDirection: direction }]}>
          <AppText variant="captionStrong" color={BRAND.black} style={styles.loyaltyStatus}>{t('loyalty.brand')} · {t(`loyalty.level.${level.id}`)}</AppText>
          <AppText testID="account-loyalty-points" variant="captionStrong" color={BRAND.black} style={styles.loyaltyStatus}>{t('loyalty.points', { points })}</AppText>
          <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.sm} color={BRAND.white} />
        </View>
        <AppText variant="captionStrong" color={BRAND.yellow}>{t('loyalty.demo')}</AppText>
        <AppText variant="bodySmall" color={BRAND.white}>{next ? t('loyalty.profileNext', { count: next.minimum - points, level: t(`loyalty.level.${next.id}`) }) : t('loyalty.profileTop')}</AppText>
        {pending > 0 ? <AppText variant="caption" color={BRAND.white}>{t('loyalty.pending', { points: pending })}</AppText> : null}
      </Pressable>
      <View style={styles.identity}>
        <AppText accessibilityRole="header" variant="h2">{t('account.hub.title')}</AppText>
        {status === 'loading' ? <LoadingBlock /> : signedIn ? <>
          {account?.displayName ? <AppText variant="bodyStrong">{account.displayName}</AppText> : null}
          {!verified ? <AppText variant="caption" color={theme.colors.muted}>{t('account.unverified')}</AppText> : null}
          {notice ? <AppText variant="caption" accessibilityRole="alert" color={theme.status.danger.fg}>{notice}</AppText> : null}
        </> : <>
          <AppText variant="bodySmall" color={theme.colors.muted}>{t('account.guest.body')}</AppText>
          <Button label={t('account.signIn')} onPress={() => router.push('/sign-in')} />
        </>}
      </View>
      {status === 'loading' ? null : groups.map(group => <View key={group.id} testID={`account-group-${group.id}`}>
        <View style={[styles.sectionTitle, { backgroundColor: theme.mode === 'dark' ? theme.colors.canvas : BRAND.lightGray }]}>
          <AppText variant="subtitle" accessibilityRole="header">{t(group.title)}</AppText>
        </View>
        <View style={styles.rows}>
          {group.items.map((item, index) => <Pressable key={item.id} testID={`account-link-${item.id}`} accessibilityRole="link"
            onPress={() => open(item)} style={({ pressed }) => [styles.row, { flexDirection: direction, borderTopColor: theme.colors.line },
              index > 0 && styles.divider, pressed && { opacity: theme.opacity.subtle }]}>
            <Ionicons name={item.icon} size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
            <AppText variant="bodyStrong" style={styles.label}>{t(item.label)}</AppText>
            {item.id === 'notifications' && unread && unread > 0 ? <AppText variant="captionStrong" color={theme.colors.muted}>{unread}</AppText> : null}
            <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
          </Pressable>)}
        </View>
      </View>)}
      {signedIn ? <View style={styles.signOut}>
        <Button label={t('account.signOut')}
          tone="danger" testID="account-sign-out" busy={busy} onPress={() => { setBusy(true); void signOut().finally(() => setBusy(false)); }} />
      </View> : null}
    </View>
  </AppScreen>;
}

const styles = StyleSheet.create({
  scroll: { gap: 0 }, frame: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  banner: { gap: 8, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: BRAND.black },
  bannerRow: { alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  loyaltyStatus: { backgroundColor: BRAND.white, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  identity: { paddingHorizontal: 20, paddingVertical: 20, gap: 8, alignItems: 'stretch' },
  sectionTitle: { paddingHorizontal: 20, paddingVertical: 10 },
  rows: { paddingHorizontal: 20 },
  row: { minHeight: 56, alignItems: 'center', gap: 16, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, minWidth: 0 }, signOut: { paddingHorizontal: 20, paddingTop: 20 },
});
