/**
 * مساعدة Lens: سياسة الاستعمال (مسموح / ممنوع) باللغة الحالية للتطبيق.
 * النص في `lensPolicy.ts` — لا يُعدَّل هنا.
 */
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/design/ui';
import { useI18n } from '@/i18n';
import { LENS_POLICY } from '@/features/lens/lensPolicy';
import { LensPanel } from '@/features/lens/LensPanel';

export function LensHelp({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const policy = LENS_POLICY[locale];

  return (
    <LensPanel title={t('lens.help.title')} onClose={onClose}>
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
    </LensPanel>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
});
