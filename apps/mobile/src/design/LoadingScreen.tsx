/**
 * Écran de chargement d'entrée — le Z ZAYROVI dans un anneau (maquette du 2026-10-16).
 *
 * ── Enchaînement à l'ouverture ──────────────────────────────────────────────
 * 1. L'image de démarrage NATIVE (app.json : Z blanc sur fond noir #0A0A0A, dans
 *    les deux thèmes) couvre le démarrage du moteur JavaScript.
 * 2. Cet écran prend le relais pendant que les préférences et les polices se
 *    chargent : le Z gris au centre d'un anneau clair, un arc plus foncé tourne.
 * On ne masque l'image native qu'APRÈS avoir peint cet écran (`onShown`) : sans
 * cette précaution, une frame vide apparaîtrait entre les deux.
 *
 * ── L'animation ne promet rien ──────────────────────────────────────────────
 * L'arc dit « l'application est vivante ». Il n'indique AUCUNE progression,
 * parce qu'on n'en connaît aucune : il tourne, il ne se remplit pas. Si le système
 * demande moins d'animations, l'arc reste immobile.
 *
 * Couleurs : jetons du thème — Z et arc en `muted`, anneau en `line`, fond `canvas`.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ZMark } from './BrandMark';
import { useReduceMotion } from './motion';
import { useTheme } from './theme';

export interface LoadingScreenProps {
  /** Appelé APRÈS le premier rendu : c'est le signal pour masquer l'écran natif. */
  onShown?: () => void;
}

/** Proportions de la maquette : anneau ≈ 37 % de la largeur, Z ≈ 73 % de l'anneau, arc ≈ 70°. */
export const RING = { size: 136, track: 4, arc: 6, arcDegrees: 70, zShare: 0.72, turnMs: 1100 } as const;

/** Arc de `degrees` partant de midi, sur un cercle de rayon `r` centré en (c, c). */
export function arcPath(c: number, r: number, degrees: number): string {
  const end = (degrees * Math.PI) / 180;
  const x = c + r * Math.sin(end);
  const y = c - r * Math.cos(end);
  const large = degrees > 180 ? 1 : 0;
  return `M ${c} ${c - r} A ${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

export function LoadingScreen({ onShown }: LoadingScreenProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Rendu terminé : l'image de démarrage du système peut disparaître sans laisser de trou.
    onShown?.();
  }, [onShown]);

  useEffect(() => {
    if (reduce) {
      turn.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: RING.turnMs, easing: Easing.linear, useNativeDriver: true }),
    );
    animation.start();
    return () => { animation.stop(); };
  }, [reduce, turn]);

  const c = RING.size / 2;
  const r = c - RING.arc / 2;
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View
      style={[styles.screen, { backgroundColor: theme.colors.canvas }]}
      accessibilityRole="progressbar"
      testID="loading-screen"
    >
      <View style={{ width: RING.size, height: RING.size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={RING.size} height={RING.size} style={StyleSheet.absoluteFill}>
          <Circle cx={c} cy={c} r={r} stroke={theme.colors.line} strokeWidth={RING.track} fill="none" />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <Svg width={RING.size} height={RING.size}>
            <Path
              d={arcPath(c, r, RING.arcDegrees)}
              stroke={theme.colors.muted}
              strokeWidth={RING.arc}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
        <ZMark width={Math.round(RING.size * RING.zShare)} color={theme.colors.muted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
