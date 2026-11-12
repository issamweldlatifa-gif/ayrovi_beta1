/**
 * Couleurs d'un bloc Publication. Le FOND vient du CRM (donnée, pas un choix
 * de design écrit dans le code) ; le texte en découle : l'encre la plus
 * lisible des deux encres de la page, et une encre secondaire mélangée au fond.
 *
 * Module PUR : l'encre et le papier sont passés par l'appelant (jetons
 * Publication), aucune couleur n'est écrite ici.
 */
import { isNearWhite, mixColor, readableInk } from '../../../../../../shared/publicationBlocks';

export interface BlockInks {
  /** Texte principal (titre, marque, prix). */
  ink: string;
  /** Texte secondaire (« Sponsorisé », éditeur) : 35 % du fond dans l'encre. */
  muted: string;
}

export function blockInks(background: string, ink: string, paper: string): BlockInks {
  const main = readableInk(background, ink, paper);
  return { ink: main, muted: mixColor(main, background, 0.35) };
}

/** Un fond blanc n'ajoute pas de marge colorée autour du bloc. */
export function hasTintedBackground(background: string): boolean {
  return !isNearWhite(background);
}
