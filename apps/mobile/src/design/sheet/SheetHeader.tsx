/**
 * رأس الدرج: العنوان الاختياري، والزر الذي يغلقه. الشريط الصغير فوقه (المقبض) يرمز
 * إلى أن الدرج يُسحب، والسحب يعمل على الرأس كما يعمل على المحتوى.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

export interface SheetHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function SheetHeader({ title, subtitle, onClose }: SheetHeaderProps) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.divider }]}>
      <View style={styles.titles}>
        <AppText variant="lead" weight="bold">{title}</AppText>
        {subtitle ? <AppText variant="caption" color={theme.colors.muted}>{subtitle}</AppText> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sheet.close')}
        onPress={onClose}
        hitSlop={8}
        style={({ pressed }) => [styles.close, { opacity: pressed ? theme.opacity.subtle : 1 }]}
      >
        <Ionicons name="close" size={theme.iconSize.md} color={theme.colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titles: { flex: 1, gap: 2 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
