/**
 * En-tête de la page Publication — CONSERVÉ tel quel lors de la refonte du
 * 13/11/2026 (consigne : « on vide la page, on garde seulement l'en-tête ») :
 * retour à gauche, titre centré, compte à droite, filet en bas.
 *
 * Seule la loupe est partie : elle cherchait dans l'ancien fil de posts, qui
 * n'existe plus — un bouton qui n'ouvre rien n'a pas sa place.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { BackButton } from '@/design/BackButton';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { PUBLICATION_METRICS as PM } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import {
  PUBLICATION_PALETTE as P,
  PUBLICATION_TYPE,
  PublicationIcon,
  PublicationText,
} from './publicationDesign';

export function PublicationHeader() {
  const theme = useTheme();
  const { t } = useI18n();
  const direction = theme.isRTL ? 'row-reverse' : 'row';
  return (
    <View
      testID="publication-header"
      style={[styles.header, { paddingHorizontal: PUBLICATION_TYPE.inset, flexDirection: direction }]}
    >
      <View style={[styles.side, { flexDirection: direction }]}>
        <BackButton onPress={() => goBack('/(tabs)')} label={t('common.back')} color={P.ink} />
      </View>
      <View style={styles.title}>
        <PublicationText testID="publication-header-title" numberOfLines={1} variant="label" color={P.ink}>
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
          <PublicationIcon name="person-outline" size={PM.icon} color={P.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 52,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.line,
    backgroundColor: P.paper,
  },
  side: { width: 88, alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  title: { flex: 1, alignItems: 'center' },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
