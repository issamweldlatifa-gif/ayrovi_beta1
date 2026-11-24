import { ZAYROVI_NEWS_ROUTE } from './DailyOfferCard';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { socialHref } from '@/features/social-commerce/navigation';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { FullBleed, useResponsive } from '@/design/layout';
import { RHYTHM } from '@/design/rhythm';
import { useT } from '@/i18n';
import type { HeroTint } from './HeroCarousel';
import { backdropLayerRange } from './heroCarouselLogic';

type HomeTab = {
  /** Clé de libellé — jamais de texte écrit en dur. */
  labelKey: 'socialCommerce.title' | 'zNews.title';
  /** Destination : une route de l’APPLICATION, pas une URL de site. */
  href: Href;
};

const TABS: readonly HomeTab[] = [
  { labelKey: 'zNews.title', href: ZAYROVI_NEWS_ROUTE },
  { labelKey: 'socialCommerce.title', href: socialHref() },
];

export function HomeTabs({ tint }: { tint?: HeroTint | null }) {
  const theme = useTheme();
  const t = useT();
  const { gutter } = useResponsive();

  return (
    <FullBleed>
      <View style={{ backgroundColor: theme.colors.canvas }}>
        {tint?.tabColors.length ? <View testID="home-tabs-hero-tint" pointerEvents="none" accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
          {tint.tabColors.map((color, index) => {
            const range = backdropLayerRange(index);
            return <Animated.View key={index} style={[StyleSheet.absoluteFill, {
              backgroundColor: color,
              opacity: range ? (tint.progress?.interpolate({ ...range, extrapolate: 'clamp' }) ?? 0) : 1,
            }]} />;
          })}
        </View> : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="home-tabs"
          style={[styles.strip, { borderColor: theme.colors.line }]}
          contentContainerStyle={[
            styles.row,
            // En arabe le premier onglet est à DROITE.
            { flexDirection: theme.isRTL ? 'row-reverse' : 'row', paddingHorizontal: gutter },
          ]}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.labelKey}
              onPress={() => { router.navigate(tab.href); }}
              // Deux destinations d'ÉCRANS différents : `tab` + `tablist`
              // annonçaient un jeu d'onglets sans aucun sélectionné.
              accessibilityRole="link"
              accessibilityLabel={t(tab.labelKey)}
              style={({ pressed }) => [styles.tab, { opacity: pressed ? theme.opacity.subtle : 1 }]}
            >
              <AppText variant="label" color={theme.colors.ink} numberOfLines={1} style={styles.label}>
                {t(tab.labelKey)}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </FullBleed>
  );
}

const styles = StyleSheet.create({
  strip: { borderBottomWidth: StyleSheet.hairlineWidth, flexGrow: 0 },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    gap: RHYTHM.group,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: RHYTHM.inline,
  },
  label: {
    // Une seule ligne : un libellé plus long ne doit pas passer à la ligne.
    flexShrink: 0,
  },
});
