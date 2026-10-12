# AYROVIX Lens — maquettes approuvées (application React Native)

Document de référence (dans le dépôt pour ne pas être perdu). Chaque section : ce que montre la maquette, la décision, et l'état réel dans `apps/mobile`.
Les maquettes sont des visuels de référence : la mise en œuvre suit les **données réelles** du serveur (aucun prix, promo ou pourcentage inventé).

## 1. Lens — caméra (ouverture directe)
- Montre : caméra plein écran, barre du haut (retour, « AYROVIX Lens », flash, aide), indication « Cadrez le produit, puis prenez la photo. », sélecteur **Scan en direct / Photo / Lien / code**, vignette galerie, déclencheur, bouton OCEREX rond.
- Décision : ouvrir l'onglet Lens = la caméra tout de suite (plus de page intermédiaire). La caméra ne tourne que quand l'onglet est affiché. Le résultat monte en panneau sous l'aperçu.
- État : **fait, à tester sur appareil** — `app/(tabs)/lens.tsx` (`expo-camera`). Sans accès caméra : cause expliquée + bouton « Demander l'autorisation » (demandé une fois à l'ouverture) + galerie. « Scan en direct » ouvre le lecteur QR (`/lens/scan`). « Lien / code » ouvre la saisie dans le panneau.

## 2. Lens — résultats en cours (feuille de progression)
- Montre : feuille « Résultats Lens », étapes « Image lue ✓ / Recherche des boutiques ⟳ / Lecture des fiches produit », emplacements gris, « Réessayer » et « Annuler ».
- Décision : étapes et fiches viennent du serveur (flux SSE de `/api/ayrovix/analyze-image`, en-tête `Accept: text/event-stream` : `progress`, `card`, `done`, `error`). Rien n'est simulé.
- État : **fait, à tester sur appareil** — client de flux `src/api/lensStream.ts` (XHR, car `fetch` ne livre pas le flux sous React Native), feuille `src/features/lens/LensProgressSheet.tsx`, annulation, « Réessayer » après échec. Tests : `tests/lens-stream.test.ts`. Le flux XHR n'a pas été vérifié sur un vrai téléphone.

## 3. Carte produit (résultats)
- Montre : image, pastille « Combinaisons disponibles », « Promo », marque, nom, prix, prix de référence barré, « Jusqu'à -35 % », livraison.
- Décision : pastille « Combinaisons disponibles » seulement si le marchand publie couleurs/tailles. « Jusqu'à -35 % » et « Promo » seulement si le serveur fournit la donnée.
- État : **partiel** — pastille sous la photo (`dc87122`). « Promo », prix barré et « Jusqu'à -35 % » : non faits.

## 4. OCEREX — prix en direct
- Montre : cadre sur l'étiquette, consigne, onglets **Prendre une photo / Importer une image**, vignettes, déclencheur, bouton OCEREX.
- Décision : prix en DT uniquement (`referenceTnd`, converti par le serveur).
- État : **partiel** — cadre, consigne, déclencheur, vignettes, onglets (`dc87122`), prix en DT. Bouton OCEREX de la maquette : non reproduit.

## 5. Lens — QR / lien / code
- Montre : cadre de scan, « Code QR détecté » (coche verte), onglet « Lien / code ».
- Décision : le QR se lit sur le téléphone ; le sens (lien, code-barres, texte) vient du serveur.
- État : **partiel** — onglet « Lien / code » et lecteur existants (`de35927`). Retour visuel « Code QR détecté » : non fait.

## Reste à faire
1. Test sur appareil de la feuille de progression (flux XHR) — section 2.
2. Prix barré et « Promo » sur la carte (section 3), si le serveur fournit les données.
3. Retour visuel QR et bouton OCEREX (sections 4 et 5).

## Journal de validation
- Lens : caméra à l'ouverture de l'onglet (commit `ecb5e7f`). Vérifications locales : typecheck OK, vitest 512/512, test:ui 67/67, tokens:check OK. Le build APK de `ecb5e7f` a été annulé par la concurrence du workflow ; relancé par un commit de suivi.
