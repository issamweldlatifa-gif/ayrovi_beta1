/** One startup presentation only. Never delays the app behind an unbounded animation callback. */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { BrandSymbol } from './BrandMark';
import { BrandLoadingIndicator } from './LoadingScreen';
import { BRAND_ACCENT } from './brandAppearance';
import { useReduceMotion } from './motion';

export function BrandEntrance({ ready, onShown, onDone }: { ready: boolean; onShown: () => void; onDone: () => void }) {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const [waiting, setWaiting] = useState(false);
  const grow = useRef(new Animated.Value(0)).current;
  const cover = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const callbacks = useRef({ onShown, onDone }); callbacks.current = { onShown, onDone };
  useEffect(() => { callbacks.current.onShown(); }, []);
  useEffect(() => {
    if (reduce) { cover.setValue(0); setWaiting(true); return; }
    let live = true;
    const complete = () => { if (live) { cover.setValue(0); setWaiting(true); } };
    const sequence = Animated.sequence([
      Animated.delay(140),
      Animated.timing(grow, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.delay(80),
      Animated.timing(cover, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]);
    const deadline = setTimeout(complete, 1000);
    sequence.start(complete);
    return () => { live = false; clearTimeout(deadline); sequence.stop(); };
  }, [reduce, grow, cover]);
  useEffect(() => {
    if (!ready || !waiting) return;
    let finished = false;
    const done = () => { if (!finished) { finished = true; callbacks.current.onDone(); } };
    if (reduce) { done(); return; }
    const exit = Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true });
    const deadline = setTimeout(done, 260); exit.start(done);
    return () => { finished = true; clearTimeout(deadline); exit.stop(); };
  }, [ready, waiting, reduce, fade]);
  const maxScale = Math.ceil(Math.hypot(width, height) / 48) + 2;
  return <Animated.View testID="brand-entrance" accessibilityRole="progressbar" style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', opacity: fade }]}>
    {waiting ? <BrandLoadingIndicator /> : null}
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: cover }]}>
      <Animated.View testID="brand-blue-fill" style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: BRAND_ACCENT, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0, maxScale] }) }] }} />
      <BrandSymbol width={96} color={BRAND_ACCENT} />
    </Animated.View>
  </Animated.View>;
}
