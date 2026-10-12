/**
 * مساعدة Lens: سياسة الاستعمال (مسموح / ممنوع) باللغة الحالية للتطبيق.
 * النص في `src/features/lens/lensPolicy.ts` — لا يُعدَّل هنا.
 */
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { useI18n } from '@/i18n';
import { LENS_POLICY } from '@/features/lens/lensPolicy';
import { router } from 'expo-router';

export default function LensHelpScreen() {
  const { t, locale } = useI18n();
  const policy = LENS_POLICY[locale];

  return (
    <SubScreen title={t('lens.help.title')} fallback="/(tabs)/lens">
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
      <Button label={t('lens.close')} tone="quiet" onPress={() => router.back()} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
});
