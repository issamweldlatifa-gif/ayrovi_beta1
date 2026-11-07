import { NAVIGATION_ARROW_SIZE, PUBLICATION_THEME as P } from './tokens.mobile';
/** Official navigation arrow. One geometry and logical size across headers and entry links. */
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
export function NavigationIcon(props: ComponentProps<typeof Ionicons>) {
  const name = String(props.name);
  if (!/^(arrow|chevron)-(back|forward)(-outline)?$/.test(name))
    return <Ionicons {...props} />;
  const forward = name.includes('forward');
  const hidden =
    Platform.OS === 'web'
      ? { 'aria-hidden': true as const }
      : { accessibilityElementsHidden: true };
  const size =
    typeof props.size === 'number' && props.size < 24
      ? 22
      : NAVIGATION_ARROW_SIZE;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={props.style as any}
      {...hidden}
    >
      <Path
        d={forward ? 'M3 16h26M18 5l11 11-11 11' : 'M29 16H3M14 5 3 16l11 11'}
        stroke={props.color || P.ink}
        strokeWidth={1.7}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

NavigationIcon.glyphMap = Ionicons.glyphMap;
