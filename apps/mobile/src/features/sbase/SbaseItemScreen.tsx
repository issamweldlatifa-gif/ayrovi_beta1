/**
 * S Base — فيش المنتج: **صفحة واحدة لكل المتاجر** (موش تصميم لكل متجر).
 *
 * الشكل:
 *   معرض تصاور → العنوان → الماركة/البائع → السعر (+ القديم) → التوفّر
 *   → «المقاسات والألوان» (مجموعة لكل بُعد) → المواصفات → الوصف
 *   → الحقول اللي المصدر ما عطاهاش → زمن الاستجابة والكلفة → «شوف في المتجر».
 *
 * الصدق:
 *  • بلا خيارات؟ نكتب «هذا المتجر ما يعطيش المقاسات/الألوان» — ما نصنعوش chips.
 *  • الخيار اللي ما نعرفوش متوفّر ولا لا: يظهر عادي، بلا شارة كاذبة.
 *  • السعر كما عطاه المصدر؛ ما نضيفوش تحويل ولا «من …».
 */
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { SbaseDetailPayload } from '@/api/sbase';
import { fetchSbaseItem } from '@/api/sbase';
import { AppImage } from '@/design/appImage';
import { AppScreen } from '@/design/layout';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useT, type TranslationKey } from '@/i18n';
import { SkeletonFiche } from './Skeleton';
import { formatCallCost, formatDuration, formatItemPrice, formatTND, missingLabelKey } from './sbaseLogic';

function priceLabel(payload: SbaseDetailPayload, fallback: string): string {
  return formatItemPrice(
    { amount: payload.detail.amount, currency: payload.detail.currency, priceText: payload.detail.priceText },
    fallback,
  );
}

