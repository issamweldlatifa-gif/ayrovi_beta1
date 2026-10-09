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
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button, Card, Field, KeyValue } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useI18n } from '@/i18n';
import { fetchOrderDetail } from '@/api/account';
import { statusText } from '@/api/labels';
import { mediaUrl } from '@/api/client';
import { isApiError, userMessage } from '@/api/errors';
import { initiateCardPayment } from '@/api/checkout';
import { depositActionable, selectDepositMethod, uploadDepositProof, type DepositMethod } from '@/api/payments';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';

export default function OrderDetailScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '');

  const { locale } = useI18n();
  const [payNote, setPayNote] = useState('');
  const [reference, setReference] = useState('');

  const order = useQuery({
    queryKey: ['account', 'order', id],
    queryFn: ({ signal }) => fetchOrderDetail(id, { signal }),
    enabled: id.length > 0,
  });

  const reload = useCallback(() => { order.refetch(); }, [order]);

  /** رسالة واحدة للخلاص: نصّ الخادم كما هو، وإلا جملة عامة. */
  const onPayError = useCallback((error: unknown) => {
    setPayNote(isApiError(error) ? userMessage(error)[locale] : t('order.payFailed'));
  }, [locale, t]);

  const chooseMethod = useMutation({
    mutationFn: (method: DepositMethod) => selectDepositMethod({ orderId: id, method }),
    onSuccess: (selection) => {
      setPayNote('');
      // الخادم رجّع القسط الجديد: نعرضوه كما هو، وما نحسبوش عربوناً هنا.
      if (selection.quote.amountTND != null) {
        setPayNote(`${t('order.depositDue')}: ${selection.quote.amountTND.toFixed(2)} TND`);
      }
      reload();
    },
    onError: onPayError,
  });

  const payByCard = useMutation({
    mutationFn: async () => {
      const payment = await initiateCardPayment(id);
      await WebBrowser.openBrowserAsync(payment.payUrl);
      return payment;
    },
    onSuccess: () => { setPayNote(t('order.cardOpened')); reload(); },
    onError: onPayError,
  });

  const sendProof = useMutation({
    mutationFn: async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PROOF_PERMISSION_DENIED' });
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (picked.canceled || !picked.assets?.length) return null;
      const asset = picked.assets[0];
      const mimeType = String(asset.mimeType ?? '').toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
      return uploadDepositProof({
        orderId: id, uri: asset.uri, mimeType, fileName: asset.fileName ?? undefined,
        transferReference: reference,
      });
    },
    onSuccess: (result) => {
      if (!result) return;
      setPayNote(`${t('order.proofSent')} — ${result.proofStatus}`);
      reload();
    },
    onError: onPayError,
  });

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.canvas }}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + theme.space[2], paddingBottom: insets.bottom + theme.space[5], gap: theme.space[2] },
      ]}
    >
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
        <AppText variant="title" style={styles.headerTitle}>
          {order.data?.orderNumber || t('order.title')}
        </AppText>
      </View>

      {order.isLoading ? <LoadingBlock /> : null}
      {order.isError ? <ErrorBlock error={order.error} onRetry={() => order.refetch()} /> : null}

      {order.data ? (
        <>
          <Card title={t('order.summary')}>
            <KeyValue label={t('order.status')} value={statusText('order', order.data.status, t)} />
            <KeyValue label={t('order.paymentStatus')} value={order.data.paymentStatus || '—'} />
            {order.data.paymentMethod ? <KeyValue label={t('order.method')} value={order.data.paymentMethod} /> : null}
            <KeyValue label={t('orders.createdAt')} value={order.data.createdAt.slice(0, 10)} />
          </Card>

          <Card title={t('order.items')}>
            {order.data.items.map((item) => (
              <View key={item.id} style={[styles.item, { borderTopColor: theme.colors.line }]}>
                {item.imageUrl ? (
                  <AppImage
                    uri={mediaUrl(item.imageUrl)}
                    style={[styles.thumb, { borderRadius: theme.radius.control, borderColor: theme.colors.line }]}
                    contentFit="cover"
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

          {/* الخلاص: يتعلّق بمعرّف الطلب — والوسائل من قائمة الخادم. */}
          {(() => {
            const gate = depositActionable({
              status: order.data.status,
              paymentStatus: order.data.paymentStatus,
              paymentMethod: order.data.paymentMethod,
            });
            const choices = order.data.paymentOptions.choices;
            if (!gate.canSelectMethod && !gate.canUploadProof && !gate.canPayByCard) return null;
            return (
              <Card title={t('order.payment')} hint={t('order.paymentHint')}>
                <KeyValue label={t('order.paymentStatus')} value={order.data.paymentStatus || '—'} />
                {order.data.remainderTnd > 0 ? (
                  <KeyValue label={t('order.remainder')} value={`${order.data.remainderTnd.toFixed(2)} DT`} />
                ) : null}

                {gate.canSelectMethod ? (
                  <View style={styles.payRow}>
                    {choices.map((choice) => {
                      const active = order.data!.paymentMethod === choice;
                      return (
                        <Pressable
                          key={choice}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          disabled={chooseMethod.isPending}
                          onPress={() => chooseMethod.mutate(choice as DepositMethod)}
                          style={[styles.payChip, {
                            borderColor: active ? theme.colors.action : theme.colors.line,
                            backgroundColor: active ? theme.colors.action : theme.colors.canvas,
                            borderRadius: theme.radius.control,
                            minHeight: theme.geometry.minTarget,
                          }]}
                        >
                          <AppText variant="label" color={active ? theme.colors.onAction : theme.colors.ink}>
                            {t(`pay.${choice}` as never)}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {gate.canPayByCard ? (
                  <Button
                    label={t('order.payCard')}
                    busy={payByCard.isPending}
                    disabled={payByCard.isPending}
                    onPress={() => payByCard.mutate()}
                  />
                ) : null}

                {gate.canUploadProof ? (
                  <>
                    <AppText variant="caption" color={theme.colors.muted}>{t('order.transferHint')}</AppText>
                    {order.data.transfer.bankRib && order.data.paymentMethod === 'BANK_TRANSFER' ? (
                      <KeyValue label={t('checkout.bankRib')} value={order.data.transfer.bankRib} />
                    ) : null}
                    {order.data.transfer.posteAccount && order.data.paymentMethod === 'POSTE' ? (
                      <KeyValue label={t('checkout.posteAccount')} value={order.data.transfer.posteAccount} />
                    ) : null}
                    <Field
                      label={t('order.transferReference')}
                      value={reference}
                      onChangeText={setReference}
                      autoCapitalize="characters"
                    />
                    <Button
                      label={t('order.sendProof')}
                      tone="quiet"
                      busy={sendProof.isPending}
                      disabled={sendProof.isPending || reference.trim().length < 3}
                      onPress={() => sendProof.mutate()}
                    />
                    <AppText variant="caption" color={theme.colors.muted}>{t('order.proofFormats')}</AppText>
                  </>
                ) : null}

                {payNote ? (
                  <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{payNote}</AppText>
                ) : null}
              </Card>
            );
          })()}

          {order.data.history.length > 0 ? (
            <Card title={t('order.history')}>
              {order.data.history.map((event) => (
                <KeyValue
                  key={event.id || `${event.status}-${event.createdAt}`}
                  label={event.createdAt.slice(0, 16).replace('T', ' ')}
                  value={statusText('order', event.status, t)}
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
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  payChip: { borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', minWidth: 96 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitle: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  itemText: { flex: 1, gap: 2 },
  thumb: { width: 52, height: 52, borderWidth: StyleSheet.hairlineWidth },
});
