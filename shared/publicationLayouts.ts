/** Geometry shared by native rendering and CRM. Every tile keeps its original media index. */
export const SOCIAL_TEMPLATES = [
  'social_mosaic',
  'social_strip',
  'social_pair',
] as const;
export const CAPTION_FIRST_TEMPLATES = [
  ...SOCIAL_TEMPLATES,
  'caption_photo',
  'shoppable',
] as const;
export function publicationTiles(template: string, count: number) {
  if (count < 1) return [];
  const visible = Math.min(
    count,
    template === 'social_pair' ? 2 : template === 'social_strip' ? 3 : 5
  );
  const rows =
    template === 'social_mosaic' && visible > 3 ? [2, visible - 2] : [visible];
  let index = 0;
  return rows.map((columns) =>
    Array.from({ length: columns }, () => {
      const i = index++;
      return { index: i, remaining: i === visible - 1 ? count - visible : 0 };
    })
  );
}
