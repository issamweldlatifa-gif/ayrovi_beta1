/**
 * Carrousel Hero — helpers PURS de couleur et de bilinguisme (§5.3).
 *
 * Pourquoi un module séparé du composant : la logique testable ne doit pas
 * dépendre de `react-native` (les tests de logique pure ne chargent jamais
 * le rendu natif). Même séparation que `design/layoutLogic.ts`.
 *
 * Le serveur extrait la palette de l'image (dominante + pastel clair) et la
 * publie avec la carte ; ici, on ne fait que LIRE ce contrat : choisir l'encre
 * qui contraste avec le fond effectif, et le texte selon la langue de l'app.
 */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rgb` / `#rrggbb` ⇒ composantes — `null` si le format est inattendu. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim();
  if (!HEX_RE.test(value)) return null;
  const clean = value.slice(1);
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Luminance relative (Rec. 709) — la même formule que le serveur. */
export function luminanceOfHex(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1; // pas de couleur ⇒ on suppose un fond clair
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

/**
 * Encre posée sur un fond adaptatif : le serveur garantit un pastel CLAIR en
 * mode auto, mais un override manuel peut être foncé — le contraste se mesure
 * sur le SUPPORT réel, pas sur le thème (même règle que `onMedia`).
 *
 * Reçoit le fond EFFECTIF (palette serveur, ou repli = surface du thème) :
 * en mode sombre, `surface` est foncée ⇒ l'encre choisie est claire.
 */
export function adaptiveInk(
  background: string,
  colors: { onAdaptiveLight: string; onAdaptiveDark: string },
): string {
  return luminanceOfHex(background) > 0.5 ? colors.onAdaptiveLight : colors.onAdaptiveDark;
}

/** Champ bilingue : la langue de l'app gagne, repli sur l'autre langue. */
export function pickHeroText(primary: string, arabic: string, isArabic: boolean): string {
  const a = primary.trim();
  const b = arabic.trim();
  if (isArabic) return b || a;
  return a || b;
}

/* ── Adoucissement du fond (2026-10-10) ───────────────────────────────────── */

/** Mélange linéaire de deux couleurs `#rrggbb` (`amount` : 0 = `from`, 1 = `to`). */
export function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  if (!a || !b) return from;
  const t = Math.min(1, Math.max(0, amount));
  const channel = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`.toUpperCase();
}

/** Couleur `#rrggbb` avec une opacité `alpha` (0..1), en `rgba(...)`. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, Math.max(0, alpha))})`;
}

/**
 * Fond du carrousel adouci vers le blanc de la page : la bordure de la photo reste
 * visible (cadre du visuel) sans que le fond soit trop saturé. Quantité fixe : 18 %.
 */
export const HERO_BACKGROUND_SOFTEN = 0.18;
export function softenHeroBackground(background: string, canvas: string): string {
  return mixHex(background, canvas, HERO_BACKGROUND_SOFTEN);
}
