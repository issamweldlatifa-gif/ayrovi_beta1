import { Platform, type ViewStyle } from 'react-native';
import { webDirection } from '@/design/theme';

const mirror: ViewStyle = { transform: [{ scaleX: -1 }] };

/** Locale is app state, not I18nManager. Web can mirror scrolling via `direction`;
 * on native, mirror the scroller and unmirror each tile, as an inverted list does. */
export function publicationRailDirection(isRTL: boolean) {
  return {
    viewport: Platform.OS === 'web' ? webDirection(isRTL) : isRTL ? mirror : undefined,
    tile: Platform.OS !== 'web' && isRTL ? mirror : undefined,
  };
}
