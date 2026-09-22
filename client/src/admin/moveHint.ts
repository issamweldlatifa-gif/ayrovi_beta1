/**
 * Raison lisible d'un bouton de réordonnancement — y compris, et surtout, quand il est DÉSACTIVÉ.
 *
 * Un bouton grisé sans explication est un défaut d'ergonomie ET d'accessibilité : ni la souris ni
 * le lecteur d'écran ne disent « pourquoi ». Cette fonction renvoie donc trois phrases distinctes,
 * calculées depuis l'état réel du bouton (permission, première/dernière position, action possible).
 * Elle est partagée par les quatre écrans qui réordonnent du contenu (hero, LENS, sections
 * d'accueil, studio d'interface) : une seule définition, quatre usages.
 */
export const moveHint = (direction: -1 | 1, blockedByPermission: boolean, atEdge: boolean): string => {
  if (blockedByPermission) return 'Vous n’avez pas la permission de modifier l’ordre.';
  if (atEdge) return direction === -1 ? 'Déjà en première position.' : 'Déjà en dernière position.';
  return direction === -1 ? 'Monter d’un rang' : 'Descendre d’un rang';
};
