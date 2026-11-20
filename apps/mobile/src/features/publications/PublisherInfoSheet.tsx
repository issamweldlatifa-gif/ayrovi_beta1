import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppSheet } from '@/design/sheet/AppSheet';
import { AppText } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

/** Explain this collection's actual rules, not Zalando's personalization system. */
export function PublisherInfoSheet({ open, close, onClosed }: { open: boolean; close: () => void; onClosed: () => void }) {
  const t = useT();
  const theme = useTheme();
  const ink = theme.colors.ink;
  const direction = rowDirectionFor(theme.isRTL);
  return <AppSheet open={open} onDismiss={close} onClosed={onClosed} presentation="bottom" heightRatio={0.73}
    header={<View style={[styles.closeBar, { flexDirection: direction }]}>
      <Pressable testID="publisher-info-close" accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} style={styles.close}>
        <Ionicons name="close-outline" size={theme.iconSize.lg} color={ink} />
      </Pressable>
    </View>}>
    <View testID="publisher-info-sheet" style={styles.content}>
      <AppText variant="h2" accessibilityRole="header">{t('publisher.infoTitle')}</AppText>
      <AppText variant="body">{t('publisher.info')}</AppText>
      <View style={[styles.heading, { flexDirection: direction }]}>
        <Ionicons name="grid-outline" size={theme.iconSize.md} color={ink} />
        <AppText variant="h3" accessibilityRole="header">{t('publisher.infoCollection')}</AppText>
      </View>
      <AppText variant="body">{t('publisher.infoOrder')}</AppText>
      <AppText variant="body" color={theme.colors.muted}>{t('publisher.infoFilter')}</AppText>
      <View style={[styles.heading, { flexDirection: direction }]}>
        <Ionicons name="person-outline" size={theme.iconSize.md} color={ink} />
        <AppText variant="h3" accessibilityRole="header">{t('publisher.infoAccount')}</AppText>
      </View>
      <AppText variant="body">{t('publisher.infoAccountBody')}</AppText>
    </View>
  </AppSheet>;
}

const styles = StyleSheet.create({
  closeBar: { justifyContent: 'flex-end' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 16, paddingBottom: 24 },
  heading: { gap: 8, alignItems: 'center', marginTop: 8 },
});
