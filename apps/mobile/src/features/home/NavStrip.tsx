/**
 * Barre publique « Découvrir AYROVI » (`/api/public/navigation`).
 *
 * Les destinations viennent de l'Admin et pointent vers des PAGES DU SITE
 * (`/arrivage`, `/privacy`…). Ces écrans n'existent pas encore en natif : on
 * ouvre donc la page du site dans le navigateur, et on le DIT (icône de sortie).
 * Un onglet qui prétend rester dans l'application serait un mensonge.
 */
import { Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { apiUrl } from '@/api/client';
import type { NavLink } from '@/api/public';

export function NavStrip({ links }: { links: NavLink[] }) {
  const theme = useTheme();
  const { locale } = useI18n();

  // Liste vide = l'Admin a tout masqué : on masque la barre entière.
  if (!links.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={locale === 'ar' ? 'اكتشف AYROVI' : 'Découvrir AYROVI'}
    >
      {links.map((link) => (
        <Pressable
          key={link.id || link.href}
          accessibilityRole="link"
          accessibilityLabel={locale === 'ar' ? link.labelAr : link.labelFr}
          onPress={() => { Linking.openURL(apiUrl(link.href)).catch(() => {}); }}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: pressed ? theme.colors.surface : 'transparent',
              borderColor: theme.colors.lineControl,
              borderRadius: theme.radius.cta,
              minHeight: theme.geometry.minTarget,
            },
          ]}
        >
          <AppText variant="label" weight="bold" numberOfLines={1}>
            {locale === 'ar' ? link.labelAr : link.labelFr}
          </AppText>
          <Ionicons name="open-outline" size={14} color={theme.colors.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth,
  },
});
