/**
 * Mouvement de feuille pour les `Modal` historiques (12/11/2026).
 *
 * Avant : l’animation « slide » du Modal faisait glisser TOUT le modal transparent —
 * voile sombre compris — d'un bloc, avec la courbe système (lente, différente
 * de `AppSheet`). Maintenant : le modal FOND (le voile apparaît sur place) et
 * seule la feuille monte, avec le même ressort que `AppSheet` (`SHEET_SPRING`).
 * Moins de mouvement (réglage système) : la feuille est posée, sans animation.
 *
 * Remplace la `View` de la feuille telle quelle (mêmes props, même style).
 */
import { useEffect, useRef } from 'react';
import { Animated, useWindowDimensions, type ViewProps } from 'react-native';

import { useReduceMotion } from '@/design/motion';
import { SHEET_SPRING } from '@/design/sheet/sheetPhysics';

/** Animation des `Modal` dont le contenu est une feuille : le voile fond, la feuille monte. */
export const SHEET_MODAL_ANIMATION = 'fade' as const;

export function SheetRise({ style, children, ...props }: ViewProps) {
  const reduce = useReduceMotion();
  const { height } = useWindowDimensions();
  const offset = useRef(new Animated.Value(reduce ? 0 : height)).current;
  useEffect(() => {
    if (reduce) {
      offset.setValue(0);
      return undefined;
    }
    const rise = Animated.spring(offset, { toValue: 0, ...SHEET_SPRING, useNativeDriver: true });
    rise.start();
    return () => rise.stop();
  }, [offset, reduce]);
  return (
    <Animated.View {...props} style={[style, { transform: [{ translateY: offset }] }]}>
      {children}
    </Animated.View>
  );
}
