/**
 * Indicateur d'attente AYROVI : cinq barres vivantes, comme un niveau audio.
 *
 * Il remplace les roues indéfinies sans remplacer les squelettes structurés :
 * une liste garde son squelette, une action courte utilise ces barres. Chaque
 * animation s'arrête au démontage et se fige quand l'utilisateur demande moins
 * de mouvement.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from './theme';
import { ACTION_ON_COLOR, WAITING_GRADIENTS } from './tokens.mobile';

export function WaitingBars({
  compact = false,
  light = false,
  testID,
}: {
  compact?: boolean;
  /** Fond blanc compact quand l'indicateur vit sur le CTA orange. */
  light?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const reduced = theme.motion.reduced === 0;
  const values = useRef(Array.from({ length: 5 }, () => new Animated.Value(0))).current;
  const loops = useMemo(() => values.map((value, index) => Animated.loop(
    Animated.sequence([
      Animated.delay(index * 55),
      Animated.timing(value, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: 260,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay((4 - index) * 35),
    ]),
  )), [values]);

  useEffect(() => {
    if (reduced) {
      values.forEach((value) => value.setValue(0));
      return undefined;
    }
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [loops, reduced, values]);

  const barWidth = compact ? 3 : 6;
  const barHeight = compact ? 12 : 28;
  const gap = compact ? 2 : 5;

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.row,
        { height: compact ? 18 : 38, gap },
        light ? { backgroundColor: ACTION_ON_COLOR, borderRadius: 8, paddingHorizontal: 4 } : null,
      ]}
    >
      {values.map((value, index) => {
        const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [2, compact ? -2 : -6] });
        const scaleY = value.interpolate({ inputRange: [0, 1], outputRange: [0.62 + index * 0.045, 1.08] });
        return (
          <Animated.View
            key={index}
            style={{
              width: barWidth,
              height: barHeight,
              borderRadius: barWidth,
              overflow: 'hidden',
              opacity: reduced ? 1 : value.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
              transform: [{ translateY }, { scaleY }],
            }}
          >
            <LinearGradient
              colors={WAITING_GRADIENTS[index]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
