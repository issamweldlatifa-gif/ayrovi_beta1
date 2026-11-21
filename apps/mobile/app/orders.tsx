/**
 * Mes commandes — la liste complète, telle que le serveur la connaît.
 *
 * Un seul appel (`/api/customer/account/orders`), et un écran qui dit la vérité
 * dans les trois cas : chargement, erreur réseau (avec réessai), liste vide.
 * Aucune commande n'est inventée ni dupliquée depuis la page d'accueil.
 */
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText, Button, Card } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { SubScreen } from '@/design/subScreen';
import { RHYTHM } from '@/design/rhythm';
import { useI18n } from '@/i18n';
import { fetchOrders } from '@/api/account';
import { statusText } from '@/api/labels';
import { mediaUrl } from '@/api/client';
import { useSession } from '@/state/session';
import { formatMoney } from '@/format/money';

/**
 * Filet de sécurité de l'écran : si le rendu de la liste des commandes lève, expo-router
 * affiche le repli (arabe + français, bouton « عاود ») à la place de l'écran —
 * l'application reste ouverte, l'utilisateur peut revenir. Voir
 * `src/design/AppErrorBoundary.tsx` et la cause du 25/10/2026 (ordre des hooks).
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function OrdersScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { status, account } = useSession();
  const accountId = status === 'signedIn' ? account?.id : undefined;
  const query = useQuery({
    queryKey: ['account', 'orders', accountId],
    enabled: Boolean(accountId),
    queryFn: ({ signal }) => fetchOrders({ signal }),
    staleTime: 30_000,
  });

  const retry = useCallback(() => query.refetch(), [query]);

  return (
    <SubScreen scroll={false} title={t('orders.title')} subtitle={t('orders.subtitle')}>
      {status === 'loading' ? <LoadingBlock /> : !accountId ? (
        <Button label={t('account.signIn')} onPress={() => router.push('/sign-in')} />
      ) : (
      /* Liste virtualisée : l'historique de commandes n'a pas de plafond. */
      <FlatList
        style={styles.list}
        refreshing={query.isRefetching}
        onRefresh={retry}
        data={query.data ?? []}
        keyExtractor={(order) => order.id}
        contentContainerStyle={{
          gap: RHYTHM.related,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          query.isLoading ? (
            <LoadingBlock />
          ) : query.isError ? (
            <ErrorBlock error={query.error} onRetry={retry} />
          ) : null
        }
        ListEmptyComponent={
          !query.isLoading && !query.isError ? (
            <EmptyBlock><AppText variant="body" align="center">{t('orders.empty')}</AppText></EmptyBlock>
          ) : null
        }
        renderItem={({ item: order }) => (
          // Toute la carte ouvre le détail : c'est le geste attendu, et il est
          // annoncé aux lecteurs d'écran par `accessibilityRole`.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${order.orderNumber || order.id} — ${statusText('order', order.status, t)}`}
            onPress={() => router.push(`/orders/${order.id}`)}
            testID={`order-${order.id}`}
          >
            <Card>
              <View style={[styles.row, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                <AppText variant="label" style={styles.orderNumber}>
                  {order.orderNumber || order.id}
                </AppText>
                <AppText variant="caption" color={theme.colors.ink} style={styles.status}>
                  {statusText('order', order.status, t)}
                </AppText>
              </View>
              <AppText variant="caption" color={theme.colors.muted}>
                {t('orders.items', { count: order.itemCount })} · {formatMoney(order.totalTnd)}
              </AppText>
              <AppText variant="caption" color={theme.colors.muted}>
                {t('orders.payment')} : {statusText('payment', order.paymentStatus, t)}
                {order.createdAt ? ` · ${order.createdAt.slice(0, 10)}` : ''}
              </AppText>
              {order.imageUrl ? (
                <AppImage
                  uri={mediaUrl(order.imageUrl)}
                  style={[styles.thumb, { borderRadius: theme.radius.control, borderColor: theme.colors.line }]}
                  contentFit="cover"
                  accessibilityLabel={order.orderNumber || order.id}
                />
              ) : null}
            </Card>
          </Pressable>
        )}
      />
      )}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  row: { justifyContent: 'space-between', alignItems: 'baseline', gap: RHYTHM.tight },
  orderNumber: { flex: 1, minWidth: 0 },
  status: { flexShrink: 1, maxWidth: '50%' },
  thumb: { width: 56, height: 56, borderWidth: StyleSheet.hairlineWidth, marginTop: 6 },
});
