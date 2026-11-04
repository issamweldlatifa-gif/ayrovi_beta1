/**
 * Hauteur du clavier, en points — pour un écran qui n'utilise PAS `AppScreen`
 * (le viseur Z Lens est un plein écran absolu, il ne peut pas passer par lui).
 *
 * ── Le défaut que ce hook corrige (28/10/2026) ─────────────────────────────
 * Le champ « recherche par mots-clés » et le champ « adresse » vivent dans le
 * panneau du BAS, posé en `position: absolute; bottom: 0` sur la caméra. Le
 * clavier s'ouvrait donc PAR-DESSUS : on tapait sans voir ce qu'on tapait.
 *
 * ── Pourquoi iOS seulement ─────────────────────────────────────────────────
 * Android (Expo, `softwareKeyboardLayoutMode` par défaut = `resize`) RÉDUIT la
 * fenêtre quand le clavier s'ouvre : un panneau ancré en bas remonte déjà tout
 * seul, et ajouter la hauteur du clavier le ferait sauter deux fois trop haut.
 * iOS, lui, laisse la fenêtre intacte et recouvre : c'est là qu'il faut la
 * valeur. `enabled` permet d'appeler le hook sans écouter quand on n'en a pas
 * besoin (aucun abonnement inutile au clavier).
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    /* `willShow` sur iOS : la valeur arrive AVANT l'animation, donc le panneau
       monte en même temps que le clavier au lieu de sauter après. Android
       n'émet que `didShow` — mais on ne s'y abonne pas (voir l'en-tête). */
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setInset(Math.max(0, Math.round(event.endCoordinates.height)));
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);

  return inset;
}
