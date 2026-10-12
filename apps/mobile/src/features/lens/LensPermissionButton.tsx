/**
 * زر طلب إذن الكاميرا داخل Lens. يظهر فوق خلفية سوداء، فيأخذ اللون الفاتح (canvas)
 * بدل لون الزر الأساسي (الأسود) الذي كان يختفي على الخلفية نفسها.
 */
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';

export interface LensPermissionButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export function LensPermissionButton({ label, onPress, testID }: LensPermissionButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.colors.canvas, borderRadius: theme.radius.control, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <AppText variant="label" weight="bold" color={theme.colors.ink}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
});
