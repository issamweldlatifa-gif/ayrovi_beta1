/** Amount actually overlapped, not keyboard height (avoids double lifting on adjustResize). */
export function cleanKeyboardOverlap(top: number, height: number, keyboardTop: number | null): number {
  return keyboardTop === null ? 0 : Math.max(0, Math.round(top + height - keyboardTop));
}
