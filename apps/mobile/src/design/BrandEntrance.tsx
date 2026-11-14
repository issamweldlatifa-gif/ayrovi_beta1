/** One startup presentation only. Never delays the app behind an unbounded animation callback.
 *
 * v7 handoff (white icon + white splash, owner 14/11): the first frame is the native splash redrawn exactly —
 * flat white, ink zebra Z at the app.json size (SPLASH_SYMBOL is generated from it) — so hiding the native splash
 * is invisible. The Z then settles: it eases back a little (scale 1 → SETTLE_SCALE) while fading out, and the
 * app's white canvas is simply there. No colour flash: splash, entrance and app share the same white. */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { BrandSymbol } from './BrandMark';
import { BrandLoadingIndicator } from './LoadingScreen';
import { SPLASH_SYMBOL } from './brandSymbol';
import { useReduceMotion } from './motion';
import { BRAND } from './tokens.generated';

/** Final scale of the splash Z as it fades (a gentle step back, not a zoom). */
export const SETTLE_SCALE = 0.86;

export function BrandEntrance({ ready, onShown, onDone }: { ready: boolean; onShown: () => void; onDone: () => void }) {
  const reduce = useReduceMotion();
  const [waiting, setWaiting] = useState(false);
  const settle = useRef(new Animated.Value(0)).current;
  const cover = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const callbacks = useRef({ onShown, onDone }); callbacks.current = { onShown, onDone };
  const [measured, setMeasured] = useState(false);
  const shown = useRef(false);
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width <= 0 || layout.height <= 0) return;
    setMeasured(true);
    if (!shown.current) { shown.current = true; callbacks.current.onShown(); }
  };
  useEffect(() => {
    if (!measured) return;
    if (reduce) { cover.setValue(0); setWaiting(true); return; }
    let live = true;
    const complete = () => { if (live) { cover.setValue(0); setWaiting(true); } };
    const sequence = Animated.sequence([
      Animated.delay(140),
      Animated.timing(settle, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.delay(80),
      Animated.timing(cover, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]);
    const deadline = setTimeout(complete, 1000);
    sequence.start(complete);
    return () => { live = false; clearTimeout(deadline); sequence.stop(); };
  }, [measured, reduce, settle, cover]);
  useEffect(() => {
    if (!ready || !waiting) return;
    let finished = false;
    const done = () => { if (!finished) { finished = true; callbacks.current.onDone(); } };
    if (reduce) { done(); return; }
    const exit = Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true });
    const deadline = setTimeout(done, 260); exit.start(done);
    return () => { finished = true; clearTimeout(deadline); exit.stop(); };
  }, [ready, waiting, reduce, fade]);
  const markStyle = {
    opacity: settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [1, SETTLE_SCALE] }) }],
  };
  return <Animated.View onLayout={onLayout} testID="brand-entrance" accessibilityRole="progressbar" style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', opacity: fade }]}>
    {waiting ? <BrandLoadingIndicator /> : null}
    <Animated.View testID="brand-splash-cover" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', opacity: cover }]}>
      <Animated.View testID="brand-splash-mark" style={markStyle}>
        <BrandSymbol width={SPLASH_SYMBOL.width} color={BRAND.black} variant="striped" />
      </Animated.View>
    </Animated.View>
  </Animated.View>;
}
