/**
 * Constantes de construction — ce que l'écran d'accueil affiche pour qu'on
 * sache toujours QUELLE version tourne réellement sur l'appareil.
 *
 * Rien de secret ici : l'application ne contient aucune clé d'API (PLAN.md §5).
 */
import Constants from 'expo-constants';
import { API_BASE_URL } from '@/api/config';

const trim = (value: string | undefined) => (value ?? '').trim();

/** Origine de l'API — définie dans la couche réseau, réexportée pour l'affichage. */
export { API_BASE_URL };

/** « dev » hors chaîne de construction ; en CI, l'empreinte du commit. */
export const BUILD_STAMP = trim(process.env.EXPO_PUBLIC_BUILD_STAMP) || 'dev';

/** Version lue de app.json — le manifeste reste la source unique. */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
export const APP_VERSION_CODE = Constants.expoConfig?.android?.versionCode ?? 0;
export const APP_IDENTIFIER = Constants.expoConfig?.android?.package ?? 'app.ayrovi.mobile';

/**
 * Le scheme profond reste `ayrovi` (identité historique) : les liens
 * `ayrovi://aywebs?url=…` déjà partagés continuent d'ouvrir l'application.
 */
export const DEEP_LINK_SCHEME = 'ayrovi';

/** Sources des polices embarquées (voir assets/fonts, licences OFL incluses). */
export const FONT_SOURCES = {
  'ZalandoSans-Regular': require('../../assets/fonts/ZalandoSans-Regular.ttf'),
  'ZalandoSans-Bold': require('../../assets/fonts/ZalandoSans-Bold.ttf'),
  'NotoSansArabic-Regular': require('../../assets/fonts/NotoSansArabic-Regular.ttf'),
  'NotoSansArabic-Bold': require('../../assets/fonts/NotoSansArabic-Bold.ttf'),
} as const;
