/**
 * الدرج السفلي الموحّد لكل الأدراج (Lens وغيرها): ملء الشاشة تقريباً، يُفتح ويُغلق
 * بنابض، ويُسحب للأسفل للإغلاق.
 *
 * التنفيذ بـ `Animated` و`PanResponder` من React Native نفسها، بلا Reanimated ولا
 * Gesture Handler: كلاهما وحدة أصلية إضافية، وأي خلل فيها يُسقط التطبيق دون أن
 * يظهر في الاختبارات. هنا لا توجد وحدة أصلية إضافية.
 *
 *  • السحب يملكه الدرج عند أعلى المحتوى فقط؛ إذا كان المحتوى ممرّراً، التمرير يبقى له.
 *    التقاط الحركة يتم في مرحلة `Capture` قبل المحتوى، فيعرف الدرج أولاً من يملك السحب.
 *  • الإغلاق دائماً يمرّ عبر `onDismiss` (السحب، الظل، الزر، الرجوع)، والمالك يحدّث `open`.
 *  • `onClosed` يُستدعى بعد انتهاء حركة الإغلاق، فيُزال المحتوى من الشجرة.
 *  • لا `Modal`: الكاميرا وخلفيتها تبقى حيّة تحت الدرج.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { useReduceMotion } from '@/design/motion';
import { MOTION } from '@/design/tokens.generated';
import { SheetBackdrop } from '@/design/sheet/SheetBackdrop';
import {
  SHEET_SPRING, nextTranslate, panMovesSheet, shouldDismiss,
} from '@/design/sheet/sheetPhysics';

/** مسافة دنيا (px) قبل أن تُعدّ الحركة سحباً، حتى لا تسرق النقرات. */
const DRAG_SLOP = 6;

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

  /**
   * ملء الشاشة: الدرج يغطي المنطقة كلها، بما فيها الحافة العليا (شريط الحالة يبقى
   * محجوزاً بـ`paddingTop` داخل الدرج). الارتفاع يُقاس من الحاوية الفعلية، لا من
   * نافذة الجهاز، حتى لا يُترك فراغ أو يُقطع جزء.
   */
  const [measuredHeight, setMeasuredHeight] = useState(windowHeight);
  const sheetHeight = Math.max(1, measuredHeight);

  /** الموضع: 0 مفتوح، sheetHeight مغلق. يبدأ مغلقاً ثم يُفتح عند الظهور. */
  const translate = useRef(new Animated.Value(sheetHeight)).current;
  /** نسخة عادية من الموضع (تُحدَّث من المستمع) لتُقرأ داخل معالجات اللمس. */
  const position = useRef(sheetHeight);
  /** موضع بداية السحب الحالي. */
  const dragStart = useRef(0);
  /** كم مررنا المحتوى للأسفل. */
  const scrollY = useRef(0);

  // مراجع مستقرة: المعالجات لا تُعاد إنشاؤها عند كل رسم.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    const id = translate.addListener(({ value }) => {
      position.current = value;
    });
    return () => translate.removeListener(id);
  }, [translate]);

  useEffect(() => {
    translate.stopAnimation();
    if (open) {
      if (reduce) {
        translate.setValue(0);
        return;
      }
      Animated.spring(translate, { toValue: 0, useNativeDriver: true, ...SHEET_SPRING }).start();
      return;
    }
    if (reduce) {
      translate.setValue(sheetHeight);
      onClosedRef.current?.();
      return;
    }
    Animated.timing(translate, {
      toValue: sheetHeight,
      duration: MOTION.fast,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClosedRef.current?.();
    });
  }, [open, reduce, sheetHeight, translate]);

  const backdrop = translate.interpolate({
    inputRange: [0, sheetHeight],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useMemo(() => {
    /** هل هذه الحركة سحب للدرج؟ السحب للأسفل يعني الإغلاق، والصعود يعني الرجوع إلى الفتح. */
    const wantsDrag = (gesture: PanResponderGestureState): boolean => {
      const { dx, dy } = gesture;
      if (Math.abs(dy) <= DRAG_SLOP || Math.abs(dy) <= Math.abs(dx)) return false;
      if (dy > 0) return panMovesSheet(position.current, scrollY.current);
      return position.current > 0;
    };

    const settle = () => {
      Animated.spring(translate, { toValue: 0, useNativeDriver: true, ...SHEET_SPRING }).start();
    };

    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event: GestureResponderEvent, gesture) => wantsDrag(gesture),
      onMoveShouldSetPanResponder: (_event: GestureResponderEvent, gesture) => wantsDrag(gesture),
      onPanResponderGrant: () => {
        translate.stopAnimation();
        dragStart.current = position.current;
      },
      onPanResponderMove: (_event: GestureResponderEvent, gesture) => {
        translate.setValue(nextTranslate(dragStart.current, gesture.dy, sheetHeight));
      },
      onPanResponderRelease: (_event: GestureResponderEvent, gesture) => {
        const at = nextTranslate(dragStart.current, gesture.dy, sheetHeight);
        // `vy` بوحدة px/ms، ونحوّلها إلى px/s كما تتوقعها الفيزياء.
        if (shouldDismiss(at, gesture.vy * 1000, sheetHeight)) {
          onDismissRef.current();
          return;
        }
        settle();
      },
      onPanResponderTerminate: () => {
        settle();
      },
    });
  }, [sheetHeight, translate]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(event) => setMeasuredHeight(event.nativeEvent.layout.height)}
    >
      <SheetBackdrop opacity={backdrop} onPress={onDismiss} />
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.panel,
          {
            paddingTop: insets.top + 8,
            backgroundColor: theme.colors.canvas,
            transform: [{ translateY: translate }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.colors.line }]} />
        {header}
        <ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, marginBottom: 6 },
  body: { padding: 16, gap: 12 },
});
