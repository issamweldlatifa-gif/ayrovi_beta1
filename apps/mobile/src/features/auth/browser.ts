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
