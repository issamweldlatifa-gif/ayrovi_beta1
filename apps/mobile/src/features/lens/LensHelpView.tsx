/**
 * « Comment utiliser Lens » — نفس خطوات الموقع (LensNavigation › help)، مع ملاحظة الأسعار التقديرية.
 * يُعرض داخل شاشة Lens (ليس مساراً جديداً)، كما Ocerex.
 */
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';

const STEPS: TranslationKey[] = [
  'lens.help.step1', 'lens.help.step2', 'lens.help.step3', 'lens.help.step4',
  'lens.help.step5', 'lens.help.step6', 'lens.help.step7',
];

export function LensHelpView() {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.wrap} testID="lens-help">
      <Card title={t('lens.help.title')}>
        {STEPS.map((key, index) => (
          <View key={key} style={styles.row}>
            <View style={[styles.badge, { backgroundColor: theme.colors.ink }]}>
              <AppText variant="caption" color={theme.colors.canvas}>{String(index + 1)}</AppText>
            </View>
            <AppText style={styles.text}>{t(key)}</AppText>
          </View>
        ))}
      </Card>
      <AppText variant="caption" color={theme.colors.muted}>{t('lens.help.estimateNote')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
