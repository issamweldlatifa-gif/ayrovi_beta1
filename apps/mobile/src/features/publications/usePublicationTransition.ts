import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useReduceMotion } from '@/design/motion';
import { PUBLICATION_MOTION as M } from './publicationTokens';

/** Native-driver opacity/transform only. No layout animation or scrolling mutation. */
export function usePublicationTransition(onClose: () => void) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false),
    mounted = useRef(true),
    closeRef = useRef(onClose);
  const completed = useRef(false);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const complete = useCallback(() => {
    if (!mounted.current || completed.current) return;
    completed.current = true;
    if (deadline.current) clearTimeout(deadline.current);
    closeRef.current();
  }, []);
  closeRef.current = onClose;
  useEffect(() => {
    mounted.current = true;
    if (closing.current) complete();
    else if (reduce) progress.setValue(1);
    else
      Animated.timing(progress, {
        toValue: 1,
        duration: M.enter,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      }).start();
    return () => {
      mounted.current = false;
      if (deadline.current) clearTimeout(deadline.current);
      progress.stopAnimation();
    };
  }, [progress, reduce, complete]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduce) {
      complete();
      return;
    }
    // A stopped native animation must never strand a requested close.
    deadline.current = setTimeout(complete, M.exit + 50);
    Animated.timing(progress, {
      toValue: 0,
      duration: M.exit,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (finished) complete();
    });
  }, [progress, reduce, complete]);
  return {
    close,
    style: {
      flex: 1,
      opacity: progress,
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [reduce ? 0 : M.travel, 0],
          }),
        },
      ],
    },
  };
}
