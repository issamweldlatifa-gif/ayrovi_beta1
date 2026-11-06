/**
 * Les trois onglets d’accueil — وصل حديثاً · عروض · مجلة
 *
 * Présentation : une rangée de libellés en gras, sur fond blanc, sans icône ni
 * icône (façon barre de catégories d’une grande boutique). Le texte est dans la
 * police principale de l’application, au même poids (gras) que la référence.
 *
 * Chaque onglet ouvre un écran NATIF de l’application (jamais une page du site) :
 * « Nouveautés » → catalogue, « Promotions » et « Magazine » → leurs écrans publiés.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { FullBleed, useResponsive } from '@/design/layout';
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
  const { gutter } = useResponsive();

  return (
    <FullBleed>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="home-tabs"
      style={[styles.strip, { backgroundColor: theme.colors.canvas, borderColor: theme.colors.line }]}
      contentContainerStyle={[
        styles.row,
        // En arabe le premier onglet est à DROITE.
        { flexDirection: theme.isRTL ? 'row-reverse' : 'row', paddingHorizontal: gutter },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab, index) => (
        <Pressable
          key={tab.labelKey}
          onPress={() => { router.push(tab.href as never); }}
          accessibilityRole="tab"
          accessibilityLabel={t(tab.labelKey)}
          style={({ pressed }) => [styles.tab, { opacity: pressed ? theme.opacity.subtle : 1 }]}
        >
          <AppText variant="subtitle" color={theme.colors.ink} numberOfLines={1} style={[styles.label, { fontFamily: theme.text('h3').fontFamily }]}>
            {t(tab.labelKey)}
          </AppText>
          {index === 0 ? <View testID="home-tab-underline" style={[styles.underline, { backgroundColor: theme.colors.ink }]} /> : null}
        </Pressable>
      ))}
    </ScrollView>
    </FullBleed>
  );
}

const styles = StyleSheet.create({
  strip: { borderTopWidth: 1, borderBottomWidth: 1, flexGrow: 0 },
  row: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  underline: { height: 1, marginTop: 2 },
  label: {
    // Une seule ligne : un libellé plus long ne doit pas passer à la ligne.
    flexShrink: 0,
  },
});
