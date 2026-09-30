/**
 * A struck-through price is a visual fact, not an OCR guess.
 * A thin continuous dark run through the middle of a price box is evidence.
 * Text glyphs leave gaps; a strike line does not.
 */
export interface StrikeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function detectStrikeInRegion(
  pixels: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  box: StrikeBox,
): boolean {
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(imageWidth, Math.ceil(box.x + box.width));
  const bottom = Math.min(imageHeight, Math.ceil(box.y + box.height));
  const width = right - left;
  const height = bottom - top;
  if (width < 12 || height < 8) return false;

  const dark = (x: number, y: number) => pixels[y * imageWidth + x] < 150;
  const rowStats = (y: number) => {
    const margin = Math.floor(width * 0.06);
    let covered = 0;
    let maxGap = 0;
    let gap = 0;
    let seen = false;
    for (let x = left + margin; x < right - margin; x += 1) {
      if (dark(x, y)) {
        covered += 1;
        if (seen) maxGap = Math.max(maxGap, gap);
        gap = 0;
        seen = true;
      } else if (seen) gap += 1;
    }
    const span = Math.max(1, width - margin * 2);
    return { continuous: seen && maxGap <= 3 && covered / span >= 0.62 };
  };

  const continuousRows: number[] = [];
  for (let y = top; y < bottom; y += 1) {
    if (rowStats(y).continuous) continuousRows.push(y);
  }
  const runs: number[][] = [];
  for (const y of continuousRows) {
    const last = runs[runs.length - 1];
    if (last && y === last[last.length - 1] + 1) last.push(y);
    else runs.push([y]);
  }
  const midTop = top + height * 0.28;
  const midBottom = top + height * 0.72;
  return runs.some((run) => run.length >= 1 && run.length <= 3 && run[0] >= midTop && run[run.length - 1] <= midBottom);
}
