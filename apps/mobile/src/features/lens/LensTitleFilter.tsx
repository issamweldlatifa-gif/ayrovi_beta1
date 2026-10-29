/**
 * Lens — le filtre des résultats : LE TITRE, rien d'autre (28/10/2026).
 *
 * Le client a tranché : « نظلم الفلاتر كون فقط فلتر على عنوان… أي فلاتر عدا
 * هذا يتحيّد ». Un seul champ, donc — pas de tri, pas de « en stock », pas de
 * puces par marchand : ces leviers demandaient au client de régler ce que
 * l'application sait décider seule (l'ordre de confiance vit dans
 * `lensRanking.ts` et s'applique toujours).
 *
 * Le champ filtre le TITRE DU PRODUIT (`lensTitle.ts`) — celui que la carte
 * affiche — et non le titre de la page du site : « zalando » ne ramène donc
 * plus toutes les cartes, et « robe » ramène les robes.
 */
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';

export function LensTitleFilter({
  value,
  onChange,
  shown,
  total,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Cartes retenues / cartes reçues — le compte suit la frappe. */
  shown: number;
  total: number;
}) {
  const theme = useTheme();
  const t = useT();
  const active = value.trim().length > 0;

  return (
    <View style={styles.wrap} testID="lens-title-filter">
      <View
        style={[
          styles.field,
          {
            borderColor: active ? theme.colors.ink : theme.colors.lineControl,
            borderRadius: theme.radius.full,
            backgroundColor: LENS_COLORS.white,
          },
        ]}
      >
        <Ionicons name="search-outline" size={theme.iconSize.sm} color={theme.colors.muted} accessibilityElementsHidden />
        <TextInput
          testID="lens-title-filter-input"
          value={value}
          onChangeText={onChange}
          placeholder={t('lens.filters.title')}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={t('lens.filters.title')}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.input, theme.text('label'), { color: theme.colors.ink }]}
        />
        {active ? (
          <Pressable
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={t('lens.filters.clear')}
            testID="lens-title-filter-clear"
            hitSlop={8}
            style={({ pressed }) => [styles.clear, { opacity: pressed ? theme.opacity.subtle : 1 }]}
          >
            <Ionicons name="close-circle" size={theme.iconSize.sm} color={theme.colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {active ? (
        <AppText
          variant="caption"
          color={theme.colors.muted}
          accessibilityLiveRegion="polite"
          testID="lens-title-filter-count"
        >
          {t('lens.resultsCountMany', { count: shown })}
          {shown !== total ? ` / ${total}` : ''}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, minHeight: 44, padding: 0 },
  clear: { alignItems: 'center', justifyContent: 'center' },
});
