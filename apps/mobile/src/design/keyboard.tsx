/**
 * Clavier — UNE seule façon, pour toute l'application, de ne plus taper à
 * l'aveugle (11/11/2026).
 *
 * ── Le défaut rapporté ─────────────────────────────────────────────────────
 * « وين نحب نستعملو keyboard للكتيبه ما يبانش وين قاعدين نكتبو » — commentaires
 * des Reels, Z Lens « recherche par lien », et « presque » tout champ : le
 * clavier s'ouvrait PAR-DESSUS le champ.
 *
 * ── La cause ───────────────────────────────────────────────────────────────
 * Le code supposait qu'Android RÉDUIT la fenêtre quand le clavier s'ouvre
 * (`adjustResize`) et ne faisait donc rien sur Android (`useKeyboardInset(
 * Platform.OS === 'ios')`, `KeyboardAvoidingView behavior={… : undefined}`).
 * C'était vrai jadis. Depuis Expo SDK 54 (ici SDK 57 / RN 0.86) l'affichage
 * « edge-to-edge » est OBLIGATOIRE sur Android : la fenêtre occupe tout
 * l'écran et n'est plus jamais réduite — le clavier la recouvre, exactement
 * comme sur iOS. Toutes les protections « iOS seulement » laissaient Android
 * sans rien.
 *
 * ── La règle retenue ───────────────────────────────────────────────────────
 * On ne raisonne pas sur « la hauteur du clavier » (qui, sur Android, EXCLUT
 * la barre de navigation : `ime.bottom - systemBars.bottom` dans
 * `ReactRootView`) mais sur le RECOUVREMENT RÉEL : bas de la vue mesuré dans
 * la fenêtre − haut du clavier (`endCoordinates.screenY`). Trois avantages :
 *   • exact en edge-to-edge (Android 15/16, iOS) ;
 *   • nul tout seul si un appareil réduit malgré tout la fenêtre — aucun
 *     double décalage possible ;
 *   • juste pour une vue qui ne touche pas le bas de l'écran (écran posé
 *     au-dessus de la barre d'onglets, feuille en bas de page…).
 *
 * Un `ScrollView` qui rétrécit garde le champ actif visible (Android :
 * `ScrollView.onSizeChanged` défile vers la vue focalisée ; iOS idem via
 * `scrollResponderScrollNativeHandleToKeyboard` à la frappe).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { keyboardOverlap, keyboardTopFrom } from './keyboardLogic';
import {
  Dimensions,
  Keyboard,
  Platform,
  View,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export { keyboardOverlap, keyboardTopFrom } from './keyboardLogic';

const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * Recouvrement d'une vue par le clavier. Poser `ref` ET `onLayout={measure}`
 * sur la vue de référence (celle dont le BAS ne doit pas passer sous le
 * clavier), puis décaler son contenu de `overlap`.
 */
export function useKeyboardOverlap(enabled = true) {
  const ref = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const [overlap, setOverlap] = useState(0);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    const node = ref.current;
    if (top === null || !node?.measureInWindow) {
      setOverlap(0);
      return;
    }
    node.measureInWindow((_x, y, _width, height) => setOverlap(keyboardOverlap(y, height, top)));
  }, []);

  useEffect(() => {
    if (!enabled) {
      keyboardTop.current = null;
      setOverlap(0);
      return undefined;
    }
    const screenHeight = () => Dimensions.get('screen').height;
    const show = Keyboard.addListener(SHOW_EVENT, (event: KeyboardEvent) => {
      keyboardTop.current = keyboardTopFrom(event?.endCoordinates, screenHeight());
      measure();
    });
    const hide = Keyboard.addListener(HIDE_EVENT, () => {
      keyboardTop.current = null;
      setOverlap(0);
    });
    // Feuille ouverte alors que le clavier est DÉJÀ là (champ focalisé avant).
    if (typeof Keyboard.isVisible === 'function' && Keyboard.isVisible()) {
      keyboardTop.current = keyboardTopFrom(Keyboard.metrics?.(), screenHeight());
      measure();
    }
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled, measure]);

  return { ref, overlap, measure, open: overlap > 0 };
}

/**
 * Conteneur qui ne laisse jamais le clavier recouvrir son contenu : il se
 * mesure lui-même et ajoute en bas exactement la part recouverte.
 * Remplace `KeyboardAvoidingView` partout (dont le comportement Android
 * supposait une fenêtre réduite).
 */
export function KeyboardAvoider({
  children,
  style,
  enabled = true,
  testID,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
  testID?: string;
}) {
  const { ref, overlap, measure } = useKeyboardOverlap(enabled);
  return (
    <View
      ref={ref}
      onLayout={measure}
      style={[style, overlap > 0 ? { paddingBottom: overlap } : null]}
      testID={testID}
    >
      {children}
    </View>
  );
}
