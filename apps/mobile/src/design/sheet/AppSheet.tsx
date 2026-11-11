/**
 * الدرج السفلي الموحّد لكل الأدراج (كل الأدراج): ملء الشاشة تقريباً، يُفتح ويُغلق
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
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
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
import { RADIUS, SHEET_CORNER_RADIUS } from '@/design/tokens.mobile';
import { SheetBackdrop } from '@/design/sheet/SheetBackdrop';
import { anchoredSheetHeight, useKeyboardOverlap } from '@/design/keyboard';
import {
  SHEET_SPRING, nextTranslate, panMovesSheet, shouldDismiss,
} from '@/design/sheet/sheetPhysics';

/**
 * Feuille à hauteur fixe + clavier : hauteur visible minimale (en-tête, champ
 * et quelques lignes). En dessous seulement, le haut de la feuille monte.
 */
export const TYPING_MIN_SHEET = 240;

/** مسافة دنيا (px) قبل أن تُعدّ الحركة سحباً، حتى لا تسرق النقرات. */
const DRAG_SLOP = 6;

export interface AppSheetProps {
  open: boolean;
  /** Opt-in presentation surface; Clean is white independently of the commerce theme. */
  surfaceColor?: string;
  onDismiss: () => void;
  onClosed?: () => void;
  header?: ReactNode;
  /** Optional pinned action area below the scrollable content. */
  footer?: ReactNode;
  /** Product-purchase sheets may sit over the page instead of covering it fully. */
  presentation?: 'full' | 'bottom';
  /**
   * Couleurs du pied FIXÉ à la feuille : la feuille de commentaires des Reels
   * (référence vidéo 10/11) est sombre quel que soit le thème — son pied doit
   * suivre SA surface, pas le thème de la page derrière.
   */
  footerSurfaceColor?: string;
  footerLineColor?: string;
  /**
   * Couleur de la barre de défilement (Android ; iOS garde son indicateur).
   * La feuille Reels (référence 10/11) impose l'orange de son rail.
   */
  indicatorColor?: string;
  /**
   * Hauteur FIXE (fraction de la fenêtre) d'une feuille `bottom` — feuille de
   * commentaires « comme Instagram / Facebook » (11/11/2026) : elle ne grandit
   * pas à chaque message (« متعملش ارتفاع او انخفاظ »). La liste défile
   * dedans, le champ reste collé en bas. Sans valeur : hauteur du contenu.
   */
  heightRatio?: number;
  /** Accès au défilement (ex. remonter sur le commentaire qu'on vient d'écrire). */
  scrollRef?: RefObject<ScrollView | null>;
  children: ReactNode;
}

