/** Five icon-only destinations. Reference-derived camera/search and matching profile;
 * original Home contour retained. Clean is the sole approved multicolor exception.
 * Legacy export names are compatibility APIs, not visible product names/routes.
 */
import { View, type ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { BrandSymbol } from './BrandMark';
import { BRAND } from './tokens.generated';
import { BRAND_ACCENT } from './brandAppearance';
import { useTheme } from './theme';
import cleanPalette from '../../../../assets/brand/navigation-palette.json';

export type TabNavIconProps = { color: ColorValue; size?: number; focused?: boolean };
export const TAB_ICON_STROKE = 2.2;
export const NAV_ICON_SIZE = 28;

function useIcon(size?: number) {
  const theme = useTheme();
  return { dim: size ?? theme.iconSize.md, ink: theme.mode === 'dark' ? BRAND.white : BRAND.black };
}
function StrokeGlyph({ kind, size }: TabNavIconProps & { kind: 'lens' | 'search' | 'profile' }) {
  const { dim, ink } = useIcon(size);
  return <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={TAB_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      {kind === 'lens' ? <>
        <Path d="M14 5H8L6.5 7H5Q3 7 3 10V18Q3 21 6 21H18Q21 21 21 18V11" />
        <Circle cx={11} cy={14} r={3.5} /><Path d="M18 2L19 5L22 6L19 7L18 10L17 7L14 6L17 5Z" />
      </> : kind === 'search' ? <>
        <Path d="M11 3A8 8 0 1 0 19 11M16.7 16.7L22 22M17 2L18.4 5.6L22 7L18.4 8.4L17 12L15.6 8.4L12 7L15.6 5.6Z" />
      </> : <><Circle cx={12} cy={6} r={3.5} /><Path d="M3 21V19A9 9 0 0 1 21 19V21Z" /></>}
    </Svg>
  </View>;
}
export function TabHomeIcon({ size }: TabNavIconProps) {
  const { dim, ink } = useIcon(size);
  return <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><BrandSymbol width={dim} color={ink} /></View>;
}
export function TabLensIcon(props: TabNavIconProps) { return <StrokeGlyph {...props} kind="lens" />; }
export function TabAyWebsIcon(props: TabNavIconProps) { return <StrokeGlyph {...props} kind="search" />; }
export const TabAywebsPawIcon = TabAyWebsIcon;
export function TabProfileIcon(props: TabNavIconProps) { return <StrokeGlyph {...props} kind="profile" />; }
export function TabCleanIcon({ size }: TabNavIconProps) {
  const { dim } = useIcon(size);
  return <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={dim} height={dim} viewBox="0 0 24 24">
      <Path d="M12 3H9A8 8 0 0 0 5 18V22L9 19H12Z" fill={cleanPalette.cleanTurquoise} />
      <Path d="M12 3H15A8 8 0 0 1 15 19H12Z" fill={cleanPalette.cleanOrange} />
      <Path d="M18 9C17.4 13 16.5 13.8 13 14.5C16.5 15.1 17.4 15.9 18 20C18.6 15.9 19.5 15.1 23 14.5C19.5 13.8 18.6 13 18 9Z" fill={BRAND.white} />
      <Path d="M20.5 10A6.5 6.5 0 0 0 15 4.4H9A6.5 6.5 0 0 0 5.9 16.6L6.2 19.4L8.6 17.6H14" fill="none" stroke={BRAND.white} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </View>;
}
export const TabSonimIcon = TabCleanIcon;
export const TabBrandIcon = TabHomeIcon;
/** Kept for compatibility; never added back to the five-tab bar. */
export function TabSocialIcon({ size }: TabNavIconProps) {
  const { dim } = useIcon(size);
  return <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}><BrandSymbol width={dim} color={BRAND_ACCENT} /></View>;
}
