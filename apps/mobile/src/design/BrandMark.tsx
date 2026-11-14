/** Shared identity (v7): zebra-striped Z + supplied lowercase zayrovi, no divider.
 * Light surfaces tint the stripes ink, dark surfaces white — one master, never a second drawing. */
import { Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "./theme";
import { BRAND_SYMBOL, BRAND_SYMBOL_MAX_RADIUS, BRAND_SYMBOL_SOLID } from "./brandSymbol";
import { BRAND_WORDMARK } from "./brandWordmark";

const BRAND_NAME = "ZAYROVI";
const hiddenSvg =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      };

export interface BrandMarkProps {
  size?: number;
  /** False renders only the symbol, for compact avatars and loading surfaces. */
  withName?: boolean;
  nameSize?: number;
  nameColor?: string;
  color?: string;
}

/** Below this width the stripes are thinner than a pixel and blur to grey: the solid Z is drawn instead. */
export const BRAND_SYMBOL_SOLID_BELOW = 24;

/** Width at which the Z's outline fits inside a circle of `radius` (round avatars, loading rings). */
export function brandSymbolWidthForRadius(radius: number) {
  return Math.round(((radius * BRAND_SYMBOL.width) / BRAND_SYMBOL_MAX_RADIUS) * 10) / 10;
}

/** A single contour source; tint belongs to the caller's theme, not the asset. */
export function BrandSymbol({
  width,
  color,
  variant,
}: {
  width: number;
  color: string;
  /** Default: striped, solid below BRAND_SYMBOL_SOLID_BELOW. */
  variant?: "striped" | "solid";
}) {
  const shape =
    (variant ?? (width < BRAND_SYMBOL_SOLID_BELOW ? "solid" : "striped")) === "solid"
      ? BRAND_SYMBOL_SOLID
      : BRAND_SYMBOL;
  const height =
    Math.round(((width * shape.height) / shape.width) * 10) / 10;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={shape.viewBox}
      {...hiddenSvg}
    >
      <Path d={shape.d} fill={color} />
    </Svg>
  );
}

export function BrandMark({
  size,
  withName = true,
  nameSize = 18,
  color,
  nameColor,
}: BrandMarkProps) {
  const theme = useTheme();
  const ink = color ?? nameColor ?? theme.colors.ink;
  // Match the web master: wordmark 66% of symbol height, clear space 24%.
  const symbolWidth =
    size ??
    (((nameSize * 1.15) / 0.66) * BRAND_SYMBOL.width) / BRAND_SYMBOL.height;
  const symbolHeight = (symbolWidth * BRAND_SYMBOL.height) / BRAND_SYMBOL.width;
  const height = symbolHeight * 0.66;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={BRAND_NAME}
      style={{
        flexShrink: 1,
        flexDirection: "row",
        direction: "ltr",
        alignItems: "center",
        gap: symbolHeight * 0.24,
      }}
    >
      <BrandSymbol width={symbolWidth} color={ink} />
      {withName && (
        <Svg
          width={(height * BRAND_WORDMARK.width) / BRAND_WORDMARK.height}
          height={height}
          viewBox={BRAND_WORDMARK.viewBox}
          {...hiddenSvg}
        >
          <Path d={BRAND_WORDMARK.d} fill={ink} />
        </Svg>
      )}
    </View>
  );
}

/** Wordmark only: headers/auth do not repeat the standalone emblem. */
export function BrandWordmark({ height = 26, color }: { height?: number; color?: string }) {
  const theme = useTheme();
  return <View accessible accessibilityRole="image" accessibilityLabel={BRAND_NAME.toLowerCase()}>
    <Svg width={height * BRAND_WORDMARK.width / BRAND_WORDMARK.height} height={height} viewBox={BRAND_WORDMARK.viewBox} {...hiddenSvg}>
      <Path d={BRAND_WORDMARK.d} fill={color ?? theme.colors.ink} />
    </Svg>
  </View>;
}
