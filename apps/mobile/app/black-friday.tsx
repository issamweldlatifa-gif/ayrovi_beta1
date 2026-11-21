import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { blackFridayCollections, useBlackFriday, type BlackFridaySelection } from '@/api/blackFriday';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { BackButton } from '@/design/BackButton';
import { rowDirectionFor } from '@/design/layoutLogic';
import { goBack } from '@/design/navigation';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { BLACK_FRIDAY_EDITORIAL as B, PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { BlackFridayBadge } from '@/features/home/BlackFridayBadge';
import { BlackFridayProducts } from '@/features/home/BlackFridayProducts';
import { openBlackFridayCollection } from '@/features/home/BlackFridaySection';
import { useI18n } from '@/i18n';
import { blackFridayTimeRemaining, DEFAULT_BLACK_FRIDAY } from '../../../shared/blackFriday';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function BlackFridayScreen() {
  const { view, collection } = useLocalSearchParams<{ view?: string; collection?: string }>();
  const query = useBlackFriday();
  const { t, locale } = useI18n();
  const { isRTL, font } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const products = view === 'products';
  const campaign = query.data;
  const [, setClock] = useState(0);
  const hasDeadline = Boolean(campaign?.endsAt || campaign?.collections.some(item => item.endsAt));
  useEffect(() => {
    if (!hasDeadline) return;
    const timer = setInterval(() => setClock(ticks => ticks + 1), 15_000);
    return () => clearInterval(timer);
  }, [hasDeadline]);
  const now = Date.now();
  const selections = campaign ? blackFridayCollections(campaign, now) : [];
  const activeIds = new Set(selections.flatMap(item => item.products.map(offer => offer.id)));
  const selected = !products ? undefined : collection ? selections.find(item => item.id === collection) : campaign && selections.length ? {
    titleFr: campaign.featureTitleFr, titleAr: campaign.featureTitleAr,
    products: campaign.products.filter(offer => activeIds.has(offer.id)), demo: selections.some(item => item.demo),
  } : undefined;
  const title = campaign?.landingTitle || DEFAULT_BLACK_FRIDAY.landingTitle;
  const label = (item: Pick<BlackFridaySelection, 'titleFr' | 'titleAr'>) => locale === 'ar' ? item.titleAr : item.titleFr;
  const demo = products ? selected?.demo : selections.some(item => item.demo);
  return <View testID="black-friday-deals" style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <StatusBar style="dark" />
    <View style={[styles.header, { flexDirection: rowDirectionFor(isRTL) }]}>
      <BackButton label={t('common.back')} color={P.ink} onPress={() => goBack(products ? '/black-friday' : '/(tabs)')} />
      <AppText testID="black-friday-header-title" variant="bodyStrong" accessibilityRole="header" color={products ? P.ink : B.red}
        style={[styles.headerTitle, !products && styles.active]}>{products ? selected ? label(selected) : title : title.toUpperCase()}</AppText>
    </View>
    <ScrollView key={products ? collection ?? 'all' : 'collections'} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {query.isPending ? <LoadingBlock /> : query.isError && !campaign ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> :
        !campaign || !selections.length || (products && !selected) ? <EmptyBlock>{t('blackFriday.empty')}</EmptyBlock> : selected ?
        <View style={styles.gridFrame}>
          {demo ? <AppText variant="caption" align="center" color={P.muted} style={styles.demoNote}>{t('blackFriday.demo')}</AppText> : null}
          <BlackFridayProducts products={selected.products} badge={campaign.badge} width={Math.min(width - insets.left - insets.right, 600)} />
        </View> : <>
          <View style={styles.intro}>
            <AppText testID="black-friday-landing-title" variant="h3" align="center" color={P.ink} style={{ fontFamily: font('regular') }}>{title}</AppText>
            <AppText variant="bodySmall" align="center" color={P.ink}>{t('blackFriday.max', { percent: Math.max(...selections.map(item => item.maxDiscount)) })}</AppText>
            {demo ? <AppText variant="caption" align="center" color={P.muted}>{t('blackFriday.demo')}</AppText> : null}
          </View>
          <View style={styles.collectionList} testID="black-friday-collections">
            {selections.map(selection => <CampaignFeature key={selection.id} selection={selection} title={label(selection)} badge={campaign.badge}
              now={now} cta={selection.id === 'all' ? locale === 'ar' ? campaign.featureCtaAr : campaign.featureCtaFr : undefined} />)}
          </View>
        </>}
    </ScrollView>
  </View>;
}

function CampaignFeature({ selection, title, badge, now, cta }: { selection: BlackFridaySelection; title: string; badge: string; now: number; cta?: string }) {
  const { t } = useI18n();
  const { isRTL } = useTheme();
  const countdown = blackFridayTimeRemaining(selection.endsAt, now);
  const discountAlign = isRTL ? 'left' : 'right';
  return <Pressable testID={`black-friday-collection-${selection.id}`} onPress={() => openBlackFridayCollection(selection.id)} accessibilityRole="link"
    accessibilityLabel={cta ? `${title} · ${cta}` : `${title} · ${t('blackFriday.max', { percent: selection.maxDiscount })}${countdown ? ` · ${t('blackFriday.ends')} ${t('blackFriday.remaining', countdown)}` : ''}`} style={styles.feature}>
    <View style={styles.picture}>
      <AppImage testID={`black-friday-cover-${selection.id}`} uri={mediaUrl(selection.cover)} decorative contentFit="cover" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.featureMark, isRTL && styles.mirror]}>
        <BlackFridayBadge label={badge} />
      </View>
    </View>
    <View style={styles.featureCopy}>
      <AppText testID="black-friday-collection-title" variant="subtitle" numberOfLines={2} color={P.ink}>{title}</AppText>
      <View style={[styles.metrics, { flexDirection: rowDirectionFor(isRTL) }]}>
        <View style={styles.metricCopy}>
          {countdown ? <><AppText variant="caption" color={P.muted}>{t('blackFriday.ends')}</AppText><AppText variant="bodySmall" color={P.ink}>{t('blackFriday.remaining', countdown)}</AppText></> : null}
          {cta ? <AppText variant="bodySmall" color={P.ink} style={styles.active}>{cta}</AppText> : null}
        </View>
        <View>
          <AppText variant="caption" style={{ textAlign: discountAlign }} color={P.muted}>{t('blackFriday.saveUpTo')}</AppText>
          <AppText variant="bodySmall" style={{ textAlign: discountAlign }} color={P.ink}>{selection.maxDiscount}%</AppText>
        </View>
      </View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper },
  header: { gap: 6, alignItems: 'center', minHeight: 48, paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.muted },
  headerTitle: { flex: 1, minWidth: 0 }, active: { textDecorationLine: 'underline' },
  intro: { paddingHorizontal: 12, paddingVertical: 10, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.muted },
  collectionList: { gap: 12, backgroundColor: P.neutral, width: '100%', maxWidth: 600, alignSelf: 'center' },
  feature: { backgroundColor: P.paper },
  picture: { aspectRatio: 1.7, backgroundColor: P.neutral },
  featureMark: { justifyContent: 'flex-end', alignItems: 'flex-start', padding: 16 }, mirror: { direction: 'rtl' },
  featureCopy: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  metrics: { justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }, metricCopy: { flex: 1 },
  gridFrame: { width: '100%', maxWidth: 600, alignSelf: 'center' }, demoNote: { paddingVertical: 8 },
});
