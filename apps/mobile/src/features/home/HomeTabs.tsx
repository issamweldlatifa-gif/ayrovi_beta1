/**
 * Les trois onglets d’accueil — وصل حديثاً · عروض · مجلة
 *
 * ── La différence qui compte ───────────────────────────────────────────────
 * `NavStrip` (l’ancienne barre) ouvrait des pages du SITE dans le navigateur :
 * ses destinations venaient de l’Admin et pointaient vers `/arrivage`,
 * `/privacy`… La consigne est l’inverse : « تبويبات ثلاث … يفتحو داخل تطبيق ».
 * Ces trois onglets ouvrent donc des ÉCRANS NATIFS — on reste dans
 * l’application, avec sa navigation, son thème et son sens de lecture.
 *
 * ── Pourquoi des destinations déjà existantes ──────────────────────────────
 * « Nouveautés » mène au catalogue, « Promotions » et « Magazine » à leurs
 * écrans publiés. Aucun écran vide n’a été fabriqué pour meubler : mieux vaut
 * une destination réelle qu’un onglet qui s’ouvre sur du vide.
 *
 * ── Pages volontairement non remplies ──────────────────────────────────────
 * Consigne : « خلي صفحاتهم فاظيه الي ان نصل الي محتواهم ». Le contenu de ces
 * écrans viendra à son étape ; les onglets, eux, fonctionnent dès maintenant et
 * ne mentent pas sur où ils mènent.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

type HomeTab = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Clé de libellé — jamais de texte écrit en dur. */
  labelKey: 'home.tab.arrivals' | 'home.tab.promotions' | 'home.tab.magazine';
  /** Destination : une route de l’APPLICATION, pas une URL de site. */
  href: string;
};

const TABS: readonly HomeTab[] = [
  { icon: 'sparkles-outline', labelKey: 'home.tab.arrivals', href: '/catalog' },
  { icon: 'pricetag-outline', labelKey: 'home.tab.promotions', href: '/promotions' },
  { icon: 'book-outline', labelKey: 'home.tab.magazine', href: '/publications' },
];

export function HomeTabs() {
  const theme = useTheme();
  const t = useT();

  return (
    <View
      style={[
        styles.row,
        {
          // En arabe le premier onglet est à DROITE.
          flexDirection: theme.isRTL ? 'row-reverse' : 'row',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.card,
          borderColor: theme.colors.line,
        },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => (
        <Pressable
          key={tab.labelKey}
          onPress={() => { router.push(tab.href as never); }}
          accessibilityRole="tab"
          accessibilityLabel={t(tab.labelKey)}
          style={({ pressed }) => [
            styles.tab,
            { borderColor: theme.colors.line, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name={tab.icon} size={20} color={theme.colors.accent} />
          <AppText variant="caption" weight="bold" align="center" style={styles.label}>
            {t(tab.labelKey)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 12,
    marginVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    // Le séparateur est posé à la FIN de chaque onglet sauf le dernier : une
    // bordure des deux côtés doublerait la ligne entre deux onglets.
    borderEndWidth: 0,
  },
  label: {
    // Les libellés sont courts et sur une seule ligne : sans cela, une langue
    // plus longue ferait grandir un onglet par rapport aux autres.
    flexShrink: 1,
  },
});
