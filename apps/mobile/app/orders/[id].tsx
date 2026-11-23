/** Détail d’une commande : état, coordonnées et montants tels que fournis par le serveur. */
import { Fragment, useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button, Field, KeyValue } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useResponsive } from '@/design/layout';
import { useI18n } from '@/i18n';
import { fetchOrderDetail, requestInvoiceLink } from '@/api/account';
import { statusText } from '@/api/labels';
import { apiUrl, mediaUrl } from '@/api/client';
import { isApiError, userMessage } from '@/api/errors';
import { initiateCardPayment } from '@/api/checkout';
import { depositActionable, selectDepositMethod, uploadDepositProof, type DepositMethod } from '@/api/payments';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { useSession } from '@/state/session';
import Ionicons from '@expo/vector-icons/Ionicons';
import { OrderFact, OrderHelp, OrderSection, OrderShell } from '@/features/orders/OrderLayout';
import { formatOrderDate, orderStep } from '@/features/orders/orderPresentation';
import { formatMoney } from '@/format/money';

/**
 * Filet de sécurité de l'écran : si le rendu de le détail d’une commande lève, expo-router
 * affiche le repli (arabe + français, bouton « عاود ») à la place de l'écran —
 * l'application reste ouverte, l'utilisateur peut revenir. Voir
 * `src/design/AppErrorBoundary.tsx` et la cause du 25/10/2026 (ordre des hooks).
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function OrderDetailScreen() {
  const theme = useTheme();
  const { gutter } = useResponsive();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '');

  const [payNote, setPayNote] = useState('');
  const [reference, setReference] = useState('');
  const [helpKey, setHelpKey] = useState<string | null>(null);

  const { account, status } = useSession();
  const accountId = status === 'signedIn' ? account?.id : undefined;
  const order = useQuery({
    queryKey: ['account', 'order', accountId, id],
    queryFn: ({ signal }) => fetchOrderDetail(id, { signal }),
    enabled: Boolean(accountId && id),
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
        setPayNote(`${t('order.depositDue')}: ${formatMoney(selection.quote.amountTND)}`);
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

  /** Le PDF s'ouvre dans le lecteur du téléphone, jamais dans une WebView sans en-têtes. */
  const downloadInvoice = useMutation({
    mutationFn: async () => {
      const link = await requestInvoiceLink(id);
      if (!link.url) throw new Error('INVOICE_LINK_EMPTY');
      await Linking.openURL(apiUrl(link.url));
      return link;
    },
    onSuccess: () => setPayNote(t('order.invoiceOpened')),
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

  const data = accountId ? order.data : undefined;
  const direction = rowDirectionFor(theme.isRTL);
  const step = data ? orderStep(data.status) : null;
  const ownerKey = accountId ? `${accountId}:${id}` : null;
  const bank = data?.paymentMethod === 'BANK_TRANSFER' && data.transfer.bankRib ? data.transfer.bankRib :
    data?.paymentMethod === 'POSTE' && data.transfer.posteAccount ? data.transfer.posteAccount : null;
  const showTransfer = bank && data && !['PAID', 'REFUNDED'].includes(data.paymentStatus) &&
    ['AWAITING_DEPOSIT', 'AWAITING_PAYMENT_VERIFICATION'].includes(data.status);

  return <OrderShell title={t('order.title')} fallback="/orders">
    <ScrollView testID="order-detail-scroll"
      refreshControl={accountId && id ? <RefreshControl refreshing={order.isRefetching} onRefresh={reload} /> : undefined}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter, paddingBottom: insets.bottom + 32 }]}>
      {status === 'loading' || order.isLoading ? <LoadingBlock /> : !accountId ? (
        <Button label={t('account.signIn')} onPress={() => router.push('/sign-in')} />
      ) : null}
      {accountId && order.isError ? <ErrorBlock error={order.error} onRetry={reload} /> : null}
      {data ? <>
        <View style={[styles.facts, { flexDirection: direction }]}>
          <OrderFact label={t('orders.number')} value={data.orderNumber || data.id} />
          <OrderFact label={t('orders.createdAt')} value={formatOrderDate(data.createdAt, locale)} />
          <OrderFact label={t('order.method')} value={statusText('method', data.paymentMethod, t)} />
          <OrderFact label={t('order.paymentStatus')} value={statusText('payment', data.paymentStatus, t)} />
        </View>
        {showTransfer ? <OrderSection title={t('order.transferDetails')}>
          <View testID="order-transfer-details" style={[styles.transfer, { backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.control }]}>
            {data.transfer.companyName ? <KeyValue label={t('order.beneficiary')} value={data.transfer.companyName} /> : null}
            <KeyValue label={t(data.paymentMethod === 'BANK_TRANSFER' ? 'checkout.bankRib' : 'checkout.posteAccount')} value={bank} />
            <KeyValue label={t('orders.number')} value={data.orderNumber || data.id} />
          </View>
        </OrderSection> : null}
        {/* الخلاص: يتعلّق بمعرّف الطلب — والوسائل من قائمة الخادم. */}
        {(() => {
          const gate = depositActionable({
            status: data.status,
            paymentStatus: data.paymentStatus,
            paymentMethod: data.paymentMethod,
          });
          const choices = data.paymentOptions.choices;
          if (!gate.canSelectMethod && !gate.canUploadProof && !gate.canPayByCard) return null;
          return (
            <OrderSection title={t('order.payment')}>
              <AppText variant="bodySmall" color={theme.colors.muted}>{t('order.paymentHint')}</AppText>
              {data.remainderTnd > 0 ? (
                <KeyValue label={t('order.remainder')} value={formatMoney(data.remainderTnd)} />
              ) : null}

              {gate.canSelectMethod ? (
                <View style={[styles.payRow, { flexDirection: direction }]}>
                  {choices.map((choice) => {
                    const active = data.paymentMethod === choice;
                    return (
                      <Pressable
                        key={choice}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        disabled={chooseMethod.isPending}
                        onPress={() => chooseMethod.mutate(choice as DepositMethod)}
                        style={[styles.payChip, {
                          borderColor: active ? theme.colors.action : theme.colors.line,
                          backgroundColor: active ? theme.colors.accentSoft : theme.colors.canvas,
                          borderRadius: theme.radius.control,
                          minHeight: theme.geometry.minTarget,
                        }]}
                      >
                        <AppText variant="label" color={active ? theme.colors.onAccentSoft : theme.colors.ink}>
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
                  <AppText variant="caption" color={theme.colors.muted}>{t(bank ? 'order.transferHint' : 'order.transferUnavailable')}</AppText>
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
            </OrderSection>
          );
        })()}

        <OrderSection title={t('order.tracking')}>
          <AppText variant="bodyStrong" testID="order-current-status">{statusText('order', data.status, t)}</AppText>
          {step !== null ? <View testID="order-progress" style={[styles.progress, { flexDirection: direction }]}
            accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 5, now: step + 1, text: statusText('order', data.status, t) }}>
            {(['receipt-outline', 'cube-outline', 'airplane-outline', 'navigate-outline', 'checkmark-outline'] as const).map((icon, i) =>
              <Fragment key={icon}>
                {i > 0 ? <View style={[styles.connector, { backgroundColor: i <= step ? theme.colors.ink : theme.colors.line }]} /> : null}
                <View style={[styles.step, { backgroundColor: i === step ? theme.colors.accentSoft : theme.colors.canvas,
                  borderColor: i <= step ? theme.colors.ink : theme.colors.line, borderWidth: i === step ? 2 : 1 }]}>
                  <Ionicons name={icon} size={theme.iconSize.sm} color={i === step ? theme.colors.onAccentSoft : theme.colors.ink} accessibilityElementsHidden />
                </View>
              </Fragment>)}
          </View> : null}
          {data.tracking.trackingNumber || data.tracking.carrier || data.tracking.trackingUrl ? <>
            {data.tracking.carrier ? <KeyValue label={t('order.carrier')} value={data.tracking.carrier} /> : null}
            {data.tracking.trackingNumber ? <KeyValue label={t('order.trackingNumber')} value={data.tracking.trackingNumber} /> : null}
            {data.tracking.trackingUrl ? <Button label={t('order.openTracking')} tone="quiet"
              onPress={() => { void Linking.openURL(data.tracking.trackingUrl).catch(() => {}); }} /> : null}
          </> : step !== null && step < 2 ? <AppText variant="caption" color={theme.colors.muted}>{t('order.trackingHidden')}</AppText> : null}
        </OrderSection>
        {data.items.length ? <OrderSection title={t('order.items')}>
          {data.items.map(item => <View key={item.id} style={[styles.item, { flexDirection: direction }]}>
            {item.imageUrl ? <AppImage uri={mediaUrl(item.imageUrl)} decorative contentFit="contain"
              style={[styles.thumb, { backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.control }]} /> : null}
            <View style={styles.itemText}>
              <AppText variant="bodyStrong">{item.title || '—'}</AppText>
              {item.variant ? <AppText variant="bodySmall" color={theme.colors.muted}>{item.variant}</AppText> : null}
              <AppText variant="caption" color={theme.colors.muted}>{item.quantity} × {formatMoney(item.unitPriceTnd)}</AppText>
              <AppText variant="bodyStrong">{formatMoney(item.totalTnd)}</AppText>
            </View>
          </View>)}
        </OrderSection> : null}
        <OrderSection title={t('order.totals')}>
          {([
            ['subtotal', 'checkout.subtotalProducts'], ['shipping', 'checkout.delivery'], ['customs', 'order.customs'],
            ['service', 'order.service'], ['express', 'order.express'], ['discount', 'order.discount'],
          ] as const).map(([key, label]) => {
            const amount = data.breakdown[key];
            return amount !== undefined && (amount !== 0 || key === 'subtotal' || key === 'shipping') ?
              <KeyValue key={key} label={t(label)} value={formatMoney(key === 'discount' ? -Math.abs(amount) : amount)} /> : null;
          })}
          <KeyValue label={t('orders.total')} value={formatMoney(data.totalTnd)} />
          <KeyValue label={t('order.paid')} value={formatMoney(data.paidTnd)} />
          <KeyValue label={t('order.remainder')} value={formatMoney(data.remainderTnd)} />
          {data.invoiceNumber ? <KeyValue label={t('order.invoice')} value={data.invoiceNumber} /> : null}
          {data.invoiceNumber ? <Button label={t('order.invoiceDownload')} tone="quiet" block
            busy={downloadInvoice.isPending} testID="order-invoice-download"
            onPress={() => downloadInvoice.mutate()} /> : null}
        </OrderSection>
        {data.addressLine || data.governorate ? <OrderSection title={t('order.deliveryAddress')}>
          {data.addressLine ? <AppText>{data.addressLine}</AppText> : null}
          {data.governorate ? <AppText color={theme.colors.muted}>{data.governorate}</AppText> : null}
        </OrderSection> : null}
        {data.history.length > 0 ? <OrderSection title={t('order.history')}>
          {data.history.map(event => <KeyValue key={event.id || `${event.status}-${event.createdAt}`}
            label={formatOrderDate(event.createdAt, locale)} value={statusText('order', event.status, t)} />)}
        </OrderSection> : null}
        <Button label={t('order.help')} tone="quiet" block size="lg" onPress={() => setHelpKey(ownerKey)} />
      </> : null}
    </ScrollView>
    {data && ownerKey && helpKey === ownerKey ? <OrderHelp title={t('order.help')} orderNumber={data.orderNumber || data.id} onClose={() => setHelpKey(null)} /> : null}
  </OrderShell>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingTop: 24, gap: 24 },
  facts: { flexWrap: 'wrap', gap: 16 }, transfer: { padding: 12, gap: 4 },
  progress: { justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  connector: { flex: 1, height: StyleSheet.hairlineWidth },
  step: { width: 40, height: 40, borderRadius: RADIUS.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  payRow: { flexWrap: 'wrap', gap: 8, marginTop: 6 },
  payChip: { borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', minWidth: 96 },
  item: { alignItems: 'flex-start', gap: 12, paddingVertical: 8 }, itemText: { flex: 1, gap: 4 },
  thumb: { width: 80, height: 96, overflow: 'hidden' },
});
