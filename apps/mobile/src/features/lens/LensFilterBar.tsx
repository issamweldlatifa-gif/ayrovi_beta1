/**
 * Lens — barre de filtres des résultats (28/10/2026).
 *
 * Demande du client : « كان من المفروض أنّ فمّا نظام فلاتر موجود » — il
 * attendait un vrai système de filtres sur les cartes de résultat, pas quatre
 * cartes dans l'ordre du fournisseur.
 *
 * Trois leviers, ceux qui servent vraiment à décider un achat :
 *
 *   • TRI — pertinence, prix (dinars, croissant), ou confiance marchande ;
 *   • FILTRES — prix vérifié, en stock, boutiques de confiance uniquement ;
 *   • MARCHANDS — une puce par enseigne présente, pour ne garder qu'elle.
 *
 * Les valeurs vivent dans `lensRanking.ts` (fonctions pures, testées) : cette
 * vue ne fait que les afficher. Zéro nombre magique — tout passe par
 * `theme.iconSize`, `theme.radius`, `theme.space` et `theme.text`.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';
import { DEFAULT_FILTERS, filtersAreActive, type LensFilters, type LensSort, type MerchantTier } from './lensRanking';

export type LensFilterBarProps = {
  filters: LensFilters;
  onChange: (next: LensFilters) => void;
  /** Enseignes présentes dans le résultat (voir `presentMerchants`). */
  merchants: Array<{ key: string; label: string; count: number; tier: MerchantTier }>;
  /** Résultats retenus / résultats reçus — le compte suit les filtres. */
  shown: number;
  total: number;
};

const SORTS: Array<{ value: LensSort; labelKey: 'lens.sort.relevance' | 'lens.sort.price' | 'lens.sort.trust' }> = [
  { value: 'relevance', labelKey: 'lens.sort.relevance' },
  { value: 'price', labelKey: 'lens.sort.price' },
  { value: 'trust', labelKey: 'lens.sort.trust' },
];

function Chip({ label, active, onPress, testID, icon }: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? theme.colors.ink : theme.colors.lineControl,
          backgroundColor: active ? theme.colors.ink : LENS_COLORS.white,
          borderRadius: theme.radius.full,
          opacity: pressed ? theme.opacity.subtle : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={theme.iconSize.xs}
          color={active ? theme.colors.canvas : theme.colors.ink}
          accessibilityElementsHidden
        />
      ) : null}
      <AppText variant="caption" weight={active ? 'bold' : 'regular'} color={active ? theme.colors.canvas : theme.colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function LensFilterBar({ filters, onChange, merchants, shown, total }: LensFilterBarProps) {
  const theme = useTheme();
  const t = useT();
  const dirty = filters.sort !== 'relevance' || filtersAreActive(filters);
  const toggleMerchant = (key: string) => {
    const next = filters.merchants.includes(key)
      ? filters.merchants.filter((entry) => entry !== key)
      : [...filters.merchants, key];
    onChange({ ...filters, merchants: next });
  };

  return (
    <View style={styles.wrap} testID="lens-filters">
      {/* Ligne 1 — le TRI. Un seul choix : il décide de l'ordre, pas du contenu. */}
      <View style={[styles.row, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <AppText variant="caption" color={theme.colors.muted} style={styles.rowLabel}>{t('lens.filters.sort')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {SORTS.map((sort) => (
            <Chip
              key={sort.value}
              label={t(sort.labelKey)}
              active={filters.sort === sort.value}
              onPress={() => onChange({ ...filters, sort: sort.value })}
              testID={`lens-sort-${sort.value}`}
            />
          ))}
        </ScrollView>
      </View>

      {/* Ligne 2 — les FILTRES. Cumulables : chacun retire des cartes. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Chip
          label={t('lens.filter.priced')}
          icon="checkmark-circle-outline"
          active={filters.priced}
          onPress={() => onChange({ ...filters, priced: !filters.priced })}
          testID="lens-filter-priced"
        />
        <Chip
          label={t('lens.filter.inStock')}
          icon="bag-check-outline"
          active={filters.inStock}
          onPress={() => onChange({ ...filters, inStock: !filters.inStock })}
          testID="lens-filter-instock"
        />
        <Chip
          label={t('lens.filter.trusted')}
          icon="shield-checkmark-outline"
          active={filters.trustedOnly}
          onPress={() => onChange({ ...filters, trustedOnly: !filters.trustedOnly })}
          testID="lens-filter-trusted"
        />
        {dirty ? (
          <Chip
            label={t('lens.filters.reset')}
            icon="close-circle-outline"
            active={false}
            onPress={() => onChange({ ...DEFAULT_FILTERS })}
            testID="lens-filters-reset"
          />
        ) : null}
      </ScrollView>

      {/* Ligne 3 — les MARCHANDS présents. Un appui garde cette enseigne
          seule ; un second appui l'enlève. Rang 0 en violet (marque). */}
      {merchants.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {merchants.map((merchant) => {
            const active = filters.merchants.includes(merchant.key);
            return (
              <Chip
                key={merchant.key}
                label={merchant.label}
                active={active}
                onPress={() => toggleMerchant(merchant.key)}
                testID={`lens-merchant-${merchant.key}`}
              />
            );
          })}
        </ScrollView>
      ) : null}

      {/* Le compte change AVEC les filtres : on voit ce qu'on a retiré. */}
      {dirty ? (
        <AppText variant="caption" color={theme.colors.muted} accessibilityLiveRegion="polite">
          {t('lens.resultsCountMany', { count: shown })}
          {shown !== total ? ` / ${total}` : ''}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  row: { alignItems: 'center', gap: 8 },
  rowLabel: { minWidth: 44 },
  scroll: { gap: 6, alignItems: 'center', paddingEnd: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
