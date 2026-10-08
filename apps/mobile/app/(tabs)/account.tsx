/**
 * Onglet Compte — l'état RÉEL de la session, puis les réglages.
 *
 * Trois situations affichées différemment, parce qu'elles ne veulent pas dire
 * la même chose :
 *   1. pas de session  → invitation à se connecter, avec ce qu'on y gagne ;
 *   2. session valide  → profil, chiffres du compte, dernières commandes ;
 *   3. session non confirmée par le serveur (réseau coupé) → on le dit, au lieu
 *      d'afficher des commandes vides qui laisseraient croire à un compte neuf.
 */
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import {AppText, Button, Card, KeyValue, LinkRow, SectionHeader, Segmented} from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { fetchOverview, type AccountOverview, type RecentOrder } from '@/api/account';
import { usePrefs, type Locale, type ThemeMode } from '@/state/prefs';
import { useSession } from '@/state/session';

/** Ligne compacte d'une commande récente (les détails vivent dans /orders). */
function OrderRow({ order }: { order: RecentOrder }) {
  const theme = useTheme();
  const t = useI18n().t;
  return (
    <View style={[styles.order, { borderTopColor: theme.colors.line }]}>
      <View style={styles.orderHead}>
        <AppText variant="label" weight="bold">{order.orderNumber || order.id}</AppText>
        <AppText variant="caption" color={theme.colors.accentText}>{order.status}</AppText>
      </View>
      <AppText variant="caption" color={theme.colors.muted}>
        {t('orders.items', { count: order.itemCount })} · {t('orders.total')} {order.totalTnd.toFixed(2)} DT
      </AppText>
      {order.createdAt ? (
        <AppText variant="caption" color={theme.colors.muted}>{order.createdAt.slice(0, 10)}</AppText>
      ) : null}
    </View>
  );
}

function SignedIn({ overview, pending }: { overview: AccountOverview | null; pending: boolean }) {
  const theme = useTheme();
  const t = useI18n().t;
  const { signOut, account, verified, notice } = useSession();
  const [busy, setBusy] = useState(false);
  const unread = overview?.counts.unreadNotifications ?? 0;
  const shown = overview?.account ?? account;

  return (
    <>
      <Card
        title={t('account.signedInAs')}
        hint={verified ? undefined : t('account.unverified')}
      >
        <View style={styles.identity}>
          <Ionicons name="person-circle-outline" size={44} color={theme.colors.accent} />
          <View style={styles.identityText}>
            <AppText variant="lead" weight="bold">{shown?.displayName || '—'}</AppText>
            <AppText variant="caption" color={theme.colors.muted}>{shown?.email || shown?.phone || ''}</AppText>
            <AppText variant="caption" color={shown?.phoneVerified ? theme.colors.accentText : theme.colors.muted}>
              {shown?.phoneVerified ? t('account.phone.verified') : t('account.phone.unverified')}
            </AppText>
          </View>
        </View>
        {notice ? <AppText variant="caption" color={theme.colors.danger}>{notice}</AppText> : null}
        <Button
          label={t('account.signOut')}
          tone="quiet"
          busy={busy}
          onPress={() => { setBusy(true); signOut().finally(() => setBusy(false)); }}
        />
      </Card>

      {/* Le menu du compte : chaque ligne ouvre un écran réel, aucune n'est morte. */}
      <Card title={t('account.menu.title')}>
        <LinkRow icon="person-outline" label={t('account.menu.profile')} onPress={() => router.push('/account/profile')} />
        <LinkRow icon="cube-outline" label={t('account.menu.orders')} onPress={() => router.push('/orders')} />
        <LinkRow icon="location-outline" label={t('account.menu.addresses')}
          value={overview ? String(overview.counts.addresses) : undefined}
          onPress={() => router.push('/account/addresses')} />
        <LinkRow icon="heart-outline" label={t('account.menu.favorites')}
          value={overview ? String(overview.counts.favorites) : undefined}
          onPress={() => router.push('/account/favorites')} />
        <LinkRow icon="notifications-outline" label={t('account.menu.notifications')}
          value={unread > 0 ? String(unread) : undefined}
          onPress={() => router.push('/account/notifications')} />
        <LinkRow icon="options-outline" label={t('account.menu.preferences')} onPress={() => router.push('/account/preferences')} />
        <LinkRow icon="lock-closed-outline" label={t('account.menu.security')} onPress={() => router.push('/account/security')} />
        <LinkRow icon="information-circle-outline" label={t('account.menu.about')} onPress={() => router.push('/account/about')} />
      </Card>

      {pending ? <LoadingBlock label={{ fr: t('account.loading'), ar: t('account.loading') }} /> : null}
      {overview ? (
        <Card title={t('account.stats.orders')}>
          <KeyValue label={t('account.stats.orders')} value={String(overview.counts.orders)} />
          <KeyValue label={t('account.stats.favorites')} value={String(overview.counts.favorites)} />
          <KeyValue label={t('account.stats.addresses')} value={String(overview.counts.addresses)} />
          <KeyValue label={t('account.stats.cart')} value={String(overview.counts.cartItems)} />
          <KeyValue label={t('account.stats.spent')} value={overview.totalSpent.toFixed(2)} />
        </Card>
      ) : null}

      {overview && overview.recentOrders.length > 0 ? (
        <Card title={t('account.recentOrders')}>
          {overview.recentOrders.map((order) => <OrderRow key={order.id} order={order} />)}
          <Button label={t('account.allOrders')} tone="quiet" onPress={() => router.push('/orders')} />
        </Card>
      ) : null}
    </>
  );
}

