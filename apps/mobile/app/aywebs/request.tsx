/**
 * AYWEBs — طلب شراء بالنيابة (§37).
 *
 * كي الخادم يقول `purchase_mode ≠ SUPPORTED` (متجر ما يسمحش بالشراء المباشر)،
 * المنتوج ما يتزادش للسلّة: يتبعث **طلب** لمراجعة بشرية، ومعاه كل ما يلزم
 * للقرار (الرابط، الاسم، الاختيار، الشرط، الملاحظات).
 *
 * القواعد هنا:
 *  • الطلب بلا معطيات ما ينبعثش: نفس شرط الخادم (`name` ولا `variant` ولا
 *    `requirements`)، والزرّ يبقى معطّلاً والسبب مكتوب.
 *  • الحالة الّي نشوفوها هي حالة الخادم (`status` + `next_action`) — ما نعلنوش
 *    «تمّت الموافقة»، ما فماش وعد.
 *  • السجلّ (الطلبات السابقة) من الخادم كذلك، بالجلسة نفسها.
 */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';

import { AppText, Button, Card, Field, KeyValue } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  createAyWebsPurchaseRequest, fetchAyWebsPurchaseRequests,
  type AyWebsNextAction, type AyWebsPurchaseRequest,
} from '@/api/aywebs';
import { useAyWebsSessionId } from '@/features/aywebs/session';

export default function AyWebsPurchaseRequestScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const sessionId = useAyWebsSessionId();

  const params = useLocalSearchParams<{ url?: string; title?: string; storeId?: string }>();
  const [productUrl, setProductUrl] = useState(String(params.url ?? ''));
  const [productName, setProductName] = useState(String(params.title ?? ''));
  const [variant, setVariant] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [requirements, setRequirements] = useState('');
  const [notes, setNotes] = useState('');
  const [created, setCreated] = useState<AyWebsPurchaseRequest | null>(null);
  const [error, setError] = useState('');

  const history = useQuery({
    queryKey: ['aywebs', 'purchase-requests'],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyWebsPurchaseRequests({ sessionId, signal }),
    staleTime: 0,
  });

  /**
   * نفس شرط الخادم حرفياً: رابط + (اسم منتوج ولا اختيار ولا شرط).
   * بلا هذا، الخادم يرفض — فنمنعو الضغطة من الأصل ونقولو السبب.
   */
  const ready = useMemo(() => {
    const hasUrl = productUrl.trim().length > 8;
    const hasDetail = Boolean(productName.trim() || variant.trim() || requirements.trim());
    return hasUrl && hasDetail && Boolean(sessionId);
  }, [productName, productUrl, requirements, sessionId, variant]);

  const submit = useMutation({
    mutationFn: () => createAyWebsPurchaseRequest({
      productUrl: productUrl.trim(),
      productName: productName.trim() || undefined,
      variant: variant.trim() ? { variant: variant.trim() } : null,
      quantity: Number(quantity) > 0 ? Number(quantity) : 1,
      requirements: requirements.trim() || undefined,
      customerNotes: notes.trim() || undefined,
      storeId: String(params.storeId ?? '') || undefined,
    }, { sessionId }),
    onSuccess: (request) => {
      setError('');
      setCreated(request);
      // السجلّ يتبدّل: نعاودو نقراوه من الخادم، ما نزيدوش سطر محلي.
      history.refetch();
    },
    onError: (caught) => {
      setError(isApiError(caught) ? userMessage(caught)[locale] : t('aywebs.captureFailed'));
    },
  });

  const statusText = (status: string): string => {
    switch (status) {
      case 'SUBMITTED': return t('aywebs.reqStatus.SUBMITTED');
      case 'UNDER_REVIEW': return t('aywebs.reqStatus.UNDER_REVIEW');
      case 'APPROVED': return t('aywebs.reqStatus.APPROVED');
      case 'REJECTED': return t('aywebs.reqStatus.REJECTED');
      case 'ORDER_READY': return t('aywebs.reqStatus.ORDER_READY');
      default: return status;
    }
  };

  const nextActionText = (action: AyWebsNextAction): string => {
    switch (action) {
      case 'WAIT_FOR_REVIEW': return t('aywebs.reqNext.WAIT_FOR_REVIEW');
      case 'PROVIDE_MORE_DETAILS': return t('aywebs.reqNext.PROVIDE_MORE_DETAILS');
      case 'VIEW_ORDER': return t('aywebs.reqNext.VIEW_ORDER');
      case 'CONTACT_SUPPORT': return t('aywebs.reqNext.CONTACT_SUPPORT');
      default: return '';
    }
  };

  const reload = useCallback(() => { history.refetch(); }, [history]);

  return (
    <SubScreen
      title={t('aywebs.reqTitle')}
      subtitle={t('aywebs.reqHint')}
      fallback="/aywebs"
      onRefresh={reload}
      refreshing={history.isFetching && !history.isPending}
    >
      <Card>
        <Field
          label={t('aywebs.reqProductUrl')}
          value={productUrl}
          onChangeText={setProductUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          placeholder="https://…"
        />
        <Field
          label={t('aywebs.reqProductName')}
          value={productName}
          onChangeText={setProductName}
          placeholder={t('aywebs.reqProductNamePlaceholder')}
        />
        <Field
          label={t('aywebs.reqVariant')}
          value={variant}
          onChangeText={setVariant}
          placeholder={t('aywebs.reqVariantPlaceholder')}
        />
        <Field
          label={t('aywebs.quantity')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
        />
        <Field
          label={t('aywebs.reqRequirements')}
          value={requirements}
          onChangeText={setRequirements}
          placeholder={t('aywebs.reqRequirementsPlaceholder')}
          multiline
        />
        <Field
          label={t('aywebs.reqNotes')}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        {!ready ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.reqNeedDetail')}</AppText>
        ) : null}
        {error ? (
          <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">{error}</AppText>
        ) : null}
        <Button
          label={t('aywebs.reqSubmit')}
          onPress={() => submit.mutate()}
          busy={submit.isPending}
          disabled={!ready}
        />
      </Card>

      {created ? (
        <Card title={t('aywebs.reqCreated')}>
          <KeyValue label={t('aywebs.reqNumber')} value={created.requestNumber} />
          <KeyValue label={t('aywebs.reqStatusLabel')} value={statusText(created.status)} />
          <KeyValue label={t('aywebs.store')} value={created.storeName || created.sourceDomain || created.storeId} />
          {created.nextAction ? (
            <AppText variant="caption" color={theme.colors.muted}>{nextActionText(created.nextAction)}</AppText>
          ) : null}
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.reqHumanReview')}</AppText>
        </Card>
      ) : null}

      <Card title={t('aywebs.reqHistory')}>
        {!sessionId || history.isPending ? (
          <LoadingBlock label={{ fr: 'Chargement des demandes…', ar: 'جارٍ تحميل الطلبات…' }} />
        ) : history.isError ? (
          <ErrorBlock error={history.error} onRetry={reload} />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyBlock>{t('aywebs.reqHistoryEmpty')}</EmptyBlock>
        ) : (
          (history.data ?? []).map((request) => (
            <View key={request.id} style={[styles.row, { borderTopColor: theme.colors.line }]}>
              <KeyValue label={t('aywebs.reqNumber')} value={request.requestNumber} />
              <KeyValue label={t('aywebs.reqStatusLabel')} value={statusText(request.status)} />
              <AppText variant="caption" color={theme.colors.muted}>
                {request.productName || request.productUrl}
              </AppText>
              {request.decisionNote ? (
                <AppText variant="caption" color={theme.colors.muted}>{request.decisionNote}</AppText>
              ) : null}
            </View>
          ))
        )}
      </Card>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 2 },
});
