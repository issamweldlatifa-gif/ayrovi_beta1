export const HIGHLIGHT_LIMIT = 4;
export const ZAYROVI_HIGHLIGHTS_KEY = 'mobile_zayrovi_highlights';
export type HighlightSlot = { reelId: string; productId: string };
export type HighlightSettings = { enabled: boolean; slots: HighlightSlot[] };
export const DEFAULT_HIGHLIGHTS: HighlightSettings = { enabled: true, slots: ['classic_outfits', 'workwear', 'city_break', 'rainy_day'].map(topic => ({ reelId: `reel_drive_${topic}_v2`, productId: '' })) };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);
export function normalizeHighlights(input: unknown): HighlightSettings | null {
  if (!input || typeof input !== 'object') return null;
  const { enabled, slots } = input as { enabled?: unknown; slots?: unknown };
  if (typeof enabled !== 'boolean' || !Array.isArray(slots) || slots.length > HIGHLIGHT_LIMIT || (enabled && slots.length !== HIGHLIGHT_LIMIT)) return null;
  const seen = new Set<string>();
  const normalized: HighlightSlot[] = [];
  for (const slot of slots) {
    if (!slot || !validId(slot.reelId) || (slot.productId !== '' && !validId(slot.productId)) || seen.has(slot.reelId)) return null;
    seen.add(slot.reelId);
    normalized.push({ reelId: slot.reelId, productId: slot.productId });
  }
  return { enabled, slots: normalized };
}
