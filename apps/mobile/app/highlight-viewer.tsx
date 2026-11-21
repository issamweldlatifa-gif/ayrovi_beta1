import { StyleSheet, View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useZayroviHighlights } from '@/api/zayroviHighlights';
import { goBack } from '@/design/navigation';
import { ErrorBlock } from '@/design/states';
import { BrandLoadingIndicator } from '@/design/LoadingScreen';
import { BRAND } from '@/design/tokens.generated';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import { HighlightOverlayButton, HighlightViewer } from '@/features/highlights/HighlightViewer';
import { useHiddenReels } from '@/features/reels/reelVisibility';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function HighlightViewerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const focused = useIsFocused();
  const safe = useSafeAreaInsets();
  const t = useT();
  const hidden = useHiddenReels();
  const query = useZayroviHighlights(focused);
  const reel = query.data?.find(row => row.id === id && row.videoUrl && !hidden.includes(row.id));
  return <View style={styles.screen}>
    {focused ? <StatusBar style="light" /> : null}
    {reel ? <HighlightViewer key={reel.id} reel={reel} focused={focused} onClose={() => goBack()} /> : <>
      <View style={{ paddingTop: safe.top + 8, paddingLeft: safe.left + 12, alignSelf: 'flex-start' }}>
        <HighlightOverlayButton icon="close" label={t('common.close')} onPress={() => goBack()} testID="highlight-close" />
      </View>
      <View style={styles.state}>
        {query.isPending ? <BrandLoadingIndicator size={60} /> : query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
          : <AppText color={BRAND.white} align="center">{t('highlights.unavailable')}</AppText>}
      </View>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.black },
  state: { flex: 1, justifyContent: 'center', padding: 16 },
});