export function AppSheet({
  open, onDismiss, onClosed, header, footer, presentation = 'full', children, surfaceColor,
  footerSurfaceColor, footerLineColor, indicatorColor, heightRatio, scrollRef,
}: AppSheetProps) {
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
  const sheetHeight = Math.max(1, presentation === 'bottom'
    ? Math.min(measuredHeight, Math.round(windowHeight * 0.9))
    : measuredHeight);
  const topInset = presentation === 'bottom' ? 8 : insets.top + 8;
  /**
   * Clavier (11/11/2026) — « ما يبانش وين قاعدين نكتبو » : le champ du pied
   * (commentaire de Reel, recherche…) passait SOUS le clavier, Android
   * edge-to-edge ne réduisant plus la fenêtre. La feuille remonte de la part
   * RÉELLEMENT recouverte, et sa hauteur maximale se réduit d'autant pour que
   * l'en-tête reste à l'écran. Pas de zone sûre basse quand le clavier est
   * là : il couvre déjà la barre de navigation.
   */
  const keyboard = useKeyboardOverlap(open);
  const keyboardLift = keyboard.overlap;
  // Avec le clavier : jamais plus haut que l'espace VISIBLE au-dessus de lui
  // (moins la zone sûre haute), pour que l'en-tête reste à l'écran.
  const availableHeight = keyboardLift > 0
    ? Math.max(1, Math.min(sheetHeight, measuredHeight - keyboardLift - (presentation === 'bottom' ? insets.top + 8 : 0)))
    : sheetHeight;
  const bottomSafe = keyboardLift > 0 ? 0 : insets.bottom;
  /*
   * Feuille à hauteur fixe, ANCRÉE PAR LE HAUT : le clavier ne fait ni monter
   * ni descendre son bord haut — seul le bas (le champ) se pose sur le clavier
   * et la liste perd la part recouverte (Instagram / Facebook). Le haut ne
   * monte que si l'espace restant passerait sous `TYPING_MIN_SHEET`.
   */
  const restFixed = presentation === 'bottom' && heightRatio
    ? Math.max(1, Math.min(sheetHeight, Math.round(windowHeight * heightRatio)))
    : undefined;
  const fixedHeight = restFixed === undefined
    ? undefined
    : Math.max(1, anchoredSheetHeight(restFixed, keyboardLift, TYPING_MIN_SHEET, measuredHeight - keyboardLift - insets.top - 8));

  /** الموضع: 0 مفتوح، sheetHeight مغلق. يبدأ مغلقاً ثم يُفتح عند الظهور. */
  const translate = useRef(new Animated.Value(sheetHeight)).current;
  /** نسخة عادية من الموضع (تُحدَّث من المستمع) لتُقرأ داخل معالجات اللمس. */
  const position = useRef(sheetHeight);
  /** موضع بداية السحب الحالي. */
  const dragStart = useRef(0);
  /** كم مررنا المحتوى للأسفل. */
  const scrollY = useRef(0);
  /** مؤشّر التمرير المرسوم: موضع المحتوى وارتفاعا المنطقة والمحتوى. */
  const scrollOffset = useRef(new Animated.Value(0)).current;
  const [scrollHeight, setScrollHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

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
    scrollOffset.setValue(event.nativeEvent.contentOffset.y);
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      /**
       * Fermé : le tiroir ne reçoit plus aucun toucher. Sans cela, le voile transparent
       * (opacité 0) couvre tout l'écran et bloque les boutons de la page dessous
       * (retour, fermer, barre du bas) — c'était le cas de la page boutique.
       */
      pointerEvents={open ? 'box-none' : 'none'}
      ref={keyboard.ref}
      onLayout={(event) => {
        setMeasuredHeight(event.nativeEvent.layout.height);
        keyboard.measure();
      }}
    >
      <SheetBackdrop opacity={backdrop} onPress={onDismiss} />
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          presentation === 'bottom' ? styles.bottomPanel : styles.panel,
          {
            height: presentation === 'bottom' ? fixedHeight : availableHeight,
            maxHeight: presentation === 'bottom' ? availableHeight : undefined,
            bottom: keyboardLift,
            paddingTop: topInset,
            backgroundColor: surfaceColor ?? theme.colors.canvas,
            borderTopLeftRadius: presentation === 'bottom' ? SHEET_CORNER_RADIUS : 0,
            borderTopRightRadius: presentation === 'bottom' ? SHEET_CORNER_RADIUS : 0,
            transform: [{ translateY: translate }],
          },
        ]}
      >
        {header}
        <View
          style={presentation === 'bottom' && !fixedHeight ? styles.scrollWrapBottom : styles.scrollWrap}
          onLayout={(event) => setScrollHeight(event.nativeEvent.layout.height)}
        >
          <ScrollView
            ref={scrollRef}
            style={presentation === 'bottom' && !fixedHeight ? styles.bottomScroll : styles.scroll}
            onScroll={onScroll}
            onContentSizeChange={(_, height) => setContentHeight(height)}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.body, { paddingBottom: footer ? 12 : bottomSafe + 20 }]}
          >
            {children}
          </ScrollView>
          {/**
           * Barre de défilement dessinée par nos soins (option
           * `indicatorColor` — la feuille Reels, référence 10/11, impose
           * l'orange) : `ScrollView` d'Android ne permet plus de teinter
           * l'indicateur natif, et iOS jamais. La barre est une vraie
           * superposition sur la zone de défilement : sa hauteur suit la part
           * visible du contenu, sa position suit le défilement.
           */}
          {indicatorColor && contentHeight > scrollHeight && scrollHeight > 0 ? (
            <ScrollIndicator
              color={indicatorColor}
              offset={scrollOffset}
              trackHeight={scrollHeight}
              contentHeight={contentHeight}
            />
          ) : null}
        </View>
        {footer ? (
          <View style={[styles.footer, { backgroundColor: footerSurfaceColor ?? theme.colors.canvas, borderTopColor: footerLineColor ?? theme.colors.line, paddingBottom: bottomSafe + 12 }]}>
            {footer}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const MIN_THUMB_HEIGHT = 24;

/**
 * شريط تمرير مرسوم (عرض 3، على الحافة الأخيرة): ارتفاعه يمثّل نسبة الجزء
 * الظاهر من المحتوى، وموضعه يتبع التمرير عبر `Animated.interpolate` محصور
 * بين أعلى وأسفل المسار — بلا إعادة قياس عند كل إطار.
 */
function ScrollIndicator({ color, offset, trackHeight, contentHeight }: {
  color: string;
  offset: Animated.Value;
  trackHeight: number;
  contentHeight: number;
}) {
  const thumbHeight = Math.max(MIN_THUMB_HEIGHT, trackHeight * (trackHeight / contentHeight));
  const maxOffset = Math.max(1, contentHeight - trackHeight);
  const translateY = offset.interpolate({
    inputRange: [0, maxOffset],
    outputRange: [0, trackHeight - thumbHeight],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        end: 2,
        top: 0,
        width: 3,
        height: thumbHeight,
        borderRadius: RADIUS.full,
        backgroundColor: color,
        transform: [{ translateY }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  bottomPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  scrollWrap: { flex: 1 },
  /*
   * Feuille « à la hauteur du contenu » : la liste PEUT rétrécir (`flexShrink`).
   * Sans cela (11/11/2026, commentaires des Reels) chaque message agrandissait
   * la liste jusqu'au plafond de 90 % — puis elle poussait le champ de saisie
   * SOUS le bord coupé (`overflow: hidden`) : plus moyen d'écrire.
   */
  scrollWrapBottom: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  scroll: { flex: 1 },
  bottomScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
