/**
 * OCEREX dans la barre du bas — « صورة فيها سعر ».
 *
 * Même raisonnement que pour SONIM : l’écran existe (`app/lens/ocerex.tsx`,
 * déjà câblé sur `/api/ocerex`). On l’expose comme onglet sans le dupliquer,
 * pour qu’il n’y ait jamais deux versions d’OCEREX dans le produit.
 */
export { default } from '../lens/ocerex';
