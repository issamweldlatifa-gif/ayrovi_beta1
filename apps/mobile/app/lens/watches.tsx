/**
 * Lens — P4، الشريحة 2: مراقبة الأسعار (تلزم حساب عميل).
 *
 * الخادم يعيد قراءة صفحة التاجر كل ~6 ساعات ويبعث إشعاراً كي ينزل السعر.
 * هنا نعرض **حالة المراقبة كما هي**: آخر سعر، العملة، آخر تحقّق، والسقف إن حُدّد.
 *
 *  • كي ما كانش حساب: الخادم يردّ `401` — والعرض يقول «سجّل الدخول»، بلا ما
 *    يدّعي أن المراقبة موجودة.
 *  • الحذف حقيقي: `DELETE /watch/:id` ثم إعادة قراءة القائمة من الخادم (موش
 *    حذف من شاشة).
 */
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import { fetchLensWatches, removeLensWatch } from '@/api/lens';

export default function LensWatchesScreen() {
  const { t, locale } = useI18n();
  const [note, setNote] = useState('');

  const watches = useQuery({
    queryKey: ['lens', 'watches'],
    queryFn: ({ signal }) => fetchLensWatches({ signal }),
    staleTime: 0,
    retry: 0,
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeLensWatch(id),
    onSuccess: () => { setNote(t('lens.watchRemoved')); watches.refetch(); },
    onError: (error) => {
      // نص الخطأ الداخلي فرنسي (رسالة الخادم ولا رسالة العميل) — نعرضو
      // باللغة اللي اختارها المستعمل، ونخبّيو النص الخام.
      setNote(isApiError(error) ? userMessage(error)[locale] : t('lens.failed'));
    },
  });

  const reload = useCallback(() => { watches.refetch(); }, [watches]);

  /** 401 = ما فماش جلسة عميل: نقولوها مع باب للدخول، ما نعرضوش قائمة فارغة كذّابة. */
  const needsSignIn = isApiError(watches.error) && (watches.error.status === 401 || watches.error.status === 403);

  return (
    <SubScreen title={t('lens.watchTitle')} fallback="/lens" onRefresh={reload} refreshing={watches.isFetching && !watches.isPending}>
      {watches.isPending ? (
        <LoadingBlock label={{ fr: 'Chargement des veilles…', ar: 'جارٍ تحميل المراقبات…' }} />
      ) : needsSignIn ? (
        <Card>
          <AppText variant="body">{t('lens.watchSignIn')}</AppText>
          <Button label={t('tabs.account')} onPress={() => router.push('/sign-in')} />
        </Card>
      ) : watches.isError ? (
        <ErrorBlock error={watches.error} onRetry={reload} />
      ) : (watches.data ?? []).length === 0 ? (
        <EmptyBlock>{t('lens.watchEmpty')}</EmptyBlock>
      ) : (
        <>
          {note ? <AppText variant="caption" accessibilityRole="alert">{note}</AppText> : null}
          {(watches.data ?? []).map((watch) => (
            <Card key={watch.id} title={watch.title || watch.url} hint={watch.source || undefined}>
              {watch.lastPriceTnd != null ? (
                <KeyValue label={t('lens.watchLastPrice')} value={`${watch.lastPriceTnd.toFixed(2)} TND`} />
              ) : (
                <KeyValue label={t('lens.watchLastPrice')} value={t('lens.watchNeverChecked')} />
              )}
              {watch.lastPrice != null ? (
                <KeyValue
                  label={t('aywebs.sourcePrice')}
                  value={`${watch.lastPrice} ${watch.lastCurrency}`.trim()}
                />
              ) : null}
              {watch.targetPriceTnd != null ? (
                <KeyValue label={t('lens.watchTarget')} value={`${watch.targetPriceTnd.toFixed(2)} TND`} />
              ) : null}
              <KeyValue label={t('lens.watchCheckedAt')} value={watch.lastCheckedAt || '—'} />
              <View style={styles.row}>
                <Button
                  label={t('lens.watchRemove')}
                  tone="quiet"
                  busy={remove.isPending && remove.variables === watch.id}
                  onPress={() => remove.mutate(watch.id)}
                />
              </View>
            </Card>
          ))}
        </>
      )}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