export default function AccountScreen() {
  const t = useI18n().t;
  const theme = useTheme();
  const { locale, setLocale, themeMode, setThemeMode } = usePrefs();
  const { status, account } = useSession();
  const signedIn = status === 'signedIn';

  const overviewQuery = useQuery({
    queryKey: ['account', 'overview', account?.id ?? 'anon'],
    queryFn: ({ signal }) => fetchOverview({ signal }),
    enabled: signedIn,
    staleTime: 30_000,
  });

  const refresh = useCallback(() => { if (signedIn) overviewQuery.refetch(); }, [signedIn, overviewQuery]);

  return (
    <AppScreen
      overlayHeader={<AppHeader />}
      hasBottomBar
      chrome onRefresh={refresh} refreshing={overviewQuery.isRefetching}>

      {/*
        رسالة القسم — هاذا النصّ كان يعيش في هيدر `Screen` القديم.
        صار `SectionHeader` (§18.2-3): نفس المحتوى، بمكوّن موحّد.
      */}
      <SectionHeader title={t('screen.account.subtitle')} hint={t('screen.account.body')} />
      {!signedIn ? (
        <Card title={t('account.guest.title')} hint={t('account.guest.body')}>
          <Button label={t('account.signIn')} onPress={() => router.push('/sign-in')} />
        </Card>
      ) : overviewQuery.isError ? (
        <>
          <ErrorBlock error={overviewQuery.error} onRetry={() => overviewQuery.refetch()} />
          <SignedIn overview={null} pending={false} />
        </>
      ) : (
        <SignedIn overview={overviewQuery.data ?? null} pending={overviewQuery.isLoading} />
      )}

      <Card title={t('settings.title')}>
        <Segmented<Locale>
          label={t('common.language')}
          value={locale as Locale}
          onChange={setLocale}
          options={[
            { value: 'fr', label: t('language.fr') },
            { value: 'ar', label: t('language.ar') },
          ]}
        />
        <Segmented<ThemeMode>
          label={t('common.theme')}
          value={themeMode}
          onChange={setThemeMode}
          options={[
            { value: 'system', label: t('theme.system') },
            { value: 'light', label: t('theme.light') },
            { value: 'dark', label: t('theme.dark') },
          ]}
        />
        <AppText variant="caption" color={theme.colors.muted}>{t('settings.pending')}</AppText>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  identityText: { flex: 1, gap: 2 },
  order: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 2 },
  orderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
