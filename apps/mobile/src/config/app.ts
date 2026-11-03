/** Mobile app metadata and bundled font assets. */
import Constants from 'expo-constants';

/** Version lue du manifeste Expo, source unique pour le pied de page. */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** Ayrovi Extracted Sans: poids statiques construits depuis la source WOFF2 vérifiée. */
export const FONT_SOURCES = {
  'AyroviExtracted-Regular': require('../../assets/fonts/AyroviExtracted-Regular.ttf'),
  'AyroviExtracted-SemiBold': require('../../assets/fonts/AyroviExtracted-SemiBold.ttf'),
  'AyroviExtracted-Bold': require('../../assets/fonts/AyroviExtracted-Bold.ttf'),
  'NotoSansArabic-Regular': require('../../assets/fonts/NotoSansArabic-Regular.ttf'),
  'NotoSansArabic-Bold': require('../../assets/fonts/NotoSansArabic-Bold.ttf'),
} as const;
