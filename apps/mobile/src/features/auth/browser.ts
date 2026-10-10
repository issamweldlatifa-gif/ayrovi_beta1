/**
 * Fermeture de l'onglet de consentement — le seul endroit qui touche au
 * navigateur du système.
 *
 * Pourquoi un fichier à part : la couche réseau (`src/api/providers.ts`) doit
 * rester exécutable hors appareil (tests Node), et importer React Native la
 * casse. Le protocole d'attente vit là-bas ; l'onglet vit ici.
 */
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Issue d'une session de consentement. Trois états, pas deux : « l'utilisateur
 * a refermé » n'est ni un succès ni une panne, et le confondre avec une panne
 * afficherait une erreur à quelqu'un qui a simplement renoncé.
 */
import { providerOutcomeFrom, type ProviderSessionOutcome } from '@/api/providers';

export type { ProviderSessionOutcome };

/**
 * Ouvre le consentement SANS QUITTER L'APPLICATION.
 *
 * ── Le défaut corrigé (Q6, 08/10/2026) ──────────────────────────────────────
 * L'écran de connexion appelait `openBrowserAsync`, qui délègue au navigateur
 * du système : l'utilisateur basculait dans Chrome, UNE AUTRE application, et
 * devait revenir à la main. Le client l'a refusé nommément — « تسجيل دخول بش
 * ولي داخل تطبيق لا خروج من تطبيق » — et le site l'avait déjà corrigé pour son
 * compte (`client/src/customer/nativeOAuth.ts`, passage à l'onglet
 * personnalisé). L'application, elle, avait repris l'ancien chemin.
 *
 * `openAuthSessionAsync` ouvre un ONGLET PERSONNALISÉ (Custom Tabs sur Android,
 * ASWebAuthenticationSession sur iOS) : moteur Chrome — que Google accepte,
 * alors qu'il refuse les WebView embarquées (`disallowed_useragent`) — mais
 * hébergé dans notre propre pile d'activités. La feuille se referme seule en
 * atteignant la page de retour. On ne sort pas de l'application.
 *
 * ── Pourquoi on interroge le serveur QUAND MÊME ensuite ────────────────────
 * `app.json` déclare des filtres d'intention `autoVerify` sur l'hôte de l'API :
 * selon la version d'Android, la navigation finale peut être interceptée comme
 * lien profond au lieu d'être rendue dans l'onglet. L'attente active rend le
 * parcours insensible à ce détail : que la feuille se referme ou que le système
 * nous rende la main, la session finit par être réclamée.
 */
export async function openProviderSession(startUrl: string, returnUrl: string): Promise<ProviderSessionOutcome> {
  try {
    const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
    return providerOutcomeFrom(result.type);
  } catch {
    // Aucun navigateur compatible, ou ouverture refusée : l'appelant retombe
    // sur l'attente serveur plutôt que d'afficher une panne sèche.
    return 'failed';
  }
}

/**
 * Referme l'onglet ouvert par `openBrowserAsync`.
 *
 * Sur le web, `dismissBrowser` n'existe pas (il n'y a pas d'onglet système à
 * refermer depuis la page) : l'appeler quand même fait échouer toute la
 * connexion juste après le succès — constaté en navigateur réel. Refermer
 * l'onglet est un CONFORT : son échec ne doit jamais faire échouer une session
 * déjà obtenue.
 */
export async function closeProviderBrowser(): Promise<void> {
  if (Platform.OS === 'web') return;
  const dismiss = (WebBrowser as { dismissBrowser?: () => Promise<unknown> }).dismissBrowser;
  if (typeof dismiss !== 'function') return;
  try {
    await dismiss();
  } catch {
    // Déjà fermé par l'utilisateur : rien à faire, et surtout rien à signaler.
  }
}

/**
 * Ouvre une page légale (conditions, confidentialité) DANS l'application : même
 * onglet personnalisé que la connexion — jamais Chrome (une autre application).
 * La page n'attend aucun retour : l'onglet se referme quand l'utilisateur le ferme.
 */
export async function openLegalPage(url: string): Promise<void> {
  try {
    await WebBrowser.openAuthSessionAsync(url, url);
  } catch {
    // Aucun onglet disponible : rien à signaler, la connexion reste utilisable.
  }
}
