/**
 * En-tête de la page Publication — CONSERVÉ tel quel lors de la refonte du
 * 13/11/2026 (consigne : « on vide la page, on garde seulement l'en-tête ») :
 * retour à gauche, titre centré, compte à droite.
 * 15/11 : le filet du bas est retiré (« نحي الخطوط ») — les blocs commencent
 * sous l'en-tête, séparés par l'espace seul.
 *
 * 16/11 (référence 003723) : barre NOIRE #262626 qui remonte sous la barre d'état,
 * flèche, titre et compte en BLANC ; le compte reprend le glyphe « profil » de la
 * barre de navigation du bas (`ReferenceNavigationGlyph kind="profile"`).
 *
 * Seule la loupe est partie : elle cherchait dans l'ancien fil de posts, qui
 * n'existe plus — un bouton qui n'ouvre rien n'a pas sa place.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { BackButton } from '@/design/BackButton';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { ReferenceNavigationGlyph } from '@/design/TabNavIcons';
import { PUBLICATION_METRICS as PM, PUBLICATION_THEME } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { PUBLICATION_TYPE, PublicationText } from './publicationDesign';

export function PublicationHeader() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const direction = theme.isRTL ? 'row-reverse' : 'row';
  const ink = PUBLICATION_THEME.headerInk;
  return (
    <View testID="publication-header-bar" style={[styles.bar, { paddingTop: insets.top }]}>
    <View
      testID="publication-header"
      style={[styles.header, { paddingHorizontal: PUBLICATION_TYPE.inset, flexDirection: direction }]}
    >
      <View style={[styles.side, { flexDirection: direction }]}>
        <BackButton onPress={() => goBack('/(tabs)')} label={t('common.back')} color={ink} />
      </View>
      <View style={styles.title}>
        <PublicationText testID="publication-header-title" numberOfLines={1} variant="label" color={ink}>
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
    minHeight: 52,
    alignItems: 'center',
  },
  side: { width: 88, alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  title: { flex: 1, alignItems: 'center' },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
