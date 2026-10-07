/**
 * Configuration réseau — aucune dépendance à Expo ni à React Native.
 *
 * Volontairement isolée : la couche API doit rester testable en Node pur
 * (voir tests/api.test.ts), sans monter un moteur d'interface.
 *
 * Surcharge à la construction : EXPO_PUBLIC_API_BASE_URL.
 */
/**
 * الأصل الافتراضي = **الخادم اللي موجود فعلاً**، موش النطاق اللي نحلمو بيه.
 *
 * `ayrovi.tn` ما فيهش خادم يجاوب (07/10/2026): أي حزمة تتبنى بالأصل هذا
 * تلقى «ما فماش شبكة» في كل شاشة. الأصل الحقيقي هو خدمة Render اللي يعلن
 * عليها الخادم نفسه (`client/src/services/apiOrigin.ts`، و
 * `android/app/build.gradle` قبلها).
 *
 * لمّا `ayrovi.tn` يولّي حيّ، التبديل = سطر واحد + بناء جديد — موش أكثر.
 */
export const DEFAULT_API_BASE_URL = 'https://ayrovi-beta1-1.onrender.com';

const configured = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();

/**
 * Origine de l'API. En production : une origine absolue (`DEFAULT_API_BASE_URL`).
 * En développement : `/` — l'application parle à sa propre origine et le proxy
 * Metro relaie vers le serveur local (voir metro.config.js). C'est ce qui
 * permet à un navigateur hors de la machine de développement de fonctionner
 * sans rien connaître du réseau local.
 */
export const API_BASE_URL = configured.replace(/\/+$/, '');

/**
 * Version que l'application DÉCLARE au serveur (`x-ayrovi-client`).
 *
 * Le serveur refuse toute déclaration qui ne ressemble pas à `mobile/<chiffres>`
 * et retombe alors sur le cookie du web — silencieusement, du point de vue de
 * l'application. Cette constante est donc un élément du contrat d'authentification,
 * pas un libellé d'affichage : elle est vérifiée par un test contre `app.json`
 * (`version`), la source unique de la version du paquet.
 *
 * Surcharge : EXPO_PUBLIC_APP_VERSION (posée par la chaîne de construction).
 */
export const CLIENT_VERSION = String(process.env.EXPO_PUBLIC_APP_VERSION ?? '').trim() || '2.0.0';

/** En-tête exact attendu par le serveur : `mobile/2.0.0`. */
export const CLIENT_HEADER = `mobile/${CLIENT_VERSION}`;
