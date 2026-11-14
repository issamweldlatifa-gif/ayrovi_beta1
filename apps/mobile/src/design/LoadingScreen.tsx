/**
 * Écran de chargement d'entrée — le Z zébré zayrovi (v7) dans un anneau (maquette du 2026-10-16).
 *
 * ── Enchaînement à l'ouverture ──────────────────────────────────────────────
 * 1. L'image de démarrage NATIVE (app.json : Z zébré blanc sur fond noir #0A0A0A, dans
 *    les deux thèmes) couvre le démarrage du moteur JavaScript ; BrandEntrance la reprend
 *    au pixel près puis l'ouvre sur le blanc de l'application.
 * 2. Cet écran prend le relais pendant que les préférences et les polices se
 *    chargent : le symbole gris au centre d'un anneau clair, un arc plus foncé tourne.
 * On ne masque l'image native qu'APRÈS avoir peint cet écran (`onShown`) : sans
 * cette précaution, une frame vide apparaîtrait entre les deux.
 *
 * ── L'animation ne promet rien ──────────────────────────────────────────────
 * L'arc dit « l'application est vivante ». Il n'indique AUCUNE progression,
 * parce qu'on n'en connaît aucune : il tourne, il ne se remplit pas. Si le système
 * demande moins d'animations, l'arc reste immobile.
 *
 * Couleurs : jetons du thème — symbole et arc en `muted`, anneau en `line`, fond `canvas`.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { BrandSymbol, brandSymbolWidthForRadius } from "./BrandMark";
import { useReduceMotion } from "./motion";
import { useTheme } from "./theme";

export interface LoadingScreenProps {
  /** Appelé APRÈS le premier rendu : c'est le signal pour masquer l'écran natif. */
  onShown?: () => void;
}

/** Proportions de la maquette : anneau ≈ 37 % de la largeur, arc ≈ 70°. Le Z (presque carré) est ajusté
 * au CERCLE de rayon `symbolRadius` — même placement que le chargement web (logo-ayrovi-loading.svg) —
 * pour qu'aucun de ses coins n'approche l'anneau (rayon 65). */
export const RING = {
  size: 136,
  track: 4,
  arc: 6,
  arcDegrees: 70,
  symbolRadius: 52,
  turnMs: 1100,
} as const;

/** Arc de `degrees` partant de midi, sur un cercle de rayon `r` centré en (c, c). */
export function arcPath(c: number, r: number, degrees: number): string {
  const end = (degrees * Math.PI) / 180;
  const x = c + r * Math.sin(end);
  const y = c - r * Math.cos(end);
  const large = degrees > 180 ? 1 : 0;
  return `M ${c} ${c - r} A ${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(
    2
  )}`;
}

export function LoadingScreen({ onShown }: LoadingScreenProps) {
  const theme = useTheme();
  useEffect(() => {
    onShown?.();
  }, [onShown]);
  return (
    <View
      style={[styles.screen, { backgroundColor: theme.colors.canvas }]}
      accessibilityRole="progressbar"
      testID="loading-screen"
    >
      <BrandLoadingIndicator />
    </View>
  );
}

/** Page-level loading uses the same stationary grey emblem as startup. Only the arc turns. */
export function BrandLoadingIndicator({
  size = RING.size,
  color,
  testID,
}: {
  size?: number;
  color?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const ink = color ?? theme.colors.muted;
  const reduce = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      turn.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: RING.turnMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [reduce, turn]);

  const c = RING.size / 2;
  const r = c - RING.arc / 2;
  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          transform: [{ scale: size / RING.size }],
          width: RING.size,
          height: RING.size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg
          width={RING.size}
          height={RING.size}
          style={StyleSheet.absoluteFill}
        >
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={theme.colors.line}
            strokeWidth={RING.track}
            fill="none"
          />
        </Svg>
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
        >
          <Svg width={RING.size} height={RING.size}>
            <Path
              d={arcPath(c, r, RING.arcDegrees)}
              stroke={ink}
              strokeWidth={RING.arc}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
        <BrandSymbol
          width={brandSymbolWidthForRadius(RING.symbolRadius)}
          color={ink}
          variant="striped"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center" },
});
