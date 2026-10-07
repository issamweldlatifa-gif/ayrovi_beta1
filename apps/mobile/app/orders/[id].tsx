/**
 * Détail d'une commande — l'état vu par le serveur, sans rien inventer.
 *
 * Deux règles tenues ici :
 *   • le suivi transporteur est masqué par le serveur tant que la commande n'est
 *     pas expédiée. L'écran n'affiche donc un bloc « suivi » que s'il y a
 *     vraiment quelque chose à suivre ;
 *   • « payé » et « reste à payer » viennent du serveur (`paid_amount_tnd`,
 *     `remainder_tnd`) — jamais recalculés à partir d'un prix affiché.
 */
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { fetchOrderDetail } from '@/api/account';
import { mediaUrl } from '@/api/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';

export default function OrderDetailScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '');

  const order = useQuery({
    queryKey: ['account', 'order', id],
    queryFn: ({ signal }) => fetchOrderDetail(id, { signal }),
    enabled: id.length > 0,
  });

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.canvas }}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + theme.space[2], paddingBottom: insets.bottom + theme.space[5], gap: theme.space[2] },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.ink} />
        </Pressable>
        <AppText variant="title" style={styles.headerTitle}>
          {order.data?.orderNumber || t('order.title')}
        </AppText>
      </View>

      {order.isLoading ? <LoadingBlock /> : null}
      {order.isError ? <ErrorBlock error={order.error} onRetry={() => order.refetch()} /> : null}

      {order.data ? (
        <>
          <Card title={t('order.summary')}>
            <KeyValue label={t('order.status')} value={order.data.status} />
            <KeyValue label={t('order.paymentStatus')} value={order.data.paymentStatus || '—'} />
            {order.data.paymentMethod ? <KeyValue label={t('order.method')} value={order.data.paymentMethod} /> : null}
            <KeyValue label={t('orders.createdAt')} value={order.data.createdAt.slice(0, 10)} />
          </Card>

          <Card title={t('order.items')}>
            {order.data.items.map((item) => (
              <View key={item.id} style={[styles.item, { borderTopColor: theme.colors.line }]}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: mediaUrl(item.imageUrl) }}
                    style={[styles.thumb, { borderRadius: theme.radius.control, borderColor: theme.colors.line }]}
                    resizeMode="cover"
                    accessibilityLabel={item.title}
                  />
                ) : null}
                <View style={styles.itemText}>
                  <AppText variant="label" weight="bold">{item.title || '—'}</AppText>
                  <AppText variant="caption" color={theme.colors.muted}>
                    {item.quantity} × {item.unitPriceTnd.toFixed(2)} DT
                  </AppText>
                  {item.variant ? <AppText variant="caption" color={theme.colors.muted}>{item.variant}</AppText> : null}
                </View>
                <AppText variant="label" weight="bold">{item.totalTnd.toFixed(2)}</AppText>
              </View>
            ))}
          </Card>

          <Card title={t('order.totals')}>
            <KeyValue label={t('orders.total')} value={`${order.data.totalTnd.toFixed(2)} DT`} />
            <KeyValue label={t('order.paid')} value={`${order.data.paidTnd.toFixed(2)} DT`} />
            <KeyValue label={t('order.remainder')} value={`${order.data.remainderTnd.toFixed(2)} DT`} />
            {order.data.invoiceNumber ? (
              <KeyValue label={t('order.invoice')} value={order.data.invoiceNumber} />
            ) : null}
          </Card>

          {order.data.addressLine || order.data.governorate ? (
            <Card title={t('order.deliveryAddress')}>
              <AppText variant="body">{order.data.addressLine}</AppText>
              <AppText variant="caption" color={theme.colors.muted}>{order.data.governorate}</AppText>
            </Card>
          ) : null}

          {/* Suivi : seulement si le serveur a jugé la commande suivable. */}
          {order.data.tracking.trackingNumber || order.data.tracking.carrier ? (
            <Card title={t('order.tracking')}>
              {order.data.tracking.carrier ? <KeyValue label={t('order.carrier')} value={order.data.tracking.carrier} /> : null}
              {order.data.tracking.trackingNumber ? (
                <KeyValue label={t('order.trackingNumber')} value={order.data.tracking.trackingNumber} />
              ) : null}
              {order.data.tracking.trackingUrl ? (
                <Button
                  label={t('order.openTracking')}
                  tone="quiet"
                  onPress={() => { Linking.openURL(order.data!.tracking.trackingUrl).catch(() => {}); }}
                />
              ) : null}
            </Card>
          ) : (
            <Card title={t('order.tracking')}>
              <AppText variant="caption" color={theme.colors.muted}>{t('order.trackingHidden')}</AppText>
            </Card>
          )}

          {order.data.history.length > 0 ? (
            <Card title={t('order.history')}>
              {order.data.history.map((event) => (
                <KeyValue
                  key={event.id || `${event.status}-${event.createdAt}`}
                  label={event.createdAt.slice(0, 16).replace('T', ' ')}
                  value={event.status}
                />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitle: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  itemText: { flex: 1, gap: 2 },
  thumb: { width: 52, height: 52, borderWidth: StyleSheet.hairlineWidth },
});
