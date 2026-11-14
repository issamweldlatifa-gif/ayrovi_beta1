/** Official account avatar (owner, 14/11/2026): the zebra Z in WHITE on a BLACK disc — the dark rendering of
 * the v7 identity, reserved for the account's face in Publication, Reels and Stories (the app icon is the white
 * one). Same drawing and fit as client/public/media/logo-ayrovi-avatar.svg. Constant in both themes: identity,
 * not chrome. The Z's outline fits 80 % of the disc (`brandSymbolWidthForRadius`), and stays striped even at
 * 28 dp — measured legible at 2× and 3× densities. Decorative: the publisher's name is always written next to it. */
import { View } from 'react-native';
import { BrandSymbol, brandSymbolWidthForRadius } from './BrandMark';
import { BRAND } from './tokens.generated';

/** Diameters in dp. */
export const OFFICIAL_AVATAR = { reel: 28, publication: 32 } as const;
/** Radius of the circle the Z's outline fits, as a share of the diameter. */
export const OFFICIAL_AVATAR_FIT = 0.4;

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
      <BrandSymbol width={brandSymbolWidthForRadius(size * OFFICIAL_AVATAR_FIT)} color={BRAND.white} variant="striped" />
    </View>
  );
}
