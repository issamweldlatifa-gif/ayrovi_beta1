/**
 * Mouvement partagé de l'application : une seule source pour les durées (`MOTION`)
 * et deux primitives réutilisables.
 *
 *  • `PressScale` : retour tactile (légère réduction d'échelle, ressort) ;
 *  • `FadeIn`     : apparition douce d'un bloc à son montage.
 *
 * Les deux utilisent le driver natif (`useNativeDriver`) : l'animation tourne hors du
 * thread JavaScript. Si le système demande de réduire les animations, la durée tombe à 0
 * et l'état final s'affiche immédiatement.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, type StyleProp, type ViewStyle } from 'react-native';

import { MOTION } from './tokens.generated';

/** Vrai quand l'utilisateur a demandé moins d'animations dans les réglages du système. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    // `?.` : certains environnements de test n'implémentent pas ce module.
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value: boolean) => { if (alive) setReduce(Boolean(value)); })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value: boolean) => setReduce(Boolean(value)));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

export interface PressScaleProps {
  /** Vrai pendant l'appui (fourni par le `Pressable` parent). */
  pressed: boolean;
  /** Échelle au repos → appuyé. Par défaut 0,97 : discret, lisible. */
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function PressScale({ pressed, pressedScale = 0.97, style, children }: PressScaleProps) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const target = pressed && !reduce ? pressedScale : 1;
    Animated.spring(scale, {
      toValue: target,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  }, [pressed, pressedScale, reduce, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

export interface FadeInProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Durée en ms. Par défaut la durée « standard » du système. */
  duration?: number;
  testID?: string;
}

export function FadeIn({ children, style, duration = MOTION.standard, testID }: FadeInProps) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
  }, [duration, opacity, reduce]);

  return <Animated.View testID={testID} style={[style, { opacity }]}>{children}</Animated.View>;
}
