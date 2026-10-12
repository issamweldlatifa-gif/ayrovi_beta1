/**
 * طلب مراجعة يدوية لمنتج Lens لا يُطلب مباشرة (مقاس/لون غير متطابق، أو عرض ناقص).
 *
 *  • نفس عقد الخادم: `POST /api/ayrovix/review-request` بمعرّف الجلسة، ثم متابعة الحالة.
 *  • الخادم يقبل رقم هاتف أو بريداً صالحاً؛ الرفض يُعرض بسببه.
 *  • لا نعرض سعراً مقترحاً إلا إن أرسله الخادم.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Field } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { ApiError } from '@/api/errors';
import {
  getManualReview, requestManualReview, type LensCandidate, type LensReviewRequest, type LensReviewStatus,
} from '@/api/lens';

const STATUS_KEY: Record<LensReviewStatus, TranslationKey> = {
  PENDING: 'lens.review.status.PENDING',
  IN_REVIEW: 'lens.review.status.IN_REVIEW',
  QUOTED: 'lens.review.status.QUOTED',
  REJECTED: 'lens.review.status.REJECTED',
  CANCELLED: 'lens.review.status.CANCELLED',
};

const REFUSAL_KEY: Record<string, TranslationKey> = {
  CONTACT_REQUIRED: 'lens.review.contactRequired',
  INVALID_PRODUCT: 'lens.review.invalidProduct',
  INVALID_SESSION: 'lens.review.failed',
};

export function LensReviewForm({
  candidate, desiredSize, desiredColor, eventId, sessionId,
}: {
  candidate: LensCandidate;
  desiredSize: string;
  desiredColor: string;
  /** معرّف حدث Lens (إن وُجد) — يُعلّم النتيجة كمختارة عند الخادم. */
  eventId: string | null;
  sessionId: string;
}) {
  const theme = useTheme();
  const t = useT();
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<LensReviewRequest | null>(null);

  const submit = useCallback(async () => {
    setMessage(null);
    const trimmed = contact.trim();
    if (!trimmed) {
      setMessage(t('lens.review.contactRequired'));
      return;
    }
    setBusy(true);
    try {
      const created = await requestManualReview({
        eventId: eventId ?? undefined,
        sourceUrl: candidate.sourceUrl,
        title: candidate.title,
        imageUrl: candidate.image || undefined,
        source: candidate.source || undefined,
        lensPrice: candidate.price,
        lensCurrency: candidate.currency,
        desiredSize: desiredSize || undefined,
        desiredColor: desiredColor || undefined,
        contact: trimmed,
      }, sessionId);
      setReview(created);
    } catch (error) {
      const key = error instanceof ApiError ? REFUSAL_KEY[error.code] : undefined;
      setMessage(key ? t(key) : t('lens.review.failed'));
    } finally {
      setBusy(false);
    }
  }, [candidate, contact, desiredColor, desiredSize, eventId, sessionId, t]);

  const refresh = useCallback(async () => {
    if (!review) return;
    setBusy(true);
    setMessage(null);
    try {
      setReview(await getManualReview(review.id, sessionId));
    } catch {
      setMessage(t('lens.review.failed'));
    } finally {
      setBusy(false);
    }
  }, [review, sessionId, t]);

  if (review) {
    return (
      <Card>
        <AppText>{t(STATUS_KEY[review.status])}</AppText>
        {review.status === 'QUOTED' && review.quotedPrice != null ? (
          <AppText>
            {t('lens.review.quoted', { price: review.quotedPrice.toFixed(2), currency: review.quotedCurrency ?? '' })}
          </AppText>
        ) : null}
        {review.customerMessage ? <AppText variant="caption" color={theme.colors.muted}>{review.customerMessage}</AppText> : null}
        {message ? <AppText variant="caption" color={theme.status.danger.fg}>{message}</AppText> : null}
        <Pressable onPress={refresh} disabled={busy} accessibilityRole="button" testID="lens-review-refresh" style={styles.link}>
          <AppText variant="caption">{t('lens.review.refresh')}</AppText>
        </Pressable>
      </Card>
    );
  }

  return (
    <View style={styles.wrap}>
      <AppText variant="caption" color={theme.colors.muted}>{t('lens.review.hint')}</AppText>
      <Field
        label={t('lens.review.contact')}
        value={contact}
        onChangeText={setContact}
        placeholder={t('lens.review.contactPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        testID="lens-review-contact"
      />
      {message ? <AppText variant="caption" color={theme.status.danger.fg}>{message}</AppText> : null}
      <Button
        label={busy ? t('lens.review.submitting') : t('lens.review.submit')}
        onPress={submit}
        busy={busy}
        disabled={busy}
        block
        testID="lens-review-submit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  link: { minHeight: 44, justifyContent: 'center' },
});
