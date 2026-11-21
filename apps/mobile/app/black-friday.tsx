import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useBlackFriday } from '@/api/blackFriday';
import { useResponsive } from '@/design/layout';
import { rowDirectionFor } from '@/design/layoutLogic';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { BLACK_FRIDAY_TITLE } from '../../../shared/blackFriday';
import { BlackFridayTile } from '@/features/home/BlackFridaySection';
import { useT } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';
export default function BlackFridayScreen() {
  const query = useBlackFriday();
  const t = useT();
  const { isRTL } = useTheme();
  const { width } = useWindowDimensions();
  const { gutter } = useResponsive();
  const tile = Math.max(1, (Math.min(width - 2 * gutter, 600) - 12) / 2);
  return <SubScreen testID="black-friday-deals" title={(query.data?.title || BLACK_FRIDAY_TITLE).replace(/\n/g, ' ')}
    fallback="/(tabs)" refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
    {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> :
      !query.data ? <EmptyBlock>{t('blackFriday.empty')}</EmptyBlock> : <View style={[styles.grid, { flexDirection: rowDirectionFor(isRTL) }]}>
        {query.data.products.map(offer => <BlackFridayTile key={offer.id} offer={offer} width={tile} showPrice />)}
      </View>}
  </SubScreen>;
}
const styles = StyleSheet.create({ grid: { flexWrap: 'wrap', alignSelf: 'center', gap: 12, maxWidth: 600 } });
