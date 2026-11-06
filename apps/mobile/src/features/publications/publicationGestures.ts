/** Vertical dismissal never steals a horizontal carousel gesture. Pure for deterministic tests. */
export function startsPublicationDismiss(dx: number, dy: number, atTop: boolean) {
  return atTop && dy > 16 && Math.abs(dy) > Math.abs(dx) * 1.5;
}
export function finishesPublicationDismiss(dy: number, vy: number) {
  return dy >= 100 || (dy > 36 && vy > .85);
}
