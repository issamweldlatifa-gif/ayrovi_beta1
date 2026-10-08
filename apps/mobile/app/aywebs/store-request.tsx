/**
 * AYWEBs — طلب إضافة متجر جديد (§38).
 *
 * يجي من شاشة AYWEBs كي التحليل يقول `registered: false`: الرابط عمومي (HTTPS)
 * بصح المتجر موش في القائمة. بدل ما نقولو «ما نعرفوش»، نبعثو طلباً للفريق
 * ومعاه **علاش** العميل يحبّو (`intent`) — وهذا اللي يخلي القرار ممكن.
 *
 * نفس قواعد طلب الشراء: شرط الخادم مفروض هنا (intent ولا notes)، والحالة
 * المعروضة حالة الخادم، والسجلّ من الخادم.
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
  createAyWebsStoreRequest, fetchAyWebsStoreRequests, type AyWebsStoreRequest,
} from '@/api/aywebs';
import { useAyWebsSessionId } from '@/features/aywebs/session';

export default function AyWebsStoreRequestScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const sessionId = useAyWebsSessionId();

  const params = useLocalSearchParams<{ url?: string; storeName?: string }>();
  const [storeUrl, setStoreUrl] = useState(String(params.url ?? ''));
  const [storeName, setStoreName] = useState(String(params.storeName ?? ''));
  const [intent, setIntent] = useState('');
  const [notes, setNotes] = useState('');
  const [created, setCreated] = useState<AyWebsStoreRequest | null>(null);
  const [error, setError] = useState('');

  const history = useQuery({
    queryKey: ['aywebs', 'store-requests'],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyWebsStoreRequests({ sessionId, signal }),
    staleTime: 0,
  });

  /** نفس شرط الخادم: رابط HTTPS + (ما تحبّ تشري ولا ملاحظة). */
  const ready = useMemo(
    () => storeUrl.trim().length > 8 && Boolean(intent.trim() || notes.trim()) && Boolean(sessionId),
    [intent, notes, sessionId, storeUrl],
  );

  const submit = useMutation({
    mutationFn: () => createAyWebsStoreRequest({
      storeUrl: storeUrl.trim(),
      storeName: storeName.trim() || undefined,
      intent: intent.trim() || undefined,
      notes: notes.trim() || undefined,
    }, { sessionId }),
    onSuccess: (request) => {
      setError('');
      setCreated(request);
      history.refetch();
    },
    onError: (caught) => {
      setError(isApiError(caught) ? userMessage(caught)[locale] : t('aywebs.captureFailed'));
    },
  });

  const statusText = (status: string): string => {
    switch (status) {
      case 'SUBMITTED': return t('aywebs.storeStatus.SUBMITTED');
      case 'UNDER_REVIEW': return t('aywebs.storeStatus.UNDER_REVIEW');
      case 'APPROVED': return t('aywebs.storeStatus.APPROVED');
      case 'REJECTED': return t('aywebs.storeStatus.REJECTED');
      case 'PROMOTED': return t('aywebs.storeStatus.PROMOTED');
      default: return status;
    }
  };

  const reload = useCallback(() => { history.refetch(); }, [history]);

  return (
    <SubScreen
      title={t('aywebs.storeReqTitle')}
      subtitle={t('aywebs.storeReqHint')}
      fallback="/aywebs"
      onRefresh={reload}
      refreshing={history.isFetching && !history.isPending}
    >
      <Card>
        <Field
          label={t('aywebs.storeReqUrl')}
          accessibilityLabel={t('aywebs.storeReqUrl')}
          value={storeUrl}
          onChangeText={setStoreUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          placeholder="https://…"
        />
        <Field
          label={t('aywebs.storeReqName')}
          accessibilityLabel={t('aywebs.storeReqName')}
          value={storeName}
          onChangeText={setStoreName}
          placeholder={t('aywebs.storeReqNamePlaceholder')}
        />
        <Field
          label={t('aywebs.storeReqIntent')}
          accessibilityLabel={t('aywebs.storeReqIntent')}
          value={intent}
          onChangeText={setIntent}
          placeholder={t('aywebs.storeReqIntentPlaceholder')}
          multiline
        />
        <Field label={t('aywebs.reqNotes')} accessibilityLabel={t('aywebs.reqNotes')} value={notes} onChangeText={setNotes} multiline />
        {!ready ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.storeReqNeedIntent')}</AppText>
        ) : null}
        {error ? (
          <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{error}</AppText>
        ) : null}
        <Button
          label={t('aywebs.storeReqSubmit')}
          onPress={() => submit.mutate()}
          busy={submit.isPending}
          disabled={!ready}
        />
      </Card>

      {created ? (
        <Card title={t('aywebs.storeReqCreated')}>
          <KeyValue label={t('aywebs.store')} value={created.storeName || created.sourceDomain} />
          <KeyValue label={t('aywebs.reqStatusLabel')} value={statusText(created.status)} />
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.storeReqReview')}</AppText>
        </Card>
      ) : null}

      <Card title={t('aywebs.storeReqHistory')}>
        {!sessionId || history.isPending ? (
          <LoadingBlock labelKey="loading.requests" />
        ) : history.isError ? (
          <ErrorBlock error={history.error} onRetry={reload} />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyBlock>{t('aywebs.reqHistoryEmpty')}</EmptyBlock>
        ) : (
          (history.data ?? []).map((request) => (
            <View key={request.id} style={[styles.row, { borderTopColor: theme.colors.line }]}>
              <KeyValue label={t('aywebs.store')} value={request.storeName || request.sourceDomain} />
              <KeyValue label={t('aywebs.reqStatusLabel')} value={statusText(request.status)} />
              {request.intent ? (
                <AppText variant="caption" color={theme.colors.muted}>{request.intent}</AppText>
              ) : null}
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
