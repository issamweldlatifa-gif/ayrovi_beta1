/** Shared native brand identity: outlined ZAYROVI, A without a crossbar. */
import { Platform, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { useTheme } from './theme';
import { Z_MARK } from './zMark';
import { BRAND_WORDMARK } from './brandWordmark';

const BRAND_NAME = 'ZAYROVI';
const hiddenSvg = Platform.OS === 'web'
  ? { 'aria-hidden': true as const }
  : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

export interface BrandMarkProps {
  size?: number;
  withName?: boolean;
  nameSize?: number;
  nameColor?: string;
  color?: string;
}

export function ZMark({ width, color }: { width: number; color: string }) {
  const height = Math.round(((width * Z_MARK.height) / Z_MARK.width) * 10) / 10;
  return <Svg width={width} height={height} viewBox={Z_MARK.viewBox} {...hiddenSvg}>
    <Path d={Z_MARK.d} fill={color} />
  </Svg>;
}

export function BrandMark({ nameSize = 18, color, nameColor }: BrandMarkProps) {
  const theme = useTheme();
  // Match the former text's cap height; scale uniformly at every usage.
  const height = nameSize * 0.74;
  return <View accessible accessibilityRole="image" accessibilityLabel={BRAND_NAME} style={{ flexShrink: 1 }}>
    <Svg width={height * BRAND_WORDMARK.width / BRAND_WORDMARK.height} height={height}
      viewBox={BRAND_WORDMARK.viewBox} {...hiddenSvg}>
      <G transform="scale(1,-1)">
        {BRAND_WORDMARK.paths.map((d, i) => <Path key={i} d={d} fill={color ?? nameColor ?? theme.colors.ink} />)}
      </G>
    </Svg>
  </View>;
}
