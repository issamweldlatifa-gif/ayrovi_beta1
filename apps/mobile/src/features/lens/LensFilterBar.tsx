/**
 * Z Lens — barre de filtres et tri des résultats.
 *
 * Tout le calcul (filtrage, tri, facettes, compteurs) vit dans `lensFilter.ts`,
 * qui est testé sans React. Ce composant ne fait que présenter ces contrôles :
 *  • tri : choix unique parmi les modes supportés ;
 *  • facettes (marchand, marque, couleur, taille, disponibilité) : sélections
 *    multiples, uniquement quand la donnée existe vraiment ;
 *  • fourchette de prix TND servie par le serveur (aucune conversion sur l'appareil) ;
 *  • interrupteurs remise vérifiée / lien d'achat vérifié / modèle exact.
 *
 * Les changements s'appliquent immédiatement : la grille derrière le panneau se
 * met à jour et le nombre de résultats est recalculé en direct.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import type { LensAvailability } from '@/api/lens';
import { LENS_COLORS } from './lensPalette';
import { availabilityKey } from './lensView';
import {
  countActiveFilters,
  type LensControls,
  type LensFacets,
  type LensFilterState,
  type LensSortKey,
} from './lensFilter';

const SORT_OPTIONS: Array<{ value: LensSortKey; label: TranslationKey }> = [
  { value: 'relevance', label: 'lens.sort.relevance' },
  { value: 'match', label: 'lens.sort.match' },
  { value: 'price_asc', label: 'lens.sort.priceAsc' },
  { value: 'price_desc', label: 'lens.sort.priceDesc' },
  { value: 'discount', label: 'lens.sort.discount' },
  { value: 'rating', label: 'lens.sort.rating' },
];

const AVAILABILITY_ORDER: LensAvailability[] = ['in_stock', 'limited', 'out_of_stock', 'unknown'];

const toggleIn = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          // Choix actif : fond violet clair + texte en gras (même traitement que
          // le contrôle Segmented de l'identité), sans consommer le budget violet.
          borderColor: theme.colors.lineControl,
          backgroundColor: active ? LENS_COLORS.activeSoft : LENS_COLORS.white,
          opacity: pressed ? theme.opacity.subtle : 1,
        },
      ]}
    >
      <AppText variant="caption" weight={active ? 'bold' : 'regular'} color={LENS_COLORS.black} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

function FacetGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: LensFacets['merchants'];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View style={styles.group}>
      <AppText variant="caption" color={LENS_COLORS.resultMuted}>{label}</AppText>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={`${option.value} · ${option.count}`}
            active={selected.includes(option.value)}
            onPress={() => onToggle(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

function ToggleLine({ label, value, onChange, testID }: { label: string; value: boolean; onChange: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onChange}
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [styles.toggleRow, { borderColor: theme.colors.line, opacity: pressed ? theme.opacity.subtle : 1 }]}
    >
      <AppText variant="body" style={styles.toggleLabel}>{label}</AppText>
      <View style={[styles.checkbox, { borderColor: value ? LENS_COLORS.black : theme.colors.lineControl, backgroundColor: value ? LENS_COLORS.black : LENS_COLORS.white }]}>
        {value ? <Ionicons name="checkmark" size={15} color={LENS_COLORS.white} accessibilityElementsHidden /> : null}
      </View>
    </Pressable>
  );
}

export function LensFilterBar({
  controls,
  facets,
  visibleCount,
  onChange,
}: {
  controls: LensControls;
  facets: LensFacets;
  visibleCount: number;
  onChange: (next: LensControls) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');

  useEffect(() => {
    if (open) {
      setMinText(controls.filters.priceTnd.min?.toString() ?? '');
      setMaxText(controls.filters.priceTnd.max?.toString() ?? '');
    }
    // Synchronise les champs au moment d'ouvrir (une réinitialisation externe est ainsi reflétée).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeCount = countActiveFilters(controls.filters);
  const setSort = (sort: LensSortKey) => onChange({ ...controls, sort });
  const patchFilters = (patch: Partial<LensFilterState>) =>
    onChange({ ...controls, filters: { ...controls.filters, ...patch } });

  const parsePrice = (text: string): number | null => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const value = Number(cleaned);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  const reset = () => onChange({ sort: 'relevance', filters: {
    merchants: [], brands: [], colors: [], sizes: [], availability: [],
    priceTnd: { min: null, max: null }, discountOnly: false, verifiedOnly: false, exactOnly: false,
  } });

  const availabilityOptions = AVAILABILITY_ORDER
    .map((value) => ({ value, facet: facets.availability.find((entry) => entry.value === value) }))
    .filter((entry): entry is { value: LensAvailability; facet: { value: string; count: number } } => Boolean(entry.facet));

  return (
    <View testID="lens-filter-bar">
      <View style={[styles.bar, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable
          onPress={() => setOpen(true)}
          testID="lens-filter-open"
          accessibilityRole="button"
          accessibilityLabel={activeCount > 0 ? t('lens.filter.activeBadge', { count: activeCount }) : t('lens.filter.button')}
          style={({ pressed }) => [
            styles.trigger,
            { borderColor: theme.colors.lineControl, opacity: pressed ? theme.opacity.subtle : 1 },
          ]}
        >
          <Ionicons name="options-outline" size={16} color={LENS_COLORS.black} accessibilityElementsHidden />
          <AppText variant="caption" weight={activeCount > 0 ? 'bold' : 'regular'} color={LENS_COLORS.black}>
            {t('lens.filter.button')}
          </AppText>
          {activeCount > 0 ? (
            <View style={styles.badge}>
              <AppText variant="caption" weight="bold" color={LENS_COLORS.white}>{activeCount}</AppText>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => setOpen(true)}
          testID="lens-sort-open"
          accessibilityRole="button"
          accessibilityLabel={t('lens.sort.label')}
          style={({ pressed }) => [
            styles.trigger,
            { borderColor: theme.colors.lineControl, opacity: pressed ? theme.opacity.subtle : 1, flex: 1 },
          ]}
        >
          <Ionicons name="swap-vertical-outline" size={16} color={LENS_COLORS.black} accessibilityElementsHidden />
          <AppText variant="caption" color={LENS_COLORS.resultMuted} numberOfLines={1}>
            {`${t('lens.sort.label')} · ${t(SORT_OPTIONS.find((option) => option.value === controls.sort)?.label ?? 'lens.sort.relevance')}`}
          </AppText>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.sheetContainer}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: LENS_COLORS.cameraScrim }]} onPress={() => setOpen(false)} />
        <View
          style={[styles.sheet, { backgroundColor: LENS_COLORS.white, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }]}
          accessibilityLabel={t('lens.filter.title')}
          testID="lens-filter-sheet"
        >
          <View style={[styles.sheetHeader, { borderBottomColor: LENS_COLORS.resultLine }]}>
            <AppText variant="title" weight="bold">{t('lens.filter.title')}</AppText>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('sheet.close')} hitSlop={10}>
              <Ionicons name="close" size={22} color={LENS_COLORS.black} accessibilityElementsHidden />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.group}>
              <AppText variant="caption" color={LENS_COLORS.resultMuted}>{t('lens.sort.label')}</AppText>
              <View style={styles.chipWrap}>
                {SORT_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={t(option.label)}
                    active={controls.sort === option.value}
                    onPress={() => setSort(option.value)}
                    testID={`lens-sort-${option.value}`}
                  />
                ))}
              </View>
            </View>

            <FacetGroup
              label={t('lens.filter.merchant')}
              options={facets.merchants}
              selected={controls.filters.merchants}
              onToggle={(value) => patchFilters({ merchants: toggleIn(controls.filters.merchants, value) })}
            />
            <FacetGroup
              label={t('lens.filter.brand')}
              options={facets.brands}
              selected={controls.filters.brands}
              onToggle={(value) => patchFilters({ brands: toggleIn(controls.filters.brands, value) })}
            />
            <FacetGroup
              label={t('lens.filter.color')}
              options={facets.colors}
              selected={controls.filters.colors}
              onToggle={(value) => patchFilters({ colors: toggleIn(controls.filters.colors, value) })}
            />
            <FacetGroup
              label={t('lens.filter.size')}
              options={facets.sizes}
              selected={controls.filters.sizes}
              onToggle={(value) => patchFilters({ sizes: toggleIn(controls.filters.sizes, value) })}
            />

            {availabilityOptions.length > 0 ? (
              <View style={styles.group}>
                <AppText variant="caption" color={LENS_COLORS.resultMuted}>{t('lens.filter.availability')}</AppText>
                <View style={styles.chipWrap}>
                  {availabilityOptions.map(({ value, facet }) => (
                    <Chip
                      key={value}
                      label={`${t(availabilityKey(value))} · ${facet.count}`}
                      active={controls.filters.availability.includes(value)}
                      onPress={() => patchFilters({ availability: toggleIn(controls.filters.availability, value) as LensAvailability[] })}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {facets.hasPriceTnd > 0 ? (
              <View style={styles.group}>
                <AppText variant="caption" color={LENS_COLORS.resultMuted}>{t('lens.filter.price')}</AppText>
                <View style={[styles.priceRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
                  <TextInput
                    value={minText}
                    onChangeText={(text) => {
                      setMinText(text);
                      patchFilters({ priceTnd: { ...controls.filters.priceTnd, min: parsePrice(text) } });
                    }}
                    keyboardType="numeric"
                    placeholder={t('lens.filter.priceMin')}
                    placeholderTextColor={LENS_COLORS.resultMuted}
                    style={[styles.priceInput, { borderColor: theme.colors.lineControl, color: LENS_COLORS.black }]}
                    testID="lens-filter-price-min"
                  />
                  <TextInput
                    value={maxText}
                    onChangeText={(text) => {
                      setMaxText(text);
                      patchFilters({ priceTnd: { ...controls.filters.priceTnd, max: parsePrice(text) } });
                    }}
                    keyboardType="numeric"
                    placeholder={t('lens.filter.priceMax')}
                    placeholderTextColor={LENS_COLORS.resultMuted}
                    style={[styles.priceInput, { borderColor: theme.colors.lineControl, color: LENS_COLORS.black }]}
                    testID="lens-filter-price-max"
                  />
                </View>
              </View>
            ) : null}

            {facets.hasVerifiedDiscount > 0 ? (
              <ToggleLine
                label={t('lens.filter.discountOnly')}
                value={controls.filters.discountOnly}
                onChange={() => patchFilters({ discountOnly: !controls.filters.discountOnly })}
                testID="lens-filter-discount"
              />
            ) : null}
            {facets.verifiedCount > 0 ? (
              <ToggleLine
                label={t('lens.filter.verifiedOnly')}
                value={controls.filters.verifiedOnly}
                onChange={() => patchFilters({ verifiedOnly: !controls.filters.verifiedOnly })}
                testID="lens-filter-verified"
              />
            ) : null}
            {facets.exactMatchCount > 0 ? (
              <ToggleLine
                label={t('lens.filter.exactOnly')}
                value={controls.filters.exactOnly}
                onChange={() => patchFilters({ exactOnly: !controls.filters.exactOnly })}
                testID="lens-filter-exact"
              />
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: LENS_COLORS.resultLine }]}>
            <Button label={t('lens.filter.reset')} tone="quiet" onPress={reset} style={styles.footerButton} testID="lens-filter-reset" />
            <Button
              label={t('lens.filter.showResults', { count: visibleCount })}
              onPress={() => setOpen(false)}
              style={styles.footerButton}
              testID="lens-filter-apply"
            />
          </View>
        </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 999,
    paddingHorizontal: 12, minHeight: 38, justifyContent: 'center',
  },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: LENS_COLORS.black, alignItems: 'center', justifyContent: 'center',
  },
  // La feuille est placée dans le flux (flex + alignement en bas), pas en absolute :
  // le voile reste la seule superposition, via StyleSheet.absoluteFill.
  sheetContainer: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '78%' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 16, gap: 16 },
  group: { gap: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 34, justifyContent: 'center',
  },
  priceRow: { gap: 10 },
  priceInput: {
    flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    minHeight: 44, paddingHorizontal: 12, textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, minHeight: 48,
  },
  toggleLabel: { flex: 1 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  footer: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: { flex: 1 },
});
