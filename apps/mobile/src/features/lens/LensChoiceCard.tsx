/**
 * بطاقة اختيار في وضع «Lien / code»: أيقونة، عنوان، وسطر وصف. تُستعمل مرتين:
 * إدخال رابط أو رمز، وفتح ماسح QR.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';

export interface LensChoiceCardProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
}

export function LensChoiceCard({ icon, title, subtitle, onPress, testID }: LensChoiceCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.canvas, borderRadius: theme.radius.card, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.accent }]}>
        <Ionicons name={icon} size={26} color={theme.colors.ink} />
      </View>
      <View style={styles.texts}>
        <AppText variant="label" weight="bold" color={theme.colors.ink}>{title}</AppText>
        <AppText variant="caption" color={theme.colors.muted}>{subtitle}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 4 },
});
