/** UAX #9 run ordering; keep each Arabic run logical for fontkit's shaping.
 * Reversing raw Arabic strings would break shaping/marks and reverse prices. */
import bidiFactory from 'bidi-js';
const bidi = bidiFactory();
const arabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;
export function orderPdfTextRuns(text: string) {
  const { levels } = bidi.getEmbeddingLevels(text);
  const result: Array<{ text: string; arabic: boolean; level: number }> = [];
  let offset = 0;
  for (const char of text) {
    const level = levels[offset] || 0;
    const isArabic = arabic.test(char) || /[\u200c\u200d]/.test(char) && Boolean(result.at(-1)?.arabic);
    const mirrored = level % 2 ? bidi.getMirroredCharacter(char) || char : char;
    const last = result.at(-1);
    if (last && last.arabic === isArabic && last.level === level) last.text += mirrored;
    else result.push({ text: mirrored, arabic: isArabic, level });
    offset += char.length;
  }
  // UAX #9 L2, applied to whole shaped runs rather than individual code points.
  const max = Math.max(0, ...result.map(r => r.level));
  const minOdd = Math.min(...result.filter(r => r.level % 2).map(r => r.level));
  for (let level = max; level >= minOdd; level--) {
    for (let start = 0; start < result.length;) {
      if (result[start].level < level) { start++; continue; }
      let end = start + 1;
      while (end < result.length && result[end].level >= level) end++;
      result.splice(start, end - start, ...result.slice(start, end).reverse());
      start = end;
    }
  }
  return result;
}
