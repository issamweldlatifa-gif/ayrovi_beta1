import appManifest from '../../app.json';

/** Deep-link scheme comes from the Expo manifest, not a second string literal. */
export const DEEP_LINK_SCHEME = appManifest.expo.scheme;
