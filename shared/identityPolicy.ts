import { BRAND, FONT_STACK } from './brand.generated';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Brand-owned fields cannot be replaced by legacy CMS data, imported data or an API response.
 * Read adapter only: preserves business content/layout and does not rewrite stored rows. */
export function enforceBrandIdentity<T>(input: T): T {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const value = record(input);
  const c = Object.fromEntries(Object.entries(BRAND.colors).map(([key,value]) => [key, value.toLowerCase()]));
  return {
    ...value,
    typography: { ...record(value.typography), preset: BRAND.typography.preset, body: FONT_STACK, display: FONT_STACK,
      headingColor: c.ink, textColor: c.ink, letterSpacing: 0 },
    colors: { ...record(value.colors), pageBackground: c.canvas, surfaceBackground: c.surface,
      primary: c.ink, primaryDark: c.action, headerBackground: c.canvas, headerText: c.ink,
      footerBackground: c.canvas, footerText: c.ink },
  } as T;
}

/** Writes are explicit: don't claim to accept a font switch which will never be applied. */
export function hasForbiddenFontSelection(input: unknown): boolean {
  const typography = record(record(input).typography);
  return (['body', 'display'] as const).some(key => typography[key] !== undefined && typography[key] !== FONT_STACK)
    || (typography.preset !== undefined && typography.preset !== BRAND.typography.preset);
}

export function enforceLegacyTheme<T>(input: T): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  return { ...input, font: FONT_STACK } as T;
}
