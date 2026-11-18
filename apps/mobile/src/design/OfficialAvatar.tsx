/** Official account avatar = the SOCIAL ICON (owner's drawing, 18/11/2026): a BLACK rounded tile, the yellow circle
 * with the knocked-out z (its lower bar runs out into the black) and the yellow dot, brought closer than in the full
 * logo (gap = the dot's diameter). Same drawing and fit as client/public/media/logo-zayrovi-avatar.svg — both read
 * SOCIAL_ICON, generated from the master by `npm run brand:build`. Constant in both themes: identity, not chrome.
 * Decorative: the publisher's name is always written next to it. The header logo is NOT this icon (unchanged). */
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { BRAND_MARK, SOCIAL_ICON } from './brandSymbol';
import { BRAND } from './tokens.generated';

/** Tile sizes in dp. */
export const OFFICIAL_AVATAR = { reel: 28, publication: 32 } as const;

/** Placement of the mark + dot group inside a `size` tile (centred, `SOCIAL_ICON.content` of the width). */
export function socialIconTransform(size: number) {
  const scale = (size * SOCIAL_ICON.content) / SOCIAL_ICON.width;
  return { scale, x: (size - SOCIAL_ICON.width * scale) / 2, y: (size - SOCIAL_ICON.height * scale) / 2 };
}

export function OfficialAvatar({ size, testID }: { size: number; testID?: string }) {
  const { scale, x, y } = socialIconTransform(size);
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect width={size} height={size} rx={size * SOCIAL_ICON.radius} fill={BRAND.black} />
        <G transform={`translate(${x} ${y}) scale(${scale})`}>
          <Path d={BRAND_MARK.d} fill={BRAND.yellow} />
          <Circle cx={SOCIAL_ICON.dot.cx} cy={SOCIAL_ICON.dot.cy} r={SOCIAL_ICON.dot.r} fill={BRAND.yellow} />
        </G>
      </Svg>
    </View>
  );
}
