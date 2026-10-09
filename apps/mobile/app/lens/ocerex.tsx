/**
 * OCEREX — P4، الشريحة 3: «صورة فيها سعر» ⇒ سطر في سلّة AYROVI.
 *
 * علاش موجود: برشا متاجر تنشر السعر في تطبيقها بلا رابط منتوج عمومي. العميل
 * يصوّر الشاشة، والخادم يقرا السعر (OCR)، يحوّلو للدينار بمحرّك التسعير، ويتقّ
 * من الثقة — وبعدها يلزم رابط المنتوج، وبعدها **فقط** تجي الإضافة للسلّة.
 *
 * حدود الشاشة (نفس خطّ المنتوج):
 *  • **الثقة توقّف كل شي**: `LOW` ⇒ ما فماش تسعير ولا زيادة، والسبب مكتوب.
 *  • **العملة ما تتخمّنش**: كي الخادم ما يقراش عملة، يتعرض الاختيار من قائمة
 *    مغلقة؛ وكان قرى عملة، **ما تتّبدّلش** (`CURRENCY_LOCKED`).
 *  • **الرابط إلزامي قبل الشراء**، وما يتقبلش غير HTTPS (الخادم يتحقّق كذلك).
 *  • الرقم النهائي هو رقم الخادم، وسطر السلّة ينكتب على الخادم (`cartItemId`
 *    يتقال كما هو) — التطبيق ما يعلنش نجاحاً من عندو.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { AppText, Button, Card, Field, KeyValue, ResponsiveActionGroup } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  OCEREX_INVALID_HINT_PLACEHOLDER, analyzeOcerexImage, calculateOcerexPrice, commitOcerexToCart,
  ocerexErrorMessage, ocerexReadiness, resolveOcerexUrl,
  type OcerexExtraction, type OcerexResolution,
} from '@/api/ocerex';
import { useAyWebsSessionId } from '@/features/aywebs/session';

export default function OcerexScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const sessionId = useAyWebsSessionId();

  const [preview, setPreview] = useState('');
  const [extraction, setExtraction] = useState<OcerexExtraction | null>(null);
  const [resolution, setResolution] = useState<OcerexResolution | null>(null);
  const [currencyChoice, setCurrencyChoice] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [committed, setCommitted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const readiness = useMemo(() => ocerexReadiness(extraction), [extraction]);

  const report = useCallback((error: unknown, fallbackKey: 'ocerex.failed' | 'ocerex.calcFailed' | 'ocerex.resolveFailed' | 'ocerex.commitFailed') => {
    setNote(isApiError(error) ? userMessage(error)[locale] : `${t(fallbackKey)} — ${ocerexErrorMessage(error)}`);
  }, [locale, t]);

  const analyze = useCallback(async (source: 'camera' | 'library') => {
    setNote('');
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNote(t('lens.permissionDenied'));
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPreview(asset.uri);
      setBusy(true);
      setExtraction(null);
      setResolution(null);
      setCommitted('');
      const mimeType = String(asset.mimeType ?? '').toLowerCase()
        || (/\.png$/i.test(asset.uri) ? 'image/png' : /\.webp$/i.test(asset.uri) ? 'image/webp' : 'image/jpeg');
      const outcome = await analyzeOcerexImage(
        { uri: asset.uri, mimeType, fileName: asset.fileName ?? undefined },
        sessionId,
      );
      setExtraction(outcome.extraction);
      setCurrencyChoice(outcome.extraction.currency || '');
      // الخادم قال `success:false` مع سبب: نعرضو السبب كما هو (بلا تلميع).
      if (!outcome.ok) setNote(outcome.message || t('ocerex.notUsable'));
    } catch (error) {
      report(error, 'ocerex.failed');
    } finally {
      setBusy(false);
    }
  }, [report, sessionId, t]);

  const calculate = useCallback(async () => {
    if (!extraction || !readiness.canCalculate) return;
    setBusy(true);
    setNote('');
    try {
      const next = await calculateOcerexPrice(
        // العملة تتّبعث كان كي الخادم ما قراش وحدة — وإلا الخادم يرفض التبديل.
        { extractionId: extraction.extractionId, ...(extraction.currency ? {} : { currency: currencyChoice || undefined }) },
        sessionId,
      );
      setExtraction(next);
    } catch (error) {
      report(error, 'ocerex.calcFailed');
    } finally {
      setBusy(false);
    }
  }, [currencyChoice, extraction, readiness.canCalculate, report, sessionId]);

  const resolve = useCallback(async () => {
    if (!extraction || !readiness.canResolve || productUrl.trim().length < 8) return;
    setBusy(true);
    setNote('');
    try {
      const outcome = await resolveOcerexUrl(
        { extractionId: extraction.extractionId, url: productUrl.trim() },
        sessionId,
      );
      setExtraction(outcome.extraction);
      setResolution(outcome.resolution);
    } catch (error) {
      report(error, 'ocerex.resolveFailed');
    } finally {
      setBusy(false);
    }
  }, [extraction, productUrl, readiness.canResolve, report, sessionId]);

  const commit = useCallback(async () => {
    if (!extraction || !readiness.canCommit) return;
    setBusy(true);
    setNote('');
    try {
      const outcome = await commitOcerexToCart(extraction.extractionId, sessionId);
      setExtraction(outcome.extraction);
      setCommitted(outcome.cartItemId);
    } catch (error) {
      report(error, 'ocerex.commitFailed');
    } finally {
      setBusy(false);
    }
  }, [extraction, readiness.canCommit, report, sessionId]);

  const blockText = (code: string): string => {
    switch (code) {
      case 'LOW_CONFIDENCE': return t('ocerex.block.LOW_CONFIDENCE');
      case 'NO_REFERENCE_PRICE': return t('ocerex.block.NO_REFERENCE_PRICE');
      case 'NO_PRICE_FOUND': return t('ocerex.block.NO_PRICE_FOUND');
      case 'UNSUPPORTED_SCREEN': return t('ocerex.block.UNSUPPORTED_SCREEN');
      case 'PRICE_NOT_CALCULATED': return t('ocerex.block.PRICE_NOT_CALCULATED');
      case 'EXTRACTION_EXPIRED': return t('ocerex.block.EXTRACTION_EXPIRED');
      case 'CURRENCY_UNCONFIRMED': return t('ocerex.block.CURRENCY_UNCONFIRMED');
      case 'CURRENCY_LOCKED': return t('ocerex.block.CURRENCY_LOCKED');
      case 'INVALID_URL': return t('ocerex.block.INVALID_URL');
      case 'RESTRICTED': return t('ocerex.block.RESTRICTED');
      default: return '';
    }
  };

  const confidenceText = (level: string): string => {
    switch (level) {
      case 'HIGH': return t('ocerex.confidence.HIGH');
      case 'MEDIUM': return t('ocerex.confidence.MEDIUM');
      default: return t('ocerex.confidence.LOW');
    }
  };

  const screenTypeText = (type: string): string => {
    switch (type) {
      case 'PRODUCT': return t('ocerex.screen.PRODUCT');
      case 'CART': return t('ocerex.screen.CART');
      default: return t('ocerex.screen.UNKNOWN');
    }
  };

  return (
    <SubScreen title={t('ocerex.title')} subtitle={t('ocerex.hint')} fallback="/lens">
      <Card>
        <ResponsiveActionGroup>
          <Button label={t('lens.camera')} onPress={() => analyze('camera')} disabled={busy || !sessionId} />
          <Button label={t('lens.gallery')} tone="quiet" onPress={() => analyze('library')} disabled={busy || !sessionId} />
        </ResponsiveActionGroup>
        {preview ? (
          <AppImage uri={preview} style={styles.preview} contentFit="contain" accessibilityLabel={t('lens.previewAlt')} />
        ) : null}
        {busy ? (
          <View style={[styles.row, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <ActivityIndicator />
            <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.working')}</AppText>
          </View>
        ) : null}
        {note ? (
          <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
        ) : null}
      </Card>

      {extraction ? (
        <Card title={t('ocerex.readTitle')}>
          <KeyValue label={t('ocerex.screenType')} value={screenTypeText(extraction.type)} />
          <KeyValue label={t('ocerex.confidence')} value={confidenceText(extraction.confidenceLevel)} />
          <KeyValue
            label={t('ocerex.referencePrice')}
            value={extraction.referencePrice != null
              ? `${extraction.referencePrice} ${extraction.currency || '?'}`
              : t('ocerex.noReferencePrice')}
          />
          {extraction.productTitle ? (
            <KeyValue label={t('aywebs.productTitle')} value={extraction.productTitle} />
          ) : null}
          {extraction.platform ? <KeyValue label={t('lens.source')} value={extraction.platform} /> : null}
          <KeyValue label={t('ocerex.decisionCode')} value={extraction.code || '—'} />
          {extraction.ayroviPrice != null ? (
            <KeyValue label={t('aywebs.totalTnd')} value={`${extraction.ayroviPrice.toFixed(2)} TND`} />
          ) : (
            <KeyValue label={t('aywebs.totalTnd')} value={t('lens.noQuote')} />
          )}
          <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.ocrNote')}</AppText>
        </Card>
      ) : null}

      {extraction ? (
        <Card title={t('ocerex.calcTitle')}>
          {!readiness.canCalculate ? (
            <AppText variant="caption" color={theme.status.danger.fg}>{blockText(readiness.calculateBlock)}</AppText>
          ) : (
            <>
              {!extraction.currency && extraction.supportedCurrencies.length ? (
                <>
                  <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.chooseCurrency')}</AppText>
                  <View style={[styles.chips, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                    {extraction.supportedCurrencies.map((currency) => {
                      const active = currencyChoice === currency;
                      return (
                        <Pressable
                          key={currency}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setCurrencyChoice(currency)}
                          style={[
                            styles.chip,
                            {
                              borderColor: active ? theme.colors.action : theme.colors.line,
                              backgroundColor: active ? theme.colors.action : theme.colors.canvas,
                              borderRadius: theme.radius.control,
                              minHeight: theme.geometry.minTarget,
                            },
                          ]}
                        >
                          <AppText variant="label" color={active ? theme.colors.onAction : theme.colors.ink}>
                            {currency}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
              <Button
                label={t('ocerex.calculate')}
                onPress={calculate}
                busy={busy}
                disabled={busy || (!extraction.currency && !currencyChoice)}
              />
            </>
          )}
        </Card>
      ) : null}

      {extraction ? (
        <Card title={t('ocerex.resolveTitle')} hint={t('ocerex.resolveHint')}>
          <Field
            label={t('ocerex.productUrl')}
            value={productUrl}
            onChangeText={setProductUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            placeholder={OCEREX_INVALID_HINT_PLACEHOLDER}
          />
          <Button
            label={t('ocerex.resolve')}
            tone="quiet"
            onPress={resolve}
            busy={busy}
            disabled={busy || !readiness.canResolve || productUrl.trim().length < 8}
          />
          {resolution ? (
            <>
              <KeyValue label={t('ocerex.resolvedTitle')} value={resolution.title || '—'} />
              <KeyValue label={t('lens.source')} value={resolution.platform || '—'} />
            </>
          ) : null}
        </Card>
      ) : null}

      {extraction ? (
        <Card title={t('ocerex.commitTitle')}>
          {readiness.canCommit ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.commitReady')}</AppText>
          ) : (
            <AppText variant="caption" color={theme.status.danger.fg}>{blockText(readiness.commitBlock)}</AppText>
          )}
          <Button
            label={t('ocerex.commit')}
            onPress={commit}
            busy={busy}
            disabled={busy || !readiness.canCommit}
          />
          {committed ? (
            <>
              <KeyValue label={t('ocerex.cartItem')} value={committed} />
              <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.committed')}</AppText>
              <Button label={t('aywebs.goToCart')} tone="quiet" onPress={() => router.push('/cart')} />
            </>
          ) : null}
        </Card>
      ) : null}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  preview: { width: '100%', height: 220, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', minWidth: 64 },
});
