/**
 * Z Lens — « point de recherche » pendant l'analyse.
 *
 * Une photo ne dit pas d'elle-même OÙ l'on cherche : pendant que le serveur
 * travaille, une couronne de points se pose AUTOUR du produit retenu et un
 * trait de balayage descend dans son cadre. Le regard comprend aussitôt :
 * « c'est CET objet qui est en train d'être cherché ».
 *
 * Rien n'est inventé ici — aucun faux résultat, seulement un état d'attente
 * honnête. Mouvement réduit (`theme.motion.reduced`) : la couronne reste
 * affichée, mais immobile.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { ringPoints } from './lensSelection';
import { LENS_COLORS } from './lensPalette';

/** Points posés sur le pourtour du cadre, dans le sens horaire. */
const DOTS = 8;
const DOT = 9;
const SCAN = 2;
/** Décalage entre deux points : la ronde tourne, sans aucun timer JS. */
const STAGGER = 190;
const CYCLE = DOTS * STAGGER;

export function LensSearchRing({ width, height }: { width: number; height: number }) {
  const theme = useTheme();
  const reduced = theme.motion.reduced === 0;
  const points = useMemo(() => ringPoints(width, height), [width, height]);

  // Une valeur par point, démarrée en cascade : l'éclat fait le tour du cadre.
  const beats = useRef(points.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced) {
      beats.forEach((value) => value.setValue(0.85));
      return undefined;
    }
    const loops = beats.map((value, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * STAGGER),
      Animated.timing(value, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: Math.max(1, CYCLE - 260), easing: Easing.linear, useNativeDriver: true }),
    ])));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [beats, points.length, reduced]);

  // Balayage : un trait clair descend dans le cadre, preuve que la zone est lue.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { sweep.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 0, duration: 1150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, sweep]);

  const travel = Math.max(0, height - SCAN);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="lens-search-ring">
      {points.map((point, index) => (
        <Animated.View
          key={`ring-dot-${index}`}
          style={[styles.dot, {
            left: point.x - DOT / 2,
            top: point.y - DOT / 2,
            opacity: reduced ? theme.opacity.dimmed : beats[index].interpolate({ inputRange: [0, 1], outputRange: [0.26, 1] }),
            transform: [{ scale: reduced ? 1 : beats[index].interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.2] }) }],
          }]}
          testID={`lens-search-dot-${index}`}
        />
      ))}
      <Animated.View
        style={[styles.scan, {
          width,
          transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }],
          opacity: reduced ? 0 : sweep.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 0.8, 0.8, 0] }),
        }]}
        testID="lens-search-scan"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Point blanc liseré de sombre : visible sur une photo claire comme sur une sombre.
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: LENS_COLORS.white,
    borderWidth: 1.5,
    borderColor: veil(0.55),
  },
  scan: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: SCAN,
    backgroundColor: LENS_COLORS.white,
  },
});
