import { StyleSheet, View } from 'react-native';
import { BLACK_FRIDAY_EDITORIAL as B, PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';

export function BlackFridayBadge({ label, testID }: { label: string; testID?: string }) {
  return <View testID={testID} style={styles.badge}>
    <AppText variant="captionStrong" numberOfLines={1} color={P.paper}>{label}</AppText>
  </View>;
}
const styles = StyleSheet.create({ badge: { alignSelf: 'flex-start', maxWidth: '95%', backgroundColor: B.red, borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 4 } });
