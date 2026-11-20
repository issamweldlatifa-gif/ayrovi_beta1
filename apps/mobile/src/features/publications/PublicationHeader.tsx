/** White Publication navigation bar; the screen owns the system inset. */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { BackButton } from '@/design/BackButton';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { ReferenceNavigationGlyph } from '@/design/TabNavIcons';
import { PUBLICATION_METRICS as PM, PUBLICATION_THEME } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { PUBLICATION_TYPE, PublicationText } from './publicationDesign';

export const PUBLICATION_HEADER_HEIGHT = 52;

export function PublicationHeader() {
  const theme = useTheme();
  const { t } = useI18n();
  const direction = theme.isRTL ? 'row-reverse' : 'row';
  const ink = PUBLICATION_THEME.headerInk;
  return (
    <View testID="publication-header-bar" style={styles.bar}>
    <View
      testID="publication-header"
      style={[styles.header, { paddingHorizontal: PUBLICATION_TYPE.inset, flexDirection: direction }]}
    >
      <View style={[styles.side, { flexDirection: direction }]}>
        <BackButton onPress={() => goBack('/(tabs)')} label={t('common.back')} color={ink} />
      </View>
      <View style={styles.title}>
        <PublicationText testID="publication-header-title" accessibilityRole="header" numberOfLines={1} variant="label" color={ink}>
          {t('publication.title')}
        </PublicationText>
      </View>
      <View style={[styles.side, styles.end, { flexDirection: direction }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('publication.account')}
          testID="publication-header-account"
          onPress={() => router.push('/(tabs)/account')}
          style={styles.icon}
        >
          <ReferenceNavigationGlyph kind="profile" size={PM.icon} color={ink} />
        </Pressable>
      </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: PUBLICATION_THEME.headerBar },
  header: {
    height: PUBLICATION_HEADER_HEIGHT,
    alignItems: 'center',
  },
  side: { width: 88, alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  title: { flex: 1, alignItems: 'center' },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
