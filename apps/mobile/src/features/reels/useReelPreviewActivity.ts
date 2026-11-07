import { useEffect, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  AppState,
  View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from 'expo-router';

/** Also observes vertical home scrolling, not just horizontal FlatList viewability. */
export function useReelPreviewActivity(ref: RefObject<View | null>) {
  const focused = useIsFocused();
  const { height } = useWindowDimensions();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active'
  );
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduced(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced
    );
    const state = AppState.addEventListener('change', (value) =>
      setForeground(value === 'active')
    );
    return () => {
      alive = false;
      motion.remove();
      state.remove();
    };
  }, []);
  useEffect(() => {
    if (!focused || !foreground) {
      setVisible(false);
      return;
    }
    let alive = true;
    const measure = () =>
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (alive)
          setVisible(
            h > 0 &&
              Math.max(0, Math.min(y + h, height) - Math.max(y, 0)) >=
                Math.min(h, height) / 2
          );
      });
    measure();
    const timer = setInterval(measure, 500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [focused, foreground, height, ref]);
  return { visible: focused && foreground && visible, autoplay: !reduced };
}
