import { AMAZON_MOBILE_CAPTURE_SCRIPT } from './amazon';
import { ZALANDO_MOBILE_CAPTURE_SCRIPT } from './zalando';

/**
 * Scripts AUTONOMES des lecteurs `integration: 'dedicated'`. Une entrée ici ⇔
 * une définition `dedicated` dans `captureReaders/` (vérifié par les tests).
 * Chaque script est une expression ES5 qui rend la chaîne JSON de capture, ou
 * `null` hors de ses domaines.
 */
export const AYWEBS_DEDICATED_CAPTURE_SCRIPTS: Readonly<Record<string, string>> = {
  amazon: AMAZON_MOBILE_CAPTURE_SCRIPT,
  zalando: ZALANDO_MOBILE_CAPTURE_SCRIPT,
};
