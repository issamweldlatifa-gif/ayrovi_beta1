import { Pressable } from 'react-native';
import { NavigationIcon } from './NavigationIcon';
import { useTheme } from './theme';
import { OPACITY } from './tokens.mobile';
/** One header target and optical alignment. Existing containers keep their safe-area layout. */
export function BackButton({
  onPress,
  label,
  color,
  testID,
  disabled = false,
}: {
  onPress: () => void;
  label: string;
  color?: string;
  testID?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? OPACITY.subtle : 1,
      })}
    >
      <NavigationIcon
        name={theme.isRTL ? 'arrow-forward' : 'arrow-back'}
        color={color || theme.colors.ink}
      />
    </Pressable>
  );
}
