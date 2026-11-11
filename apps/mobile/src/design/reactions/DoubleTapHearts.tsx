/**
 * Z-Reactions — cœurs ROUGES du double-tap (demande du propriétaire, 11/11).
 *
 * Double-tap sur un média (Reel, vidéo, photo d'une publication) ⇒ J'adore,
 * et un grand cœur rouge naît SOUS LE DOIGT : il éclot d'un ressort, penche un
 * peu au hasard, puis s'envole en s'estompant, entouré de petits cœurs qui
 * s'écartent. Plusieurs double-taps rapprochés empilent plusieurs gerbes
 * (comme TikTok). Calque `pointerEvents="none"` : il ne vole aucun toucher.
 *
 * API impérative (`ref.burst(x, y)`) : le média sait OÙ on a touché, le calque
 * sait DESSINER — aucun état de position ne remonte dans la carte.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '@/design/theme';
import { useReduceMotion } from '@/design/motion';
import { HEART_PATH } from '@/features/reels/ReelIcons';
import Svg, { Path } from 'react-native-svg';

export interface DoubleTapHeartsHandle {
  burst: (x: number, y: number) => void;
}

interface Burst { id: number; x: number; y: number; tilt: number }

/** Grand cœur + éclats : géométrie d'une gerbe. */
export const HEART_BURST = {
  size: 96,
  minis: [
    { dx: -54, dy: -30, size: 22 },
    { dx: 50, dy: -38, size: 26 },
    { dx: -36, dy: -78, size: 16 },
    { dx: 30, dy: -86, size: 18 },
    { dx: 2, dy: -112, size: 14 },
  ],
  /** Durée de vie totale d'une gerbe (ms). */
  lifetime: 1100,
  /** Au-delà, les plus anciennes gerbes disparaissent (mémoire bornée). */
  max: 4,
} as const;

function Heart({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d={HEART_PATH} fill={color} />
    </Svg>
  );
}

function HeartBurst({ burst, color, reduce, onDone }: { burst: Burst; color: string; reduce: boolean; onDone: (id: number) => void }) {
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = reduce
      ? Animated.sequence([Animated.delay(500), Animated.timing(fly, { toValue: 1, duration: 200, useNativeDriver: true })])
      : Animated.sequence([
          Animated.spring(pop, { toValue: 1, friction: 4, tension: 260, useNativeDriver: true }),
          Animated.delay(260),
          Animated.timing(fly, { toValue: 1, duration: 420, useNativeDriver: true }),
        ]);
    animation.start(({ finished }) => { if (finished) onDone(burst.id); });
    return () => animation.stop();
  }, [burst.id, reduce, pop, fly, onDone]);

  const half = HEART_BURST.size / 2;
  return (
    <View pointerEvents="none" style={[styles.burst, { left: burst.x - half, top: burst.y - half }]}>
      <Animated.View
        style={{
          opacity: fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [
            { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, reduce ? 0 : -90] }) },
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
            { rotate: `${burst.tilt}deg` },
          ],
        }}
      >
        <Heart size={HEART_BURST.size} color={color} />
      </Animated.View>
      {reduce ? null : HEART_BURST.minis.map((mini, index) => (
        <Animated.View
          key={index}
          style={[
            styles.mini,
            {
              left: half - mini.size / 2,
              top: half - mini.size / 2,
              opacity: Animated.multiply(pop, fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
              transform: [
                { translateX: pop.interpolate({ inputRange: [0, 1], outputRange: [0, mini.dx] }) },
                { translateY: Animated.add(
                  pop.interpolate({ inputRange: [0, 1], outputRange: [0, mini.dy] }),
                  fly.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }),
                ) },
              ],
            },
          ]}
        >
          <Heart size={mini.size} color={color} />
        </Animated.View>
      ))}
    </View>
  );
}

export const DoubleTapHearts = forwardRef<DoubleTapHeartsHandle, { testID?: string }>(function DoubleTapHearts({ testID }, ref) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const next = useRef(0);
  useImperativeHandle(ref, () => ({
    burst: (x: number, y: number) => {
      const id = ++next.current;
      const tilt = Math.round((Math.random() * 2 - 1) * 14);
      setBursts((list) => [...list, { id, x, y, tilt }].slice(-HEART_BURST.max));
    },
  }), []);
  const done = useCallback((id: number) => setBursts((list) => list.filter((entry) => entry.id !== id)), []);
  return (
    <View testID={testID} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((burst) => (
        <HeartBurst key={burst.id} burst={burst} color={theme.colors.reactionLove} reduce={reduce} onDone={done} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  burst: { position: 'absolute', width: HEART_BURST.size, height: HEART_BURST.size },
  mini: { position: 'absolute' },
});
