import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RHYTHM, PUBLICATION_THEME } from '@/design/tokens.mobile';
import { PublicationHeader } from '@/features/publications/PublicationHeader';
import { PublicationText } from '@/features/publications/publicationDesign';
import { useT } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function PublicationsScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();

  return (
    <View testID="publication-page" style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {focused ? <StatusBar style="dark" /> : null}
      <PublicationHeader />
      <View style={styles.empty}>
        <PublicationText color={PUBLICATION_THEME.muted}>{t('publication.empty')}</PublicationText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PUBLICATION_THEME.headerBar },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: RHYTHM.section },
});
