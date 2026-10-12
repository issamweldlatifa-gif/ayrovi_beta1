/**
 * مساعدة Lens: سياسة الاستعمال (مسموح / ممنوع) باللغة الحالية للتطبيق.
 * النص في `lensPolicy.ts` — لا يُعدَّل هنا.
 */
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/design/ui';
import { useI18n } from '@/i18n';
import { LENS_POLICY } from '@/features/lens/lensPolicy';
import { LensDrawer } from '@/features/lens/LensDrawer';

export interface LensHelpProps {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}

export function LensHelp({ open, onClose, onClosed }: LensHelpProps) {
  const { t, locale } = useI18n();
  const policy = LENS_POLICY[locale];

  return (
    <LensDrawer title={t('lens.help.title')} open={open} onClose={onClose} onClosed={onClosed}>
      <AppText variant="body">{policy.intro}</AppText>
      {policy.sections.map((section) => (
        <Card key={section.title} title={section.title}>
          {section.items ? (
            <View style={styles.list}>
              {section.items.map((item) => (
                <AppText key={item} variant="body">{`• ${item}`}</AppText>
              ))}
            </View>
          ) : null}
          {section.body ? <AppText variant="body">{section.body}</AppText> : null}
        </Card>
      ))}
      <Button label={t('lens.close')} tone="quiet" onPress={onClose} />
    </LensDrawer>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
});
