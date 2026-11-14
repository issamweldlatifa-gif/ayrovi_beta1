/** Five icon-only destinations. Source-traced official camera/search and matching profile;
 * Approved thin-outline Home contour; master brand assets untouched. Clean is the sole approved multicolor exception.
 * Legacy export names are compatibility APIs, not visible product names/routes.
 */
import { View, type ColorValue } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { BrandSymbol, brandSymbolWidthForRadius } from './BrandMark';
import { BRAND } from './tokens.generated';
import { useTheme } from './theme';
import officialGlyphs from '../../../../shared/officialNavigationGlyphs.json';
import cleanPalette from '../../../../assets/brand/navigation-palette.json';

export type TabNavIconProps = { color: ColorValue; size?: number; focused?: boolean };
export const TAB_ICON_STROKE = 1.5;
export const NAV_ICON_SIZE = 28;

function useIcon(size?: number) {
  const theme = useTheme();
  return { dim: size ?? theme.iconSize.md, ink: theme.mode === 'dark' ? BRAND.white : BRAND.black };
}
function StrokeGlyph({ kind, size }: TabNavIconProps & { kind: 'lens' | 'search' | 'profile' }) {
  const { dim, ink } = useIcon(size);
  return <ReferenceNavigationGlyph kind={kind} size={dim} color={ink} />;
}
/** Shared reference geometry, also used on Clean's always-white attachment sheet. */
export function ReferenceNavigationGlyph({ kind, size: dim, color: ink }: { kind: 'lens' | 'search' | 'profile'; size: number; color: string }) {
  return <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={TAB_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      {kind !== 'profile' ? <G fill={ink} stroke="none" transform={officialGlyphs[kind === 'lens' ? 'lens' : 'aywebs'].transform}>
        {officialGlyphs[kind === 'lens' ? 'lens' : 'aywebs'].paths.map((path, index) => <Path key={index} d={path.d} transform={path.transform} />)}
      </G> : <><Circle cx={12} cy={6} r={3.5} /><Path d="M3 21V19A9 9 0 0 1 21 19V21Z" /></>}
    </Svg>
  </View>;
}
export function TabHomeIcon({ size }: TabNavIconProps) {
  const { dim, ink } = useIcon(size);
  return <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={TAB_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round"><Path d="M3 10.5L12 3L21 10.5V21H15V14H9V21H3Z" /></Svg></View>;
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
  const { dim, ink } = useIcon(size);
  return <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}><BrandSymbol width={brandSymbolWidthForRadius(dim / 2)} color={ink} /></View>;
}
