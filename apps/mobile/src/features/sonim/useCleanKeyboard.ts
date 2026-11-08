import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type View } from 'react-native';
import { cleanKeyboardOverlap } from './cleanKeyboard';
export function useCleanKeyboard() {
  const root = useRef<View>(null), keyboardTop = useRef<number | null>(null);
  const [overlap, setOverlap] = useState(0), [open, setOpen] = useState(false);
  const measure = useCallback(() => {
    root.current?.measureInWindow((_x, y, _width, height) => setOverlap(cleanKeyboardOverlap(y, height, keyboardTop.current)));
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY; setOpen(true); measure();
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardTop.current = null; setOpen(false); setOverlap(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [measure]);
  return { root, overlap, open, measure };
}
