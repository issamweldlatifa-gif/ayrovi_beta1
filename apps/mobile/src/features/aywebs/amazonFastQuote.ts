import { ayWebsSameAttribute } from '@/features/aywebs/attributeKeys';

/** Only attempt the fast server path when this capture publishes an exact,
 * priced and available combination. The server still validates and prices it. */
export function amazonCaptureHasPricedSelection(capture: unknown, selection: Record<string, string>): boolean {
  if (!capture || typeof capture !== 'object') return false;
  const matrix = (capture as Record<string, unknown>).variantMatrix;
  if (!Array.isArray(matrix)) return false;
  const selected = Object.entries(selection).filter(([, value]) => String(value).trim());
  if (!selected.length) return false;
  return matrix.some((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const row = entry as Record<string, unknown>;
    if (row.available !== true || row.priceFrom === true || typeof row.price !== 'string' || !row.price.trim()) return false;
    if (!row.attributes || typeof row.attributes !== 'object' || Array.isArray(row.attributes)) return false;
    const attrs = Object.entries(row.attributes as Record<string, unknown>).filter(([, value]) => String(value ?? '').trim());
    if (attrs.length !== selected.length) return false;
    const used = new Set<number>();
    for (const [key, value] of selected) {
      const candidates = attrs.map(([otherKey], index) => ayWebsSameAttribute(key, otherKey) ? index : -1).filter((i) => i >= 0);
      if (candidates.length !== 1 || used.has(candidates[0])) return false;
      const index = candidates[0];
      if (String(attrs[index][1]).trim().toLowerCase() !== value.trim().toLowerCase()) return false;
      used.add(index);
    }
    return used.size === attrs.length;
  });
}
