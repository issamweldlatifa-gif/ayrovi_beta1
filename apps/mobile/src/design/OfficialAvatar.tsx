/** Official account avatar (v9 « Za. », 18/11/2026): the symbol — yellow circle, knocked-out z — on a BLACK disc,
 * the dark master's colours, reserved for the account's face in Publication, Reels and Stories. Same drawing and fit
 * as client/public/media/logo-zayrovi-avatar.svg. Constant in both themes: identity, not chrome. The yellow circle
 * spans 84 % of the disc; the z's bar opens into the black ring. The full logo would be illegible at 28 dp, so the
 * symbol stands alone here. Decorative: the publisher's name is always written next to it. */
import { View } from 'react-native';
import { BrandSymbol, brandSymbolWidthForRadius } from './BrandMark';
import { BRAND } from './tokens.generated';

/** Diameters in dp. */
export const OFFICIAL_AVATAR = { reel: 28, publication: 32 } as const;
/** Radius of the yellow circle, as a share of the disc's diameter. */
export const OFFICIAL_AVATAR_FIT = 0.42;

export function OfficialAvatar({ size, testID }: { size: number; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: BRAND.black,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <BrandSymbol width={brandSymbolWidthForRadius(size * OFFICIAL_AVATAR_FIT)} />
    </View>
  );
}
