# Audit de design — application entière (27/10/2026)

> Demande : « تعملي مراجعة لتطبيق كامل وتتفقد خطوط، تباعد، دزاين، أيقونات وتشوف كل شبر
> وين يكمن اختلاف وتصلح كل » — un audit de TOUTE l'application, pas d'un écran.
>
> Méthode : inventaire **mesuré** sur `app/**` + `src/**` (métriques par expression
> régulière, commentaires exclus), puis correction pièce par pièce, puis verrou.

## 1. Ce que l'inventaire a trouvé

| Famille | Littéraux avant | Valeurs distinctes | Ce que ça disait |
|---|---:|---|---|
| Tailles de texte | **9** | 11, 15, 16, 17, 19 | 4 hors échelle de 6 crans |
| Interlignes | **9** | 17, 18, 19, 20, 23, 24 | ratio 1.13 (fiche) → 1.53 (Lens) pour le même corps |
| Interlettrages | **4** | 1, 1, 2, −0.1 | l'identité impose `0em` |
| Graisses numériques | **1** | `'600'` | ignoré en silence par Android |
| Rayons | **46** | 2 → 999 (18 valeurs) | `RADIUS` existe de xs à full |
| Tailles d'icônes | **80** | 19 valeurs (11 → 64) | 5 crans existaient, 15 valeurs vivaient |
| Opacités d'état | **31** | 0.35 · 0.36 · 0.4 · 0.45 · 0.5 · 0.55 · 0.6 · 0.64 · 0.7 · 0.72 · 0.78 · 0.85 · 0.86 · 0.92 | le MÊME appui : 7 valeurs |

Contrôles déjà propres (aucune correction nécessaire) : couleurs, voiles, espacements,
`position: absolute`, fonds gris, pastilles d'icône, marge basse d'écran.

## 2. Typographie

Hiérarchie unique dans l'application : **marque < titre**, la marque étant une
qualification du produit, pas son nom.

| Fichier | Avant | Après (jeton) | Raison |
|---|---|---|---|
| `src/features/lens/LensProductView.tsx` | marque 19 / interligne 24 | `AppText variant="label"` → 14 / 21 | 19 n'existe dans aucun cran ; la marque dépassait le titre |
| idem | titre 17 / 23 | `variant="lead"` → 18 / 25 | 17 est une valeur isolée |
| idem | description 15 / 23 | `variant="body"` → 16 / 22 | 15→16 : le corps de texte de l'app |
| idem | accordéon `fontSize: 16` | (style supprimé) | redondant avec `body` |
| idem | `merchantValue: { fontWeight: '600' }` | (style mort supprimé) | graisse numérique sans effet + jamais utilisée |
| `src/features/lens/LensResultCard.tsx` | marque 15 / 19 | `variant="caption"` → 12 / 17 | même hiérarchie que la fiche |
| idem | titre 14 / 18, `minHeight: 36` | `variant="label"` → 14 / 20, `minHeight: 42` | 2 lignes mesurées sur l'interligne réel |
| `app/(tabs)/_layout.tsx` | libellé d'onglet 11 | `theme.text('caption')` → 12 | le style posait déjà caption **puis** l'écrasait |
| `src/features/aywebs/AyWebsHomeContent.tsx` | champ 16, **aucune famille** | `theme.text('body')` | le texte saisi s'affichait dans la police système |
| `src/features/aywebs/StoresContent.tsx` | idem | idem | idem |
| `src/features/social/Comments.tsx` | champ, **aucune famille** | `theme.text('body')` | idem, sur le champ de commentaire |
| `src/design/BrandMark.tsx` · `Footer.tsx` · `ProductFiche.tsx` · `LinkedProductCard.tsx` | interlettrages 1 / 2 / 1 / −0.1 | supprimés | `TYPOGRAPHY.letterSpacing = "0em"` |

## 3. Rayons

`RADIUS` (xs 4 · sm 8 · md 12 · lg 16 · xl 24 · full 999) remplace **32** littéraux.
Les **14** numériques restants sont une **relation géométrique**, pas un choix :
cercle parfait (rayon = moitié de la cote) ou poignée de feuille (rayon ≈ moitié de
la hauteur). Un seul `0` : la carte Reel plein cadre, qui n'a pas de rayon.

| Avant | Après | Exemple |
|---|---|---|
| 999 | `RADIUS.full` | pastilles (« Toutes les boutiques », filtres, pied de page) |
| 18 | `RADIUS.lg` (16) | encart caméra, astuce, tuile boutique |
| 14 | `RADIUS.lg` (16) | carte « résultat de scan » |
| 12 | `RADIUS.md` | champ, héros d'article, compteur |
| 8 | `RADIUS.sm` | vignette 92 × 64 |
| 28 / 24 | `RADIUS.full` | sélecteur de mode caméra : deux pastilles concentriques, comme le sélecteur AYWEBs |
| 10 | `RADIUS.full` | badge 20 × 20 (= cercle) |
| 2 / 3 / 4 / 9 / 19 / 21 / 26 / 34 / 36 | inchangés | moitié exacte d'une cote écrite dans le même bloc |

