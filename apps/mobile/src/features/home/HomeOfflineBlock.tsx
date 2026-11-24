/**
 * Le seul message d'échec de l'accueil : il n'apparaît que lorsque tout a
 * échoué (voir `homeState.ts`). Il explique et propose de réessayer — sans
 * promettre un contenu qui n'existe pas.
 */
import { StyleSheet, View } from 'react-native';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { RHYTHM } from '@/design/rhythm';
import { useT } from '@/i18n';

export function HomeOfflineBlock({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  const t = useT();
  return <View testID="home-offline" style={[styles.wrap, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}>
    <AppText variant="bodyStrong" accessibilityRole="header">{t('home.offline.title')}</AppText>
    <AppText variant="body" color={theme.colors.secondary}>{t('home.offline.body')}</AppText>
    <Button label={t('home.offline.retry')} tone="quiet" block onPress={onRetry} testID="home-offline-retry" />
  </View>;
}

const styles = StyleSheet.create({
  wrap: { borderWidth: StyleSheet.hairlineWidth, padding: RHYTHM.group, gap: RHYTHM.related, marginTop: RHYTHM.group },
});
