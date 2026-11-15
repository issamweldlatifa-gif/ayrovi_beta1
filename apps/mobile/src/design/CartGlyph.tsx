/**
 * Icône panier + badge du nombre d'articles — UNE seule forme partout
 * (en-tête principal, menu, fiche produit, navigateur AYWEBs).
 *
 * Badge : pastille pleine à l'angle supérieur (côté fin de ligne, miroir en
 * arabe), cerclée de la couleur du fond pour se détacher du trait du sac.
 * Absent à 0 : pas de « 0 » qui crie.
 */
import { StyleSheet, View } from 'react-native';
import { NavigationIcon as Ionicons } from '@/design/NavigationIcon';

import { AppText } from './ui';
import { useTheme } from './theme';
import { cartBadgeText } from '@/features/shopping/cartUnits';

export const CART_GLYPH = {
  frame: 30,
  badge: 18,
  ring: 1.5,
  offset: -5,
} as const;

export function CartGlyph({
  count,
  color,
  badgeColor,
  badgeTextColor,
  ringColor,
  size,
  testID = 'cart-glyph',
}: {
  count: number;
  /** Trait du sac. */
  color: string;
  /** Fond du badge (défaut : encre — le bleu plein reste réservé au bouton principal). */
  badgeColor?: string;
  badgeTextColor?: string;
  /** Couleur du fond sous l'icône (cercle autour du badge). */
  ringColor?: string;
  size?: number;
  testID?: string;
}) {
  const theme = useTheme();
  const text = cartBadgeText(count);
  return (
    <View testID={testID} style={styles.frame}>
      <Ionicons name="bag-outline" size={size ?? theme.iconSize.md} color={color} accessibilityElementsHidden />
      {text ? (
        <View
          testID={`${testID}-badge`}
          style={[
            styles.badge,
            {
              backgroundColor: badgeColor ?? theme.colors.ink,
              borderColor: ringColor ?? theme.colors.canvas,
            },
            theme.isRTL ? styles.badgeRTL : styles.badgeLTR,
          ]}
        >
          <AppText variant="captionStrong" color={badgeTextColor ?? theme.colors.canvas} numberOfLines={1} maxFontSizeMultiplier={1.1}>
            {text}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: CART_GLYPH.frame, height: CART_GLYPH.frame, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    minWidth: CART_GLYPH.badge,
    height: CART_GLYPH.badge,
    paddingHorizontal: 4,
    borderRadius: CART_GLYPH.badge / 2,
    borderWidth: CART_GLYPH.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLTR: { right: CART_GLYPH.offset },
  badgeRTL: { left: CART_GLYPH.offset },
});
