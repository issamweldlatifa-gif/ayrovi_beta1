/**
 * Barre au-dessus d'une grille produits : « N articles » à gauche, bascule
 * grandes / petites photos à droite (référence : « 2837 Articles | Filtrer »).
 *
 * Le choix est un RÉGLAGE (`prefs.productDensity`) : il suit le client d'une
 * grille à l'autre (boutique, Lens) et survit au redémarrage.
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from './ui';
import { useTheme } from './theme';
import { rowDirectionFor } from './layoutLogic';
import { isProductDensity, nextProductDensity, type ProductDensity } from './productTile';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';

/** Affichage choisi (grille par défaut) et la bascule qui l'enregistre. */
export function useProductDensity(): { density: ProductDensity; toggle: () => void } {
  const prefs = usePrefs();
  const density: ProductDensity = isProductDensity(prefs.productDensity) ? prefs.productDensity : 'grid';
  const { setProductDensity } = prefs;
  const toggle = useCallback(() => {
    setProductDensity?.(nextProductDensity(density));
  }, [density, setProductDensity]);
  return { density, toggle };
}

/**
 * Bouton de bascule. L'icône montre CE QU'ON VA OBTENIR (un grand carré quand
 * on est en grille, une grille quand on est en grandes photos), le libellé le dit.
 */
export function ProductDensityToggle({
  density,
  onToggle,
  color,
  testID = 'product-density-toggle',
}: {
  density: ProductDensity;
  onToggle: () => void;
  color?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const t = useT();
  const toLarge = density === 'grid';
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={toLarge ? t('products.view.large') : t('products.view.grid')}
      accessibilityState={{ selected: density === 'large' }}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [styles.toggle, { opacity: pressed ? theme.opacity.subtle : 1 }]}
    >
      <Ionicons
        name={toLarge ? 'square-outline' : 'grid-outline'}
        size={theme.iconSize.md}
        color={color ?? theme.colors.ink}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

/** « N articles » + bascule, sur une ligne de 48. */
export function ProductGridBar({
  count,
  density,
  onToggle,
  inset = 0,
  testID = 'product-grid-bar',
}: {
  count: number;
  density: ProductDensity;
  onToggle: () => void;
  /** Retrait du texte quand la grille est bord à bord. */
  inset?: number;
  testID?: string;
}) {
  const theme = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={[styles.bar, { flexDirection: rowDirectionFor(theme.isRTL), paddingHorizontal: inset }]}>
      <AppText variant="body" color={theme.colors.muted} numberOfLines={1} style={styles.count} testID={`${testID}-count`}>
        {t(count === 1 ? 'products.countOne' : 'products.countMany', { count })}
      </AppText>
      <ProductDensityToggle density={density} onToggle={onToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 48, alignItems: 'center', gap: 8 },
  count: { flex: 1 },
  toggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
