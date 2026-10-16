/**
 * Bande de puces : les objets REPÉRÉS dans la photo.
 *
 * Le problème qu'elle règle : les boîtes existent sur la photo, mais quand la
 * feuille monte, la photo sort de l'écran — l'utilisateur ne voit plus CE QUI
 * a été repéré, seulement des cartes produits. Google met cette information
 * au premier plan ; nous aussi, sans laisser croire qu'il y a plus de
 * produits qu'il n'y en a.
 *
 * RÈGLE : aucune valeur inventée.
 *   • le NOM vient de la détection du serveur (`LensDetectedProduct.name`) ;
 *   • le NOMBRE de produits n'est affiché que pour la cible COURANTE — les
 *     autres cibles n'ont pas encore été cherchées, on ne leur invente pas de
 *     score.
 */
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import type { LensDetectedProduct } from '@/api/lens';
import { LENS_COLORS } from './lensPalette';

export function LensDetectedChips({
  products,
  selectedIndex,
  resultCount,
  onSelect,
}: {
  /** Objets repérés par la vision (serveur). */
  products: readonly LensDetectedProduct[];
  /** Index de la cible courante (-1 : cadre tracé à la main). */
  selectedIndex: number;
  /** Produits trouvés pour la cible courante — connu pour elle seule. */
  resultCount?: number;
  /** Choisir une cible : la recherche repart sur cette zone. */
  onSelect: (index: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  if (products.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      testID="lens-detected-chips"
    >
      {products.map((product, index) => {
        const active = index === selectedIndex;
        const name = String(product.name || '').trim();
        return (
          <Pressable
            key={`${product.category}:${index}`}
            onPress={() => onSelect(index)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t('lens.select.product', { name })}
            style={({ pressed }) => [
              styles.chip,
              active
                ? { backgroundColor: LENS_COLORS.active, borderColor: LENS_COLORS.active }
                : { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
              pressed ? styles.pressed : null,
            ]}
            testID={`lens-detected-chip-${index}`}
          >
            <AppText
              variant="caption"
              weight="semibold"
              color={active ? LENS_COLORS.white : theme.colors.ink}
              numberOfLines={1}
            >
              {name}
            </AppText>
            {active && typeof resultCount === 'number' ? (
              <AppText variant="caption" color={active ? LENS_COLORS.white : theme.colors.muted}>
                {resultCount}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chip: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  pressed: { opacity: 0.7 },
});
