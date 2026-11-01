export interface VariantImageGroup {
  key: string;
  kind: string;
  values: Array<{ value: string; image?: string }>;
}

/** Return only the merchant-published image for the selected color. */
export function imageForSelectedColor(
  groups: readonly VariantImageGroup[],
  selection: Readonly<Record<string, string>>,
): string | null {
  const color = groups.find((group) => group.kind === 'color');
  if (!color) return null;
  const selected = String(selection[color.key] ?? '').trim();
  if (!selected) return null;
  const image = color.values.find((option) => option.value.trim().toLowerCase() === selected.toLowerCase())?.image;
  return typeof image === 'string' && image.trim() ? image.trim() : null;
}

/** Prefer an exact-combination image over a potentially tiny color swatch. */
export function preferredVariantImage(
  exactImage: string | null | undefined,
  groups: readonly VariantImageGroup[],
  selection: Readonly<Record<string, string>>,
): string | null {
  const exact = typeof exactImage === 'string' ? exactImage.trim() : '';
  return exact || imageForSelectedColor(groups, selection);
}
