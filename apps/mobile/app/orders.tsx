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
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Card } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useResponsive } from '@/design/layout';
import { useI18n } from '@/i18n';
import { fetchOrders } from '@/api/account';
import { statusText } from '@/api/labels';
import { mediaUrl } from '@/api/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OrdersScreen() {
  const theme = useTheme();
  const { gutter } = useResponsive();
  const t = useI18n().t;
  const insets = useSafeAreaInsets();
  const query = useQuery({
    queryKey: ['account', 'orders'],
    queryFn: ({ signal }) => fetchOrders({ signal }),
    staleTime: 30_000,
  });

  const retry = useCallback(() => query.refetch(), [query]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas, paddingTop: insets.top + theme.space[2] }]}>
      <View style={[styles.header, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center' }}
        >
          <Ionicons
            name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
            size={26}
            color={theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
        <View style={styles.headerText}>
          <AppText variant="title">{t('orders.title')}</AppText>
          <AppText variant="caption" color={theme.colors.muted}>{t('orders.subtitle')}</AppText>
        </View>
      </View>

      {/* Liste virtualisée : l'historique de commandes n'a pas de plafond. */}
      <FlatList
        style={styles.list}
        data={query.data ?? []}
        keyExtractor={(order) => order.id}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + theme.space[4],
          gap: theme.space[2],
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
              <View style={styles.row}>
                <AppText variant="label" weight="bold" style={styles.orderNumber}>
                  {order.orderNumber || order.id}
                </AppText>
                <AppText variant="caption" color={theme.colors.accentText}>
                  {statusText('order', order.status, t)}
                </AppText>
              </View>
              <AppText variant="caption" color={theme.colors.muted}>
                {t('orders.items', { count: order.itemCount })} · {order.totalTnd.toFixed(2)} DT
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  list: { flex: 1 },
  headerText: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumber: { flex: 1 },
  thumb: { width: 56, height: 56, borderWidth: StyleSheet.hairlineWidth, marginTop: 6 },
});
