/** Shared identity (v9, 18/11/2026): the official « Za. » logo — yellow circle, knocked-out z, a, yellow dot.
 *
 * One master, two official renderings (owner-supplied), chosen by the SURFACE, never redrawn:
 *  - `light` (white / light surfaces): a in ink;
 *  - `dark`  (black / dark or photographic surfaces): a in white.
 * The z is a cut-out of the circle: it always shows what is behind the logo, and its lower bar always runs out of
 * the circle (one open contour, never closed inside it). Circle and dot are always ZAYROVI yellow.
 * Below LOGO_MIN_HEIGHT the a and the dot would blur: compact placements use `BrandSymbol` (circle + z) instead. */
import { Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "./theme";
import { BRAND } from "./tokens.generated";
import { BRAND_LOGO, BRAND_MARK } from "./brandSymbol";

const BRAND_NAME = "ZAYROVI";
const hiddenSvg =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      };

export type BrandTone = "light" | "dark";

/** Brand-book sizes (dp, logo HEIGHT = the circle's diameter). The home header is the one place it runs larger. */
export const LOGO_SIZE = {
  /** Smallest full logo: below it, the a's counter closes. Use BrandSymbol under this. */
  min: 20,
  header: 28,
  home: 32,
  auth: 40,
} as const;
export const LOGO_MIN_HEIGHT = LOGO_SIZE.min;

/** Logo width for a given height — the ratio is fixed: never stretch the logo. */
export function brandLogoWidth(height: number) {
  return Math.round(((height * BRAND_LOGO.width) / BRAND_LOGO.height) * 10) / 10;
}

/** The full logo « Za. ». `tone` defaults to the theme (light theme → light rendering). */
export function BrandLogo({
  height = LOGO_SIZE.header,
  tone,
  testID,
}: {
  height?: number;
  tone?: BrandTone;
  testID?: string;
}) {
  const theme = useTheme();
  const surface: BrandTone = tone ?? (theme.mode === "dark" ? "dark" : "light");
  const a = surface === "dark" ? BRAND.white : BRAND.black;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={BRAND_NAME}
      style={{ direction: "ltr" }}
    >
      <Svg
        width={brandLogoWidth(height)}
        height={height}
        viewBox={BRAND_LOGO.viewBox}
        {...hiddenSvg}
      >
        <Path d={BRAND_LOGO.ring} fill={BRAND.yellow} />
        <Path d={BRAND_LOGO.a} fill={a} />
        <Path d={BRAND_LOGO.dot} fill={BRAND.yellow} />
      </Svg>
    </View>
  );
}

/** Rendering for a surface whose foreground ink is `ink` (e.g. adaptive ink over a hero tint): a light ink means a
 * dark surface → the dark rendering (white a). Accepts #RGB / #RRGGBB; anything else keeps the light rendering. */
export function brandToneForInk(ink: string): BrandTone {
  const hex = ink.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "dark" : "light";
}

/** Width of the symbol whose circle has `radius` (round avatars, loading rings): the mark IS the circle. */
export function brandSymbolWidthForRadius(radius: number) {
  return Math.round(radius * 2 * 10) / 10;
}

/** The symbol alone: yellow circle + knocked-out z. `color` only for single-colour uses (tab icon, masks). */
export function BrandSymbol({ width, color = BRAND.yellow }: { width: number; color?: string }) {
  return (
    <Svg width={width} height={width} viewBox={BRAND_MARK.viewBox} {...hiddenSvg}>
      <Path d={BRAND_MARK.d} fill={color} />
    </Svg>
  );
}

/** Compatibility wrapper for menus: the full logo at `size` dp high, or the symbol alone. */
export function BrandMark({
  size = LOGO_SIZE.header,
  withName = true,
  tone,
}: {
  size?: number;
  withName?: boolean;
  tone?: BrandTone;
}) {
  if (withName) return <BrandLogo height={size} tone={tone} />;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={BRAND_NAME}>
      <BrandSymbol width={size} />
    </View>
  );
}
