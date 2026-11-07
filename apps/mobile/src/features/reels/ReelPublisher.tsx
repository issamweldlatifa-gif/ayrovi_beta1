import { View, StyleSheet } from 'react-native';
import { AppText } from '@/design/ui';
import { ZMark } from '@/design/BrandMark';
import { useTheme } from '@/design/theme';

/** Publishing is currently first-party only. Never borrow a reference creator's identity. */
export function ReelPublisher({ onMedia = false }: { onMedia?: boolean }) {
  const theme = useTheme();
  return (
    <View testID="reel-publisher" style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.surface }]}>
        <ZMark width={18} color={theme.colors.ink} />
      </View>
      <AppText
        variant="body"
        numberOfLines={1}
        color={onMedia ? theme.colors.onMedia : theme.colors.ink}
        style={styles.name}
      >
        Zayrovi Team
      </AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  name: { flexShrink: 1 },
});
