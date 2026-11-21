import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useBlackFriday, type BlackFridayCampaign } from '@/api/blackFriday';
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
import { useI18n } from '@/i18n';
import { blackFridayTimeRemaining, DEFAULT_BLACK_FRIDAY } from '../../../shared/blackFriday';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';
const openProducts = () => router.push('/black-friday?view=products' as Href);

export default function BlackFridayScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const query = useBlackFriday();
  const { t, locale } = useI18n();
  const { isRTL, font } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const products = view === 'products';
  const campaign = query.data;
  const title = campaign?.landingTitle || DEFAULT_BLACK_FRIDAY.landingTitle;
  const featureTitle = campaign && (locale === 'ar' ? campaign.featureTitleAr : campaign.featureTitleFr);
  return <View testID="black-friday-deals" style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <StatusBar style="dark" />
    <View style={[styles.header, { flexDirection: rowDirectionFor(isRTL) }]}>
      <BackButton label={t('common.back')} color={P.ink} onPress={() => goBack(products ? '/black-friday' : '/(tabs)')} />
      <AppText variant="h2" accessibilityRole="header" numberOfLines={1} color={products ? P.ink : B.red}
        style={[styles.headerTitle, !products && styles.active]}>{products ? featureTitle || title : title.toUpperCase()}</AppText>
    </View>
    <ScrollView refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {query.isPending ? <LoadingBlock /> : query.isError && !campaign ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> :
        !campaign ? <EmptyBlock>{t('blackFriday.empty')}</EmptyBlock> : products ?
        <View style={styles.gridFrame}><BlackFridayProducts campaign={campaign} width={Math.min(width - insets.left - insets.right, 600) - 32} /></View> : <>
          <View style={styles.intro}>
            <AppText testID="black-friday-landing-title" variant="display" align="center" color={P.ink} style={{ fontFamily: font('regular') }}>{title}</AppText>
            <AppText variant="body" align="center" color={P.ink}>{t('blackFriday.max', { percent: campaign.maxDiscount })}</AppText>
          </View>
          <CampaignFeature campaign={campaign} title={featureTitle!} />
        </>}
    </ScrollView>
  </View>;
}

function CampaignFeature({ campaign, title }: { campaign: BlackFridayCampaign; title: string }) {
  const { t, locale } = useI18n();
  const { isRTL } = useTheme();
  const countdown = blackFridayTimeRemaining(campaign.endsAt);
  const cta = locale === 'ar' ? campaign.featureCtaAr : campaign.featureCtaFr;
  return <Pressable testID="black-friday-feature" onPress={openProducts} accessibilityRole="link" accessibilityLabel={`${title} · ${cta}`} style={styles.feature}>
    <View style={styles.picture}>
      <AppImage testID="black-friday-feature-image" uri={mediaUrl(campaign.featureCover)} decorative contentFit="cover" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.featureMark, isRTL && styles.mirror]}>
        <BlackFridayBadge label={campaign.badge} testID="black-friday-feature-badge" />
      </View>
    </View>
    <View style={styles.featureCopy}>
      <AppText variant="h2" numberOfLines={2} color={P.ink}>{title}</AppText>
      <View style={[styles.metrics, { flexDirection: rowDirectionFor(isRTL) }]}>
        <View style={styles.metricCopy}>
          {countdown ? <><AppText variant="body" color={P.muted}>{t('blackFriday.ends')}</AppText><AppText variant="bodyStrong" color={P.ink}>{t('blackFriday.remaining', countdown)}</AppText></> : null}
          <AppText variant="bodyStrong" color={P.ink} style={styles.cta}>{cta}</AppText>
        </View>
        <View>
          <AppText variant="body" style={{ textAlign: isRTL ? 'left' : 'right' }} color={P.muted}>{t('blackFriday.savings')}</AppText>
          <AppText variant="bodyStrong" style={{ textAlign: isRTL ? 'left' : 'right' }} color={P.ink}>{campaign.maxDiscount}%</AppText>
        </View>
      </View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper },
  header: { gap: 6, alignItems: 'center', minHeight: 56, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.muted },
  headerTitle: { flexShrink: 1 }, active: { textDecorationLine: 'underline' },
  intro: { padding: 12, gap: 2, marginBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.muted },
  feature: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  picture: { aspectRatio: 1.7, backgroundColor: P.neutral },
  featureMark: { justifyContent: 'flex-end', alignItems: 'flex-start', padding: 16 }, mirror: { direction: 'rtl' },
  featureCopy: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  metrics: { justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }, metricCopy: { flex: 1 },
  cta: { textDecorationLine: 'underline' },
  gridFrame: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 16 },
});
