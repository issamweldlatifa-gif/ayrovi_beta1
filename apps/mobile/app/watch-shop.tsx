import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useZayroviHighlights } from '@/api/zayroviHighlights';
import { BackButton } from '@/design/BackButton';
import { BrandLoadingIndicator } from '@/design/LoadingScreen';
import { rowDirectionFor } from '@/design/layoutLogic';
import { goBack } from '@/design/navigation';
import { ErrorBlock } from '@/design/states';
import { BRAND } from '@/design/tokens.generated';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { WATCH_SHOP_NAME, WatchShopGrid, watchShopReels } from '@/features/highlights/WatchShopGrid';
import { useHiddenReels } from '@/features/reels/reelVisibility';
import { useT } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function WatchShopScreen() {
  const focused = useIsFocused();
  const safe = useSafeAreaInsets();
  const { isRTL } = useTheme();
  const t = useT();
  const query = useZayroviHighlights(focused);
  const hidden = useHiddenReels();
  const reels = watchShopReels(query.data ?? [], hidden);
  const refresh = () => void query.refetch();
  return <View style={styles.screen} testID="watch-shop">
    {focused ? <StatusBar style="light" /> : null}
    <View style={[styles.header, { paddingTop: safe.top, paddingLeft: safe.left, paddingRight: safe.right, flexDirection: rowDirectionFor(isRTL) }]}>
      <BackButton onPress={() => goBack('/')} label={t('common.back')} color={BRAND.white} />
      <AppText variant="h3" accessibilityRole="header" color={BRAND.white}>{WATCH_SHOP_NAME}</AppText>
    </View>
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: safe.bottom, paddingLeft: safe.left, paddingRight: safe.right }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={BRAND.white} />}>
      {reels.length ? <WatchShopGrid reels={reels} edgeToEdge /> : <View style={styles.state}>
        {query.isPending ? <BrandLoadingIndicator size={60} /> : query.isError ? <ErrorBlock error={query.error} onRetry={refresh} />
          : <AppText color={BRAND.white} align="center">{t('sections.empty')}</AppText>}
      </View>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.black },
  header: { alignItems: 'center', gap: 8, paddingBottom: 4 },
  state: { flex: 1, justifyContent: 'center', padding: 16 },
});
