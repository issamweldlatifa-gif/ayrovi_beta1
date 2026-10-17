/**
 * Z Lens — « Produits interdits » (menu ⋮).
 *
 * Contenu repris À L'IDENTIQUE des règles d'utilisation déjà publiées sur le
 * site (`client/src/ayrovix/components/LensHelp.tsx`, section « 18 ans et plus
 * · utilisation autorisée ») : aucune règle nouvelle n'est inventée ici.
 */
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';

const RULES: TranslationKey[] = ['lens.rules.item1', 'lens.rules.item2', 'lens.rules.item3', 'lens.rules.item4'];

export function LensRulesView() {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.wrap} testID="lens-rules">
      <AppText variant="title" align="center">{t('lens.menu.rules')}</AppText>
      <AppText color={theme.colors.muted} align="center">{t('lens.rules.intro')}</AppText>
      <View style={styles.list}>
        {RULES.map((key) => (
          <View key={key} style={[styles.row, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="ban-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
            <AppText style={styles.text}>{t(key)}</AppText>
          </View>
        ))}
      </View>
      <AppText variant="caption" color={theme.colors.muted}>{t('lens.rules.outro')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  list: { gap: 8, marginTop: 4 },
  row: { gap: 12, alignItems: 'flex-start', paddingVertical: 4 },
  text: { flex: 1 },
});
