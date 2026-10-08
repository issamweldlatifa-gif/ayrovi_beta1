/**
 * Squelettes de chargement — la forme du contenu PENDANT qu'il arrive.
 *
 * Pourquoi : un écran qui remplaçait son contenu par un spinner donnait
 * l'impression d'un trou, surtout sur un réseau lent. Le squelette montre la
 * STRUCTURE attendue : la perception de vitesse augmente sans inventer de
 * donnée (règle du projet : jamais de contenu fictif).
 *
 * Le jeton `theme.opacity.skeleton` existait dans `tokens.mobile.ts` sans
 * composant pour le porter : c'est ici qu'il vit maintenant.
 *
 * Accessibilité : un `AccessibilityInfo.isReduceMotionEnabled()` actif (ou le
 * jeton `motion.reduced`) fige le bloc — pas de pulsation pour qui a demandé
 * moins de mouvement.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Skeleton({
  style, width = '100%', height = 16, radius, testID,
}: {
  style?: StyleProp<ViewStyle>;
  /** `DimensionValue` : un nombre de points ou un pourcentage (`'80%'`). */
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  testID?: string;
}) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  const reduced = theme.motion.reduced === 0;

  useEffect(() => {
    if (reduced) return; // mouvement réduit : bloc statique, lisible
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: theme.opacity.skeleton,
          duration: theme.duration.standard,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: theme.duration.standard,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, theme.opacity.skeleton, theme.duration.standard]);

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors.line,
          opacity: reduced ? theme.opacity.skeleton : pulse,
        },
        style,
      ]}
    />
  );
}

/** Le héros de l'accueil : un bloc média pleine largeur, ratio 16/9. */
export function HeroSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <Skeleton style={[{ aspectRatio: 16 / 9, borderRadius: theme.radius.card }, style]} testID="skeleton-hero" />;
}

/** Une rangée de liste : vignette + deux lignes de texte. */
export function ListRowSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderTopColor: theme.colors.line }]}>
      <Skeleton width={56} height={56} radius={theme.radius.control} />
      <View style={styles.rowText}>
        <Skeleton height={14} width="80%" />
        <Skeleton height={12} width="55%" />
      </View>
    </View>
  );
}

/** `count` rangées — pour panier, commandes, favoris, historique Lens. */
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View testID="skeleton-list">
      {Array.from({ length: count }, (_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 8 },
});
