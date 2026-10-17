/**
 * Retour unique de l'application.
 *
 * Règle : revenir à l'écran précédent s'il existe (détail produit, commande,
 * sous-écran) ; sinon aller à `fallback`, par défaut l'accueil. Tous les
 * boutons « retour » et « fermer » passent par ici : aucun n'improvise sa
 * propre logique, donc aucun ne peut renvoyer vers un onglet au hasard.
 */
import { router } from 'expo-router';

export function goBack(fallback: string = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
