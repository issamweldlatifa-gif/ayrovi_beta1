/**
 * مساعدة Lens، مطابقة للماكيت المعتمد: عنوان «Aide et règles d'utilisation»، قواعد
 * مرقّمة بشارات برتقالية، وبطاقة ملاحظة في الأسفل. النص من `lensPolicy.ts`، ولا يُعدَّل هنا.
 */
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { LENS_POLICY } from '@/features/lens/lensPolicy';
import { LensDrawer } from '@/features/lens/LensDrawer';

export interface LensHelpProps {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}

export function LensHelp({ open, onClose, onClosed }: LensHelpProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const policy = LENS_POLICY[locale];

  return (
    <LensDrawer title={t('lens.helpOpen')} open={open} onClose={onClose} onClosed={onClosed}>
      <AppText variant="body">{policy.intro}</AppText>
      {policy.sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <AppText variant="label" weight="bold">{section.title}</AppText>
          {(section.items ?? []).map((item, index) => (
            <View key={item} style={styles.row}>
              <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
                <AppText variant="caption" weight="bold" color={theme.colors.ink}>{String(index + 1)}</AppText>
              </View>
              <AppText variant="body" style={styles.rowText}>{item}</AppText>
            </View>
          ))}
          {section.body ? (
            <View style={[styles.note, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}>
              <AppText variant="body">{section.body}</AppText>
            </View>
          ) : null}
        </View>
      ))}
      <Button label={t('lens.close')} tone="quiet" onPress={onClose} />
    </LensDrawer>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  note: { padding: 12, borderWidth: StyleSheet.hairlineWidth },
});
