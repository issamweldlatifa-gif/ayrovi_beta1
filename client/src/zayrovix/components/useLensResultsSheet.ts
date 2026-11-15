import { useCallback, useEffect, useRef, useState } from 'react';

/** Compositor-only drag: no list rerender or changing layout height on each move. */
export function useLensResultsSheet(hasImage: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(!hasImage);
  const fullRef = useRef(full);
  const height = useRef(1);
  const frame = useRef(0);
  const offset = useRef(0);
  const drag = useRef<{ y: number; base: number; start: number; lastY: number; lastTime: number; velocity: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  const paint = useCallback((value: number) => {
    offset.current = value;
    const node = rootRef.current;
    if (!node) return;
    node.style.setProperty('--sheet-offset', `${value}px`);
    node.style.setProperty('--sheet-progress', String(1 - value / (height.current * .65)));
  }, []);
  const snap = useCallback((expanded: boolean) => {
    if (!hasImage) expanded = true;
    cancelAnimationFrame(frame.current);
    drag.current = null;
    rootRef.current?.removeAttribute('data-dragging');
    fullRef.current = expanded;
    setFull(expanded);
    if (!expanded && bodyRef.current) bodyRef.current.scrollTop = 0;
    paint(expanded ? 0 : height.current * .65);
  }, [hasImage, paint]);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const resize = () => { height.current = node.clientHeight || window.innerHeight; snap(fullRef.current); };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(node);
    window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); cancelAnimationFrame(frame.current); };
  }, [snap]);
  const begin = useCallback((y: number) => {
    if (!hasImage) return;
    const now = performance.now();
    drag.current = { y, base: offset.current, start: now, lastY: y, lastTime: now, velocity: 0, moved: false };
  }, [hasImage]);
  const move = useCallback((y: number) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(y - d.y) > 5) d.moved = true;
    if (!d.moved) return;
    const now = performance.now();
    d.velocity = (y - d.lastY) / Math.max(1, now - d.lastTime);
    d.lastY = y; d.lastTime = now;
    rootRef.current?.setAttribute('data-dragging', 'true');
    const next = Math.max(0, Math.min(height.current * .65, d.base + y - d.y));
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => paint(next));
  }, [paint]);
  const end = useCallback((cancelled = false) => {
    const d = drag.current;
    if (!d) return;
    skipClick.current = d.moved;
    if (cancelled || !d.moved) { snap(fullRef.current); return; }
    const travel = d.lastY - d.y;
    const recent = performance.now() - d.lastTime < 100;
    const next = Math.max(0, Math.min(height.current * .65, d.base + travel));
    const flick = recent && Math.abs(d.velocity) > .45 && Math.abs(travel) > 24;
    snap(flick ? travel < 0 : next < height.current * .325);
  }, [snap]);
  // Let the expanded result list scroll normally. Only hand downward movement
  // to the sheet when the list was already at its top at touchstart.
  useEffect(() => {
    const node = bodyRef.current;
    if (!node || !hasImage) return;
    let start: { x: number; y: number; eligible: boolean } | null = null;
    let moving = false;
    const startTouch = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, eligible: !fullRef.current || node.scrollTop <= 0 };
      moving = false;
    };
    const moveTouch = (e: TouchEvent) => {
      if (!start || !start.eligible || e.touches.length !== 1) return;
      const t = e.touches[0], dy = t.clientY - start.y;
      if (!moving && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(t.clientX - start.x)) {
        if (fullRef.current && dy < 0) { start = null; return; }
        begin(start.y); moving = true;
      }
      if (moving && e.cancelable) { e.preventDefault(); move(t.clientY); }
    };
    const endTouch = (e: TouchEvent) => {
      if (moving) { if (e.cancelable) e.preventDefault(); end(e.type === 'touchcancel'); }
      start = null; moving = false;
    };
    node.addEventListener('touchstart', startTouch, { passive: true });
    node.addEventListener('touchmove', moveTouch, { passive: false });
    node.addEventListener('touchend', endTouch, { passive: false });
    node.addEventListener('touchcancel', endTouch, { passive: false });
    return () => {
      node.removeEventListener('touchstart', startTouch); node.removeEventListener('touchmove', moveTouch);
      node.removeEventListener('touchend', endTouch); node.removeEventListener('touchcancel', endTouch);
    };
  }, [hasImage, begin, move, end]);
  return { rootRef, bodyRef, full, snap, begin, move, end, skipClick };
}
