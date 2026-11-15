/** Mobile app metadata and bundled font assets. */
import Constants from 'expo-constants';

/** Version lue du manifeste Expo, source unique pour le pied de page. */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** Zayrovi Extracted Sans: poids statiques construits depuis la source WOFF2 vérifiée. */
export const FONT_SOURCES = {
  'Publication-Regular': require('../../assets/fonts/Publication-Regular.ttf'),
  'Publication-SemiBold': require('../../assets/fonts/Publication-SemiBold.ttf'),
  'PublicationPublisher-Bold': require('../../assets/fonts/PublicationPublisher-Bold.ttf'),
  'ZayroviExtracted-Regular': require('../../assets/fonts/ZayroviExtracted-Regular.ttf'),
  'ZayroviExtracted-Medium': require('../../assets/fonts/ZayroviExtracted-Medium.ttf'),
  'ZayroviExtracted-SemiBold': require('../../assets/fonts/ZayroviExtracted-SemiBold.ttf'),
  'ZayroviExtracted-Bold': require('../../assets/fonts/ZayroviExtracted-Bold.ttf'),
  'ZayroviExtracted-Heading': require('../../assets/fonts/ZayroviExtracted-Heading.ttf'),
  'NotoSansArabic-Regular': require('../../assets/fonts/NotoSansArabic-Regular.ttf'),
  'NotoSansArabic-Bold': require('../../assets/fonts/NotoSansArabic-Bold.ttf'),
} as const;
