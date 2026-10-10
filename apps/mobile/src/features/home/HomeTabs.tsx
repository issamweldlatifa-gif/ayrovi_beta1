/**
 * Les trois onglets d’accueil — وصل حديثاً · عروض · مجلة
 *
 * Présentation : une rangée de libellés en gras, sur fond blanc, sans icône ni
 * cadre (façon barre de catégories d’une grande boutique). Le texte est dans la
 * police principale de l’application, au même poids (gras) que la référence.
 *
 * Chaque onglet ouvre un écran NATIF de l’application (jamais une page du site) :
 * « Nouveautés » → catalogue, « Promotions » et « Magazine » → leurs écrans publiés.
 */
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

type HomeTab = {
  /** Clé de libellé — jamais de texte écrit en dur. */
  labelKey: 'home.tab.arrivals' | 'home.tab.promotions' | 'home.tab.magazine';
  /** Destination : une route de l’APPLICATION, pas une URL de site. */
  href: string;
};

const TABS: readonly HomeTab[] = [
  { labelKey: 'home.tab.arrivals', href: '/catalog' },
  { labelKey: 'home.tab.promotions', href: '/promotions' },
  { labelKey: 'home.tab.magazine', href: '/publications' },
];

export function HomeTabs() {
  const theme = useTheme();
  const t = useT();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ backgroundColor: theme.colors.canvas }}
      contentContainerStyle={[
        styles.row,
        // En arabe le premier onglet est à DROITE.
        { flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => (
        <Pressable
          key={tab.labelKey}
          onPress={() => { router.push(tab.href as never); }}
          accessibilityRole="tab"
          accessibilityLabel={t(tab.labelKey)}
          hitSlop={8}
          style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="lead" weight="bold" color={theme.colors.ink} style={styles.label}>
            {t(tab.labelKey)}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    paddingVertical: 4,
  },
  label: {
    // Une seule ligne : un libellé plus long ne doit pas passer à la ligne.
    flexShrink: 0,
  },
});
