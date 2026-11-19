/** Five icon-only destinations. Source-traced official camera/search and matching profile;
 * Approved thin-outline Home contour; master brand assets untouched. Clean is the sole approved multicolor exception.
 * Legacy export names are compatibility APIs, not visible product names/routes.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { BrandSymbol, brandSymbolWidthForRadius } from './BrandMark';
import { BRAND } from './tokens.generated';
import { CLEAN_INK_SHADE } from './tokens.mobile';
import { useTheme } from './theme';
import officialGlyphs from '../../../../shared/officialNavigationGlyphs.json';
import cleanPalette from '../../../../assets/brand/navigation-palette.json';

export type TabNavIconProps = { color: ColorValue; size?: number; focused?: boolean };
export const TAB_ICON_STROKE = 1.5;
export const NAV_ICON_SIZE = 28;

// A shape cue works even when the five approved glyphs remain monochrome.
function TabGlyphFrame({ children, dim, focused = false, ink }: {
  children: ReactNode; dim: number; focused?: boolean; ink: string;
}) {
  return <View style={{ ...styles.slot, width: dim, height: dim }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {children}
    <View testID={focused ? "tab-selection-indicator" : undefined} pointerEvents="none" style={[styles.indicator, { backgroundColor: focused ? ink : 'transparent' }]} />
  </View>;
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
  indicator: { marginTop: 4, width: 12, height: 2, borderRadius: 1 },
});

function useIcon(size?: number) {
  const theme = useTheme();
  return { dim: size ?? theme.iconSize.md, ink: theme.mode === 'dark' ? BRAND.white : BRAND.black };
}
function StrokeGlyph({ kind, size, focused }: TabNavIconProps & { kind: 'lens' | 'search' | 'profile' }) {
  const { dim, ink } = useIcon(size);
  return <TabGlyphFrame dim={dim} focused={focused} ink={ink}><ReferenceNavigationGlyph kind={kind} size={dim} color={ink} /></TabGlyphFrame>;
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
export function TabHomeIcon({ size, focused }: TabNavIconProps) {
  const { dim, ink } = useIcon(size);
  return <TabGlyphFrame dim={dim} focused={focused} ink={ink}><Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={TAB_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round"><Path d="M3 10.5L12 3L21 10.5V21H15V14H9V21H3Z" /></Svg></TabGlyphFrame>;
}
export function TabLensIcon(props: TabNavIconProps) { return <StrokeGlyph {...props} kind="lens" />; }
export function TabAyWebsIcon(props: TabNavIconProps) { return <StrokeGlyph {...props} kind="search" />; }
export const TabAywebsPawIcon = TabAyWebsIcon;
export function TabProfileIcon(props: TabNavIconProps) { return <StrokeGlyph {...props} kind="profile" />; }
/**
 * Logo Clean. `tone="brand"` (défaut) : turquoise + orange. 16/11 — `tone="ink"` (carte du
 * panier) : le logo en NOIR qui GARDE son éclat — moitié gauche en encre, moitié droite un
 * ton plus clair (la coupure reste lisible), étincelle et reflet conservés en blanc (en noir
 * sur thème sombre, où l'encre devient blanche).
 */
export function TabCleanIcon({ size, focused, tone = 'brand' }: TabNavIconProps & { tone?: 'brand' | 'ink' }) {
  const { dim, ink } = useIcon(size);
  const dark = ink === BRAND.white;
  const left = tone === 'ink' ? ink : cleanPalette.cleanTurquoise;
  const right = tone === 'ink' ? (dark ? CLEAN_INK_SHADE.dark : CLEAN_INK_SHADE.light) : cleanPalette.cleanOrange;
  const shine = tone === 'ink' && dark ? BRAND.black : BRAND.white;
  return <TabGlyphFrame dim={dim} focused={focused} ink={ink}>
    <Svg width={dim} height={dim} viewBox="0 0 24 24">
      <Path d="M12 3H9A8 8 0 0 0 5 18V22L9 19H12Z" fill={left} />
      <Path d="M12 3H15A8 8 0 0 1 15 19H12Z" fill={right} />
      <Path d="M18 9C17.4 13 16.5 13.8 13 14.5C16.5 15.1 17.4 15.9 18 20C18.6 15.9 19.5 15.1 23 14.5C19.5 13.8 18.6 13 18 9Z" fill={shine} />
      <Path d="M20.5 10A6.5 6.5 0 0 0 15 4.4H9A6.5 6.5 0 0 0 5.9 16.6L6.2 19.4L8.6 17.6H14" fill="none" stroke={shine} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </TabGlyphFrame>;
}
export const TabSonimIcon = TabCleanIcon;
export const TabBrandIcon = TabHomeIcon;
/** The small Social glyph uses just the original yellow Z symbol, never the full lockup. */
export function TabSocialIcon({ size }: TabNavIconProps) {
  const { dim } = useIcon(size);
  return <View style={[styles.slot, { width: dim, height: dim }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <BrandSymbol width={brandSymbolWidthForRadius(dim / 2)} color={BRAND.yellow} />
  </View>;
}
