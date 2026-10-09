/**
 * Écran de chargement d'entrée (Q8, demande explicite).
 *
 * ── Ce qu'il remplace ───────────────────────────────────────────────────────
 * Avant, la racine rendait `null` tant que les préférences et les polices
 * n'avaient pas répondu : l'écran restait sur l'image de démarrage du système,
 * figée, sans rapport avec l'application. On montre désormais NOTRE marque,
 * animée — la seconde qui passe avant l'affichage appartient au produit, pas
 * au système.
 *
 * ── Enchaînement, et pourquoi cet ordre ─────────────────────────────────────
 * L'image de démarrage native couvre le démarrage du moteur JavaScript. On ne
 * la masque qu'APRÈS avoir peint cette écran (`onShown`) : sans cette
 * précaution, une frame vide apparaîtrait entre les deux, et ce serait pire
 * que l'image fixe qu'on cherche à remplacer.
 *
 * ── L'animation ne promet rien ──────────────────────────────────────────────
 * Le pouls dit « l'application est vivante ». Il n'indique AUCUNE progression,
 * parce qu'on n'en connaît aucune : mesurer le chargement des polices pour
 * afficher « 40 % » serait un chiffre inventé au nom du réconfort.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { BrandMark } from './BrandMark';
import { useTheme } from './theme';

export interface LoadingScreenProps {
  /** Appelé APRÈS le premier rendu : c'est le signal pour masquer l'écran natif. */
  onShown?: () => void;
}

export function LoadingScreen({ onShown }: LoadingScreenProps) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 620, useNativeDriver: true }),
      ]),
    );
    animation.start();
    // Rendu terminé : l'image de démarrage du système peut disparaître sans
    // laisser de trou.
    onShown?.();
    return () => { animation.stop(); };
  }, [onShown, pulse, theme.motion.reduced]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas }]} accessibilityRole="progressbar">
      <Animated.View style={{ opacity: pulse }}>
        <BrandMark size={64} nameSize={26} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
