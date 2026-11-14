import { BRAND, FONT_STACK } from './brand.generated';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Oranges de marque des chartes retirées : #FF6900 (« Zalando », P4/T1), #FF7900 (ZAYROVI A v3),
 * #FE7003 et #FF7A00 (avant P4/T1). Ils restent écrits dans des réglages CMS déjà persistés et dans
 * les graines de la base ; ils ne sont plus l'identité depuis la palette officielle du 2026-11-06
 * (noir #0A0A0A · blanc #FFFFFF · bleu principal #0A63F5 · gris clair #F2F2F2). */
const LEGACY_BRAND_ORANGES = new Set(['#ff6900', '#ff7900', '#fe7003', '#ff7a00']);

/** Retired brand palette only; never applied to merchandise colour options or photographs. */
export const RETIRED_BRAND_PURPLES: Record<string, string> = {
  '#571ef6': '#0A63F5', '#c5b2f4': '#DCE8FE', '#491acc': '#0A53CB', '#926df9': '#78A9FA',
};
export function migrateBrandColor(value: unknown): string {
  const text = String(value ?? '').trim();
  return RETIRED_BRAND_PURPLES[text.toLowerCase()] ?? text;
}
function migrateBrandConfig(value: unknown): any {
  if (Array.isArray(value)) return value.map(migrateBrandConfig);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, migrateBrandConfig(item)]));
  return typeof value === 'string' ? (RETIRED_BRAND_PURPLES[value.toLowerCase()] ?? value) : value;
}

export const isLegacyBrandOrange = (value: unknown): boolean =>
  LEGACY_BRAND_ORANGES.has(String(value ?? '').trim().toLowerCase());

/** Accent configurable (ex. section LENS de l'accueil) : vide ou ancien orange de marque ⇒ bleu
 * officiel ; toute autre couleur choisie par l'administration est conservée telle quelle. */
export function brandAccentColor(value: unknown): string {
  const text = String(value ?? '').trim();
  return !text || isLegacyBrandOrange(text) ? BRAND.colors.accent : migrateBrandColor(text);
}

/** Brand-owned fields cannot be replaced by legacy CMS data, imported data or an API response.
 * Read adapter only: preserves business content/layout and does not rewrite stored rows.
 * The retired brand oranges are read as their official successors: accent and active icons
 * become the blue accent; a full-bleed section painted in the old orange becomes the brand
 * black (the identity forbids large blue surfaces). Any other admin colour is kept. */
export function enforceBrandIdentity<T>(input: T): T {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const value = record(migrateBrandConfig(input));
  const c = Object.fromEntries(Object.entries(BRAND.colors).map(([key,value]) => [key, value.toLowerCase()]));
  const colors = record(value.colors);
  const next: Record<string, unknown> = {
    ...value,
    typography: { ...record(value.typography), preset: BRAND.typography.preset, body: FONT_STACK, display: FONT_STACK,
      headingColor: c.ink, textColor: c.ink, letterSpacing: 0 },
    colors: { ...colors, pageBackground: c.canvas, surfaceBackground: c.surface,
      primary: c.ink, primaryDark: c.action, headerBackground: c.canvas, headerText: c.ink,
      footerBackground: c.canvas, footerText: c.ink,
      ...(isLegacyBrandOrange(colors.accent) ? { accent: c.accent } : {}) },
  };
  if (value.icons !== undefined && isLegacyBrandOrange(record(value.icons).activeColor)) {
    next.icons = { ...record(value.icons), activeColor: c.accent };
  }
  if (Array.isArray(value.sections)) {
    next.sections = value.sections.map((section) => {
      const current = record(section);
      return isLegacyBrandOrange(current.backgroundColor) ? { ...current, backgroundColor: c.ink } : section;
    });
  }
  return next as T;
}

/** Writes are explicit: don't claim to accept a font switch which will never be applied. */
export function hasForbiddenFontSelection(input: unknown): boolean {
  const typography = record(record(input).typography);
  return (['body', 'display'] as const).some(key => typography[key] !== undefined && typography[key] !== FONT_STACK)
    || (typography.preset !== undefined && typography.preset !== BRAND.typography.preset);
}

export function enforceLegacyTheme<T>(input: T): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const value = record(input);
  return {
    ...migrateBrandConfig(input),
    font: FONT_STACK,
    ...(isLegacyBrandOrange(value.accent) ? { accent: BRAND.colors.accent.toLowerCase() } : {}),
  } as T;
}
