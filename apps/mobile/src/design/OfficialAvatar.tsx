/** Social identity: the full yellow / ink « Za. » artwork on white, from the brand master.
 * The application icon, splash and general headers are independent. */
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { BRAND_LOGO } from './brandSymbol';
import { BRAND } from './tokens.generated';

export const OFFICIAL_AVATAR = { reel: 28, publication: 32 } as const;
const TILE = 1800;

export function OfficialAvatar({ size, testID }: { size: number; testID?: string }) {
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 6, backgroundColor: BRAND.white }}>
      <Svg width={size} height={size} viewBox={`0 0 ${TILE} ${TILE}`}>
        <G transform={`translate(${(TILE - BRAND_LOGO.width) / 2} ${(TILE - BRAND_LOGO.height) / 2})`}>
          <Path d={BRAND_LOGO.ring} fill={BRAND.yellow} />
          <Path d={BRAND_LOGO.a} fill={BRAND.black} />
          <Path d={BRAND_LOGO.dot} fill={BRAND.yellow} />
        </G>
      </Svg>
    </View>
  );
}
