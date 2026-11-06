import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/design/theme';
import { frost } from '@/design/tokens.mobile';
import type { Skeleton } from '@/design/skeleton';

/** Neutral travelling light, not progress. Reduced-motion users get a static placeholder. */
export function LensShimmer(props: ComponentProps<typeof Skeleton>) {
  const theme = useTheme(); const [width, setWidth] = useState(0);
  const phase = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    if (!width || theme.motion.reduced === 0) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(phase, { toValue: -1, duration: 0, useNativeDriver: true }),
      Animated.delay(180),
    ]));
    loop.start(); return () => loop.stop();
  }, [phase, width, theme.motion.reduced]);
  return <View testID={props.testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={[styles.clip, { width: props.width ?? '100%', height: props.height ?? 16, borderRadius: props.radius ?? theme.radius.sm, backgroundColor: props.color ?? theme.colors.skeleton }, props.style]}>
    {width > 0 && theme.motion.reduced !== 0 ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: phase.interpolate({ inputRange: [-1, 1], outputRange: [-width, width] }) }] }]}>
      <LinearGradient colors={[frost(0), frost(0.8), frost(0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View> : null}
  </View>;
}
const styles = StyleSheet.create({ clip: { overflow: 'hidden', alignSelf: 'stretch' } });
