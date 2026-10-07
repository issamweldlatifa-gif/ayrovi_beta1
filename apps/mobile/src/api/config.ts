/**
 * Configuration réseau — aucune dépendance à Expo ni à React Native.
 *
 * Volontairement isolée : la couche API doit rester testable en Node pur
 * (voir tests/api.test.ts), sans monter un moteur d'interface.
 *
 * Surcharge à la construction : EXPO_PUBLIC_API_BASE_URL.
 */
export const DEFAULT_API_BASE_URL = 'https://ayrovi.tn';

const configured = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();

/**
 * Origine de l'API. En production : une origine absolue (`https://ayrovi.tn`).
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
