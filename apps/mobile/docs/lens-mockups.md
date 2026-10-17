# ZAYROVIX Lens — maquettes approuvées (application React Native)

Document de référence (dans le dépôt pour ne pas être perdu). Chaque section : ce que montre la maquette, la décision, et l'état réel dans `apps/mobile`.
Les maquettes sont des visuels de référence : la mise en œuvre suit les **données réelles** du serveur (aucun prix, promo ou pourcentage inventé).

## 1. Lens — caméra (sélecteur de mode)
- Montre : titre, consigne, sélecteur **Scan en direct / Photo / Lien / code**, vignette, déclencheur, bouton OCEREX.
- Décision : une seule page Lens ; le mode choisi affiche sa carte.
- État : **fait** — sélecteur « Photo / Scan en direct / Lien-code » (`de35927`). Raccourci OCEREX dans la caméra : non fait.

## 2. Lens — résultats en cours (feuille de progression)
- Montre : feuille « Résultats Lens », étapes « Image lue ✓ / Recherche des boutiques ⟳ / Lecture des fiches produit », emplacements gris, « Réessayer » et « Annuler ».
- Décision : étapes et fiches viennent du serveur (flux SSE de `/api/ayrovix/analyze-image`, en-tête `Accept: text/event-stream` : `progress`, `card`, `done`, `error`). Rien n'est simulé.
- État : **réécrit selon le visuel** (`LensResultsSheet.tsx`, feuille en bas) — à tester sur appareil. Ancien état : client de flux `src/api/lensStream.ts` (XHR, car `fetch` ne livre pas le flux sous React Native), feuille `src/features/lens/LensProgressSheet.tsx`, annulation, « Réessayer » après échec. Tests : `tests/lens-stream.test.ts`. Le flux XHR n'a pas été vérifié sur un vrai téléphone.

## 3. Carte produit (résultats)
- Montre : image, pastille « Combinaisons disponibles », « Promo », marque, nom, prix, prix de référence barré, « Jusqu'à -35 % », livraison.
- Décision : pastille « Combinaisons disponibles » seulement si le marchand publie couleurs/tailles. « Jusqu'à -35 % » et « Promo » seulement si le serveur fournit la donnée.
- État : **réécrit selon le visuel** (`LensResultCard.tsx`, grille à deux colonnes) — à tester sur appareil. Ancien état : pastille « Combinaisons disponibles » (`dc87122`); pastille **Promo**, **-N %** et prix barré uniquement si le serveur envoie `candidate.promo` / `originalPriceTnd` (`src/features/lens/lensCardState.ts`, `LensResultCard.tsx`). Cœur d'ajout aux favoris du compte, grille à deux colonnes. Tests : `tests/lens-card-state.test.ts`, `tests/lens-promo.test.ts`. Le bouton « Jusqu'à -35 % » de la maquette n'est pas reproduit en dur : seul le pourcentage du serveur s'affiche.

## 4. OCEREX — prix en direct
- Montre : cadre sur l'étiquette, consigne, onglets **Prendre une photo / Importer une image**, vignettes, déclencheur, bouton OCEREX.
- Décision : prix en DT uniquement (`referenceTnd`, converti par le serveur).
- État : **partiel** — cadre, consigne, déclencheur, vignettes, onglets (`dc87122`), prix en DT. Bouton OCEREX de la maquette : non reproduit.

## 5. Lens — QR / lien / code
- Montre : cadre de scan, « Code QR détecté » (coche verte), onglet « Lien / code ».
- Décision : le QR se lit sur le téléphone ; le sens (lien, code-barres, texte) vient du serveur.
- État : **partiel** — onglet « Lien / code » et lecteur existants (`de35927`). Retour visuel « Code QR détecté » : non fait.

## Reste à faire
0. Comparaison visuelle sur téléphone avec 01, 02, 03 : non vérifiée tant que l'APK n'a pas été testé.
1. Test sur appareil de la feuille de progression (flux XHR) — section 2.
2. Vérifier sur appareil la carte avec et sans promo (section 3). La pastille Promo et le prix barré sont testés côté données, pas à l'écran.
3. La fiche QR/URL (`app/lens/scan.tsx`, `analyzeLensUrl`) n'envoie pas de `promo` dans son contrat : aucune pastille n'y est affichée.
4. Retour visuel QR et bouton OCEREX (sections 4 et 5).