## 4. Icônes

Échelle unique `theme.iconSize` — **121 icônes, 0 littéral** :

| Cran | Valeur | Rôle (et rien d'autre) |
|---|---:|---|
| `xs` | 14 | l'icône vit dans une ligne de texte (étoile de note, infobulle, coche) |
| `sm` | 18 | l'icône vit dans un contrôle (champ, chevron de ligne, croix de champ) |
| `md` | 24 | l'icône EST l'action (retour, croix d'en-tête, panier, cœur, menu, onglet) |
| `lg` | 32 | état vide, action forte dans une pastille (coche de confirmation 52) |
| `xl` | 40 | l'icône remplace une image (avatar, affiche Reel) |
| `xxl` | 64 | giciel de substitution plein écran (viseur indisponible) |

Corrigé : retour **23 / 26 / 30 / 32 → 24** (les trois visionneuses plein écran
disaient 26, 26 et 32) ; croix **16 / 26 → 24** ; cœur **20 / 21 / 22 / 26 → 18** sur
carte et **24** en superposition ; étoile **13 / 17 → 14** ; note des cartes **21 → 18** ;
lecture **36 / 44 → 32 / 40**. Dans l'en-tête de la caméra, la flèche de retour était en
32 à côté d'une torche et d'un ⋮ en 24 : **une seule rangée, une seule taille**.

Famille de glyphes — 4 icônes de contenu étaient **pleines** (le défaut) :

| Fichier | Avant | Après |
|---|---|---|
| `app/lens.tsx` | `name="search"` | `search-outline` |
| `app/lens.tsx` | `name="ellipsis-vertical"` | `ellipsis-vertical-outline` |
| `src/features/aywebs/AddToCartSheet.tsx` | `name="add"` / `name="remove"` | `add-outline` / `remove-outline` |

Les glyphes pleins qui RESTENT sont des **états** : coche, croix, étoile de note,
lecture, cœur actif, torche, chevrons directionnels. La liste est explicite dans le
verrou, avec sa raison — pas une dérogation implicite.

## 5. Opacités d'état

`OPACITY` gagne `dimmed` (0.86), `unavailable` (0.36) et `favorite` (0.75) ;
`subtle` (0.64) devient le retour tactile **unique**. `disabled` (0.4) devient le
seul niveau « désactivé » — il était écrit 0.45, 0.5 et 0.6 selon l'écran.

| État | Avant | Après |
|---|---|---|
| appui | 0.55 · 0.6 · 0.64 · 0.7 | `subtle` 0.64 |
| appui sur grande surface | 0.85 · 0.86 · 0.92 | `dimmed` 0.86 |
| désactivé | 0.4 · 0.45 · 0.5 · 0.6 | `disabled` 0.4 |
| option indisponible | 0.35 · 0.36 | `unavailable` 0.36 |
| favori posé sur image | 0.72 · 0.78 | `favorite` 0.75 |

## 6. Les seules exceptions, nommées et gelées

1. **Fiche produit** (`src/features/product/fiche.ts`) — cotes mesurées sur la maquette
   720 × 1600 px validée le 25/10/2026 (corps 15 / 17 / 19 / 20 / 22). Elles ne bougent
   pas, et **un test les gèle** : impossible d'ajouter une sixième taille sans le dire.
2. **Carte article** (`src/design/articleCard.ts` + `LinkedProductCard.tsx`) — cotes
   comparées à `shared/articleCard.ts` **et** à la maquette CSS par
   `tests/article-card-contract.test.ts`. Ses trois interlignes littéraux sont donc
   autorisés, et seulement les siens.
3. **Cercles et poignées** — un rayon qui vaut la moitié d'une cote du même bloc n'est
   pas une valeur arbitraire, c'est une figure. Le verrou le **recalcule**.

## 7. Les verrous ajoutés

`apps/mobile/tests/design-system.test.ts` — 7 nouveaux tests, chacun vérifié par une
violation volontaire avant d'être validé :

- aucune graisse numérique ;
- aucune taille de texte littérale ;
- aucun interligne littéral (sauf carte article) ;
- aucun interlettrage local ;
- aucun rayon littéral hors cercle/poignée (relation recalculée) ;
- aucune taille d'icône littérale ;
- les icônes de contenu sont en `-outline` (liste d'états explicite, noms lus dans la
  palette de glyphes d'Ionicons) ;
- aucune opacité d'état littérale ;
- les cotes typographiques de la fiche sont gelées.

## 8. Portes

`tsc --noEmit` propre · vitest **93 fichiers / 1023 tests** · jest **25 suites / 151 tests**.
