/**
 * SONIM dans la barre du bas.
 *
 * L’assistant vit déjà dans `app/assistant.tsx` (écran complet, hors onglets).
 * La barre du bas réclame UN outil de plus : plutôt que de déplacer le fichier
 * et de casser les liens existants (`router.push('/assistant')` est utilisé
 * depuis l’accueil et le tiroir), on expose la MÊME écran sous l’onglet.
 * Un seul composant, deux entrées : pas de copie, donc pas de divergence.
 */
export { default } from '../assistant';
