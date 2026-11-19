import { RHYTHM, TEXT_FRAME } from '@/design/tokens.mobile';
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
import { useState } from 'react';
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
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap} testID="lens-title-filter">
      <View
        style={[
          styles.field,
          {
            flexDirection: theme.isRTL ? 'row-reverse' : 'row',
            borderColor: focused ? LENS_COLORS.black : LENS_COLORS.resultMuted,
            borderRadius: theme.radius.full,
            backgroundColor: LENS_COLORS.white,
          },
        ]}
      >
        <Ionicons name="search-outline" size={theme.iconSize.sm} color={LENS_COLORS.resultMuted} accessibilityElementsHidden />
        <TextInput
          testID="lens-title-filter-input"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t('lens.filters.title')}
          placeholderTextColor={LENS_COLORS.resultMuted}
          accessibilityLabel={t('lens.filters.title')}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.input, theme.text('body'), { color: LENS_COLORS.black, textAlign: theme.isRTL ? 'right' : 'left' }]}
        />
        {active ? (
          <Pressable
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={t('lens.filters.clear')}
            testID="lens-title-filter-clear"
            style={({ pressed }) => [styles.clear, { opacity: pressed ? theme.opacity.subtle : 1 }]}
          >
            <Ionicons name="close-circle" size={theme.iconSize.sm} color={LENS_COLORS.resultMuted} />
          </Pressable>
        ) : null}
      </View>
      {active ? (
        <AppText
          variant="caption"
          color={LENS_COLORS.resultMuted}
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
  wrap: { gap: RHYTHM.inline },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: RHYTHM.related,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: TEXT_FRAME.inputVertical, paddingHorizontal: 0 },
  clear: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