export function SbaseItemScreen({
  source, id, title, url,
}: { source: string; id: string | null; title: string | null; url: string | null }) {
  const theme = useTheme(); const t = useT();
  const [activeImage, setActiveImage] = useState(0);

  const query = useQuery({
    queryKey: ['sbase', 'item', source, id ?? '', title ?? ''],
    queryFn: ({ signal }) => fetchSbaseItem({ source, id, title, url }, { signal }),
    staleTime: 60_000,
    retry: false,
  });

  const payload = query.data ?? null;
  const detail = payload?.detail ?? null;
  const unsupported = (query.error as { code?: string } | null)?.code === 'DETAILS_UNSUPPORTED';

  return <AppScreen testID="sbase-item" chrome={false} hasBottomBar>
    <View style={styles.topBar}>
      <Pressable testID="sbase-item-back" accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => goBack('/sbase')} style={styles.iconButton}>
        <Ionicons name={theme.isRTL ? 'chevron-forward' : 'chevron-back'} size={theme.iconSize.md} color={theme.colors.ink} />
      </Pressable>
      <View style={styles.grow}>
        <AppText variant="subtitle" accessibilityRole="header" numberOfLines={1}>{t('sbase.detailTitle')}</AppText>
        <AppText variant="caption" color={theme.colors.muted}>{source}</AppText>
      </View>
    </View>

    {/* قالب الواجهة أثناء الجلب — لا دُوّامة عامة (قرار المالك: Skeleton/Shimmer). */}
    {query.isLoading ? <SkeletonFiche /> : null}

    {query.isError ? <View testID="sbase-item-error" style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
      <AppText variant="bodyStrong" color={theme.status.danger.fg} accessibilityRole="alert">
        {unsupported ? t('sbase.detailsUnsupported') : t('sbase.errorTitle')}
      </AppText>
      {!unsupported ? <AppText variant="bodySmall">{(query.error as Error)?.message ?? ''}</AppText> : null}
      <AppText variant="caption" color={theme.colors.muted}>{(query.error as { code?: string })?.code ?? 'SBASE_ITEM_ERROR'}</AppText>
      <View style={styles.actions}>
        <Button label={t('common.retry')} tone="quiet" onPress={() => { void query.refetch(); }} />
        {url ? <Button label={t('sbase.open')} tone="quiet" onPress={() => { void Linking.openURL(url); }} /> : null}
      </View>
    </View> : null}

    {detail ? <>
      {detail.images.length > 0 ? <View style={styles.gallery}>
        <AppImage testID="sbase-item-image" uri={detail.images[activeImage]} decorative style={styles.hero} contentFit="contain" />
        {detail.images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {detail.images.map((image, index) => <Pressable
            key={`${image}-${index}`}
            accessibilityRole="button"
            accessibilityState={{ selected: index === activeImage }}
            accessibilityLabel={`${t('sbase.details')} ${index + 1}`}
            onPress={() => setActiveImage(index)}
            style={[styles.thumb, { borderColor: index === activeImage ? theme.colors.ink : theme.colors.lineControl }]}>
            <AppImage uri={image} decorative style={styles.thumbImage} contentFit="cover" />
          </Pressable>)}
        </ScrollView> : null}
      </View> : null}

      <AppText variant="h2" accessibilityRole="header">{detail.title ?? '—'}</AppText>
      <View style={styles.metaRow}>
        {detail.brand ? <AppText variant="caption" color={theme.colors.muted}>{t('sbase.brand')} · {detail.brand}</AppText> : null}
        {detail.seller ? <AppText variant="caption" color={theme.colors.muted}>{t('sbase.seller')} · {detail.seller}</AppText> : null}
      </View>

      <View style={styles.priceRow}>
        <AppText variant="h2">{priceLabel(payload!, t('sbase.missing.price'))}</AppText>
        {detail.oldPriceText ? <AppText variant="caption" color={theme.colors.muted}>{detail.oldPriceText}</AppText> : null}
      </View>
      {detail.availability ? <AppText variant="caption" color={theme.colors.muted}>
        {t('sbase.availability')} · {detail.availability}
      </AppText> : null}

      {/*
        * تقدير الوصول لتونس — من **محرّك السعر الرسمي** (تحويل + شحن + ديوانة +
        * TVA + خدمة، بمصفوفة جمركية حسب العنوان). إذا المحرّك ما نجّمش يقتبس
        * (عملة بلا سعر صرف) نكتبوها، ما نحسبوش في التطبيق.
        */}
      <View testID="sbase-item-estimate" style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
        <AppText variant="bodyStrong">{t('sbase.estimateTitle')}</AppText>
        {detail.priceEstimate ? <>
          <View style={styles.specRow}><AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{t('sbase.estimateProduct')}</AppText>
            <AppText variant="caption">{formatTND(detail.priceEstimate.productTND)}</AppText></View>
          <View style={styles.specRow}><AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{t('sbase.estimateFreight')}</AppText>
            <AppText variant="caption">{formatTND(detail.priceEstimate.freightTND)}</AppText></View>
          <View style={styles.specRow}><AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{t('sbase.estimateDuty')}</AppText>
            <AppText variant="caption">{formatTND(detail.priceEstimate.dutyTND)}</AppText></View>
          <View style={styles.specRow}><AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{t('sbase.estimateVat')}</AppText>
            <AppText variant="caption">{formatTND(detail.priceEstimate.tvaTND)}</AppText></View>
          <View style={styles.specRow}><AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{t('sbase.estimateService')}</AppText>
            <AppText variant="caption">{formatTND(detail.priceEstimate.serviceFeeTND)}</AppText></View>
          <View style={styles.specRow}><AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{t('sbase.estimateDelivery')}</AppText>
            <AppText variant="caption">{formatTND(detail.priceEstimate.localDeliveryTND)}</AppText></View>
          <View style={[styles.specRow, { borderColor: theme.colors.line }]}>
            <AppText variant="bodyStrong" style={styles.grow}>{t('sbase.estimateTotal')}</AppText>
            <AppText testID="sbase-item-estimate-total" variant="bodyStrong">{formatTND(detail.priceEstimate.totalTND)}</AppText>
          </View>
          <AppText variant="caption" color={theme.colors.muted}>
            {t('sbase.estimateBasis', { category: detail.priceEstimate.categoryLabel, rate: detail.priceEstimate.rateTND.toFixed(4) })}
          </AppText>
          {detail.priceEstimate.restricted ? <AppText variant="caption" color={theme.status.danger.fg}>{t('sbase.estimateRestricted')}</AppText> : null}
          {detail.priceEstimate.requiresWeightValidation ? <AppText variant="caption" color={theme.colors.muted}>{t('sbase.estimateHeavy')}</AppText> : null}
          <AppText variant="caption" color={theme.colors.muted}>{t('sbase.estimateNote')}</AppText>
        </> : <AppText variant="bodySmall" color={theme.colors.muted}>{t('sbase.estimateUnavailable')}</AppText>}
      </View>

      <View style={styles.section}>
        <AppText variant="subtitle" accessibilityRole="header">{t('sbase.variants')}</AppText>
        {detail.variants.length === 0
          ? <AppText variant="bodySmall" color={theme.colors.muted}>{t('sbase.variantsMissing')}</AppText>
          : detail.variants.map((group) => <View key={group.name} style={styles.group}>
            <AppText variant="caption" color={theme.colors.muted}>{group.name}</AppText>
            <View style={styles.chips}>
              {group.values.map((value) => <View
                key={`${group.name}-${value.label}`}
                accessibilityRole="text"
                accessibilityLabel={`${group.name} ${value.label}`}
                style={[styles.chip, {
                  borderColor: value.available === false ? theme.colors.line : theme.colors.lineControl,
                  opacity: value.available === false ? theme.opacity.subtle : 1,
                }]}>
                <AppText variant="caption">{value.label}</AppText>
              </View>)}
            </View>
          </View>)}
      </View>

      {detail.specs.length > 0 ? <View style={styles.section}>
        <AppText variant="subtitle" accessibilityRole="header">{t('sbase.specs')}</AppText>
        {detail.specs.map((spec) => <View key={`${spec.name}-${spec.value}`} style={[styles.specRow, { borderColor: theme.colors.line }]}>
          <AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{spec.name}</AppText>
          <AppText variant="caption">{spec.value}</AppText>
        </View>)}
      </View> : null}

      {detail.description ? <View style={styles.section}>
        <AppText variant="subtitle" accessibilityRole="header">{t('sbase.description')}</AppText>
        <AppText variant="bodySmall">{detail.description}</AppText>
      </View> : null}

      {detail.missing.length > 0 ? <View style={styles.section}>
        <AppText variant="caption" color={theme.colors.muted}>{t('sbase.missingTitle')}</AppText>
        <View style={styles.chips}>
          {detail.missing.map((field) => {
            const key = missingLabelKey(field);
            return <View key={field} style={[styles.chip, { borderColor: theme.colors.lineControl }]}>
              <AppText variant="caption">{key ? t(key as TranslationKey) : field}</AppText>
            </View>;
          })}
        </View>
      </View> : null}

      <AppText testID="sbase-item-response" variant="caption" color={theme.colors.muted}>
        {t('sbase.responseTime')} · {formatDuration(payload?.durationMs ?? null)}
        {payload?.cached ? ` · ${t('sbase.cachedNote')}` : ''}
        {formatCallCost(payload?.costUsd)
          ? ` · ${t('sbase.cost')} ${formatCallCost(payload?.costUsd)}${payload?.billedPerResult ? ` ${t('sbase.costPerResult')}` : ''}`
          : ''}
      </AppText>

      {detail.url ? <Button
        label={t('sbase.openStore', { store: source })}
        block
        onPress={() => { void Linking.openURL(detail.url as string); }}
      /> : null}
    </> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  gallery: { gap: 8 },
  hero: { width: '100%', aspectRatio: 1.15, borderRadius: RADIUS.md, overflow: 'hidden' },
  thumbs: { flexDirection: 'row', gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: RADIUS.sm, borderWidth: 2, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  section: { gap: 6, marginTop: 16 },
  group: { gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.xl, paddingHorizontal: 10, paddingVertical: 4 },
  specRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  card: { gap: 8, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md, marginTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
