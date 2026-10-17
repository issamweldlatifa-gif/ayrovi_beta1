import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';

const TIPS: Array<{ key: TranslationKey; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'lens.help.step1', icon: 'scan-outline' },
  { key: 'lens.help.step2', icon: 'sunny-outline' },
  { key: 'lens.help.step3', icon: 'images-outline' },
  { key: 'lens.help.step4', icon: 'barcode-outline' },
];

export function LensHelpView() {
  const theme = useTheme();
  const t = useT();

  return (
    <View style={styles.wrap} testID="lens-help">
      <AppText variant="title" align="center">{t('lens.help.title')}</AppText>
      <AppText color={theme.colors.muted} align="center">{t('lens.help.subtitle')}</AppText>
      <View style={styles.tips}>
        {TIPS.map(({ key, icon }) => (
          <View key={key} style={styles.row}>
            <View style={styles.icon}>
              <Ionicons name={icon} size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
            </View>
            <AppText style={styles.text}>{t(key)}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  tips: { gap: 8, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 6 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
