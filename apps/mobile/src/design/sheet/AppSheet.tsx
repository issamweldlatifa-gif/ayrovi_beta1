/**
 * الدرج السفلي الموحّد لكل الأدراج (Lens وغيرها): ملء الشاشة تقريباً، يُفتح ويُغلق
 * بنابض على خيط الواجهة، ويُسحب للأسفل للإغلاق.
 *
 *  • السحب يملكه الدرج عند أعلى المحتوى فقط؛ إذا كان المحتوى ممرّراً، التمرير يبقى له.
 *  • الإغلاق دائماً يمرّ عبر `onDismiss` (السحب، الظل، الزر، زر الرجوع)، والمالك هو الذي
 *    يقرّر؛ الدرج يحرّك نفسه إلى الإغلاق عندما يصبح `open = false`.
 *  • `onClosed` يُستدعى بعد انتهاء حركة الإغلاق، فيُزال المحتوى من الشجرة.
 *  • لا `Modal` هنا: الكاميرا وخلفيتها تبقى حيّة تحت الدرج.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { useReduceMotion } from '@/design/motion';
import { MOTION } from '@/design/tokens.generated';
import { SheetBackdrop } from '@/design/sheet/SheetBackdrop';
import {
  SHEET_SPRING, backdropOpacity, nextTranslate, panMovesSheet, shouldDismiss,
} from '@/design/sheet/sheetPhysics';

/** فراغ يبقى أعلى الدرج ليُرى الظل والحافة. */
const TOP_GAP = 8;

export interface AppSheetProps {
  open: boolean;
  onDismiss: () => void;
  onClosed?: () => void;
  header?: ReactNode;
  children: ReactNode;
}

export function AppSheet({ open, onDismiss, onClosed, header, children }: AppSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduce = useReduceMotion();

  const sheetHeight = windowHeight - insets.top - TOP_GAP;
  /** الموضع: 0 مفتوح، sheetHeight مغلق. يبدأ مغلقاً ثم يُفتح بنابض عند الظهور. */
  const translateY = useSharedValue(sheetHeight);
  /** هل حرّكه السحب فعلاً؟ يمنع إغلاقاً خاطئاً من سرعة سحب لم تحرّك الدرج. */
  const dragged = useSharedValue(false);
  const scrollY = useSharedValue(0);

  // مراجع مستقرة تُمرَّر إلى خيط الواجهة (runOnJS) دون إعادة إنشاء الإيماءات.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const dismissJS = useCallback(() => onDismissRef.current(), []);
  const closedJS = useCallback(() => onClosedRef.current?.(), []);

  useEffect(() => {
    if (open) {
      translateY.value = reduce ? 0 : withSpring(0, SHEET_SPRING);
      return;
    }
    if (reduce) {
      translateY.value = sheetHeight;
      closedJS();
      return;
    }
    translateY.value = withTiming(sheetHeight, { duration: MOTION.fast }, (finished) => {
      if (finished) runOnJS(closedJS)();
    });
  }, [open, reduce, sheetHeight, translateY, closedJS]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // السحب يُمرَّر بالتزامن مع التمرير الأصلي للمحتوى، لا بدلاً منه.
  const native = Gesture.Native();
  const pan = Gesture.Pan()
    .simultaneousWithExternalGesture(native)
    .activeOffsetY([-12, 12])
    .failOffsetX([-28, 28])
    .onStart(() => {
      'worklet';
      dragged.value = false;
    })
    .onChange((event) => {
      'worklet';
      if (!panMovesSheet(translateY.value, scrollY.value)) return;
      dragged.value = true;
      translateY.value = nextTranslate(translateY.value, event.changeY, sheetHeight);
    })
    .onEnd((event) => {
      'worklet';
      if (dragged.value && shouldDismiss(translateY.value, event.velocityY, sheetHeight)) {
        runOnJS(dismissJS)();
        return;
      }
      translateY.value = withSpring(0, SHEET_SPRING);
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity(translateY.value, sheetHeight),
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <SheetBackdrop animatedStyle={backdropStyle} onPress={onDismiss} />
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.panel,
            {
              top: insets.top + TOP_GAP,
              backgroundColor: theme.colors.canvas,
              borderTopLeftRadius: theme.radius.card,
              borderTopRightRadius: theme.radius.card,
              shadowColor: theme.colors.ink,
            },
            panelStyle,
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.line }]} />
          {header}
          <GestureDetector gesture={native}>
            <Animated.ScrollView
              onScroll={onScroll}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
            >
              {children}
            </Animated.ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingTop: 8, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12,
  },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, marginBottom: 6 },
  body: { padding: 16, gap: 12 },
});
