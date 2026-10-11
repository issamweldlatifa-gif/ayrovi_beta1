/** Mobile app metadata and bundled font assets. */
import Constants from 'expo-constants';

/** Version lue du manifeste Expo, source unique pour le pied de page. */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** Sources des polices embarquées (voir assets/fonts, licences OFL incluses). */
export const FONT_SOURCES = {
  'ZalandoSans-Regular': require('../../assets/fonts/ZalandoSans-Regular.ttf'),
  'ZalandoSans-SemiBold': require('../../assets/fonts/ZalandoSans-SemiBold.ttf'),
  'ZalandoSans-Bold': require('../../assets/fonts/ZalandoSans-Bold.ttf'),
  'NotoSansArabic-Regular': require('../../assets/fonts/NotoSansArabic-Regular.ttf'),
  'NotoSansArabic-Bold': require('../../assets/fonts/NotoSansArabic-Bold.ttf'),
} as const;
