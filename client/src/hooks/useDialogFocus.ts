import { useEffect, type RefObject } from 'react';

/** For an active top-level dialog. Nested dialogs should own their own focus boundary. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const targets = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]
      .filter(el => !el.closest('[inert],[hidden]') && el.getClientRects().length > 0);
    (panel.querySelector<HTMLElement>('[data-dialog-autofocus]') || targets()[0] || panel).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = targets();
      const first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault();panel.focus();return; }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault();last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault();first.focus(); }
    };
    panel.addEventListener('keydown', onKey);
    return () => { panel.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [active, ref]);
}
