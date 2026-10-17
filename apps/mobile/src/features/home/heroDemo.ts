/**
 * Mode démo du carrousel Hero — pur (sans import d'image, testable).
 *
 * Activé UNIQUEMENT dans l'APK de démonstration (`EXPO_PUBLIC_HERO_DEMO=1`,
 * posé par `mobile-android.yml`). Le serveur publie rien pour l'instant : les
 * cartes embarquées (visuels dans `assets/hero/`) prennent alors le relais.
 * Une carte réellement publiée par l'Admin gagne toujours sur la démo.
 *
 * Les visuels sont générés (IA), sans texte ; les titres viennent des données.
 */

export const HERO_DEMO_ENABLED = process.env.EXPO_PUBLIC_HERO_DEMO === '1';

const DEMO_PREFIX = 'demo-';

/** Vrai pour les cartes embarquées : elles ne doivent jamais être envoyées en télémétrie. */
export function isDemoSlide(id: string): boolean {
  return id.startsWith(DEMO_PREFIX);
}
