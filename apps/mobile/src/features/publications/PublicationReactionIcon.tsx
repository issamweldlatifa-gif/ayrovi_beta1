/** Z-Heart: scalable branded reaction, not a replacement Unicode emoji. */
import { Platform } from 'react-native';
import { PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import Svg, { Path } from 'react-native-svg';
export function PublicationReactionIcon({ active, color, size = 24 }: { active: boolean; color: string; size?: number }) {
  const hidden = Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessibilityElementsHidden: true };
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
    <Path d="M12 21 3.4 12.6C-2.1 6.7 5.9-.6 12 5.2 18.1-.6 26.1 6.7 20.6 12.6Z" fill={active ? color : 'none'} stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    <Path d="M9 8.6h6l-6 6.8h6" fill="none" stroke={active ? P.paper : color} strokeWidth={1.4} strokeLinejoin="round" />
  </Svg>;
}

/** Branded visual sticker for discovery empty states; this is not a Unicode emoji. */
export function PublicationSparkIcon() {
  const hidden = Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessibilityElementsHidden: true };
  return <Svg width={48} height={48} viewBox="0 0 64 64" {...hidden}>
    <Path d="m32 3 8 21 21 8-21 8-8 21-8-21L3 32l21-8Z" fill={P.accent} />
    <Path d="M25 24h15L24 41h16" fill="none" stroke={P.paper} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
