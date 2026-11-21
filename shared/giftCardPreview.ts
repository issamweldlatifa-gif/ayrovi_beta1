// Preview denominations and styles only. Never used as checkout pricing.
export const giftDesigns = ['sunburst', 'ribbon', 'bloom', 'confetti', 'orbit', 'mosaic'] as const;
export type GiftDesign = typeof giftDesigns[number];
export const giftFormats = ['digital', 'physical'] as const;
export type GiftFormat = typeof giftFormats[number];
export const giftDesignsFor = (format: GiftFormat): readonly GiftDesign[] =>
  format === 'physical' ? ['sunburst', 'ribbon', 'mosaic', 'bloom'] : giftDesigns;
export const giftDeliveryModes = ['print', 'email', 'link'] as const;
export type GiftDeliveryMode = typeof giftDeliveryModes[number];
export const giftPresets = [25, 50, 75, 100] as const;
export const giftPreviewMax = 200;
export const giftPreviewMin = (format: GiftFormat) => format === 'physical' ? 25 : 10;

export function parseGiftPreviewAmount(value: string, format: GiftFormat): number | null {
  const normalized = value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0)).replace(/[،٫,]/g, '.');
  const match = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(normalized);
  if (!match) return null;
  const millimes = Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'));
  return millimes >= giftPreviewMin(format) * 1000 && millimes <= giftPreviewMax * 1000 ? millimes : null;
}

export type GiftLabRow = {
  id: string; design: GiftDesign; format: GiftFormat; amountMillimes: number; status: 'DRAFT' | 'APPROVED';
  createdBy: string; createdAt: string; reviewedAt: string | null;
};
