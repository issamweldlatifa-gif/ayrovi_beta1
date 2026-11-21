import { StyleSheet, View } from 'react-native';
import { BLACK_FRIDAY_EDITORIAL as B, PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';

export function BlackFridayBadge({ label, testID, compact = false }: { label: string; testID?: string; compact?: boolean }) {
  return <View testID={testID} style={[styles.badge, compact && styles.compact]}>
    <AppText variant="captionStrong" numberOfLines={1} color={P.paper}>{label}</AppText>
  </View>;
}
const styles = StyleSheet.create({ badge: { alignSelf: 'flex-start', maxWidth: '95%', backgroundColor: B.red, borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 4 }, compact: { paddingHorizontal: 6, paddingVertical: 2 } });
