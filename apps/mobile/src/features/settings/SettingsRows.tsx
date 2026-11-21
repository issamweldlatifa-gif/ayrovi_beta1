import { Pressable, StyleSheet, Switch, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';

export function SettingsRow({ title, description, icon, onPress, checked, divided = false }: {
  title: string; description?: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; checked?: boolean; divided?: boolean;
}) {
  const theme = useTheme();
  const body = <>
    {icon ? <Ionicons name={icon} size={theme.iconSize.md} color={theme.colors.ink} /> : null}
    <View style={styles.text}>
      <AppText variant={checked === false ? 'body' : 'bodyStrong'}>{title}</AppText>
      {description ? <AppText color={theme.colors.muted}>{description}</AppText> : null}
    </View>
    {typeof checked === 'boolean' ? checked ? <Ionicons name="checkmark" size={theme.iconSize.md} color={theme.colors.ink} /> : null
      : onPress ? <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.md} color={theme.colors.ink} /> : null}
  </>;
  const style = [styles.row, { flexDirection: rowDirectionFor(theme.isRTL) }, divided && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.line }];
  return onPress ? <Pressable onPress={onPress} accessibilityRole={typeof checked === 'boolean' ? 'radio' : 'button'}
    accessibilityLabel={description ? `${title} · ${description}` : title} accessibilityState={typeof checked === 'boolean' ? { checked } : undefined}
    style={style}>{body}</Pressable> : <View style={style}>{body}</View>;
}

export function SettingsSwitch({ title, description, value, onChange, disabled = false }: {
  title: string; description?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return <View style={[styles.row, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
    <View style={styles.text}>
      <AppText variant="bodyStrong">{title}</AppText>
      {description ? <AppText color={theme.colors.muted}>{description}</AppText> : null}
    </View>
    <Switch accessibilityLabel={title} accessibilityHint={description} value={value} onValueChange={onChange} disabled={disabled}
      trackColor={{ false: theme.colors.lineControl, true: theme.colors.ink }} thumbColor={theme.colors.canvas} />
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 56, paddingVertical: 12, alignItems: 'center', gap: 16 },
  text: { flex: 1, minWidth: 0, gap: 4 },
});
