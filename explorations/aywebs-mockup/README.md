# Maquettes AYWEBs

Deux laboratoires, une seule chaîne de build.

| Fichier livré | Contenu | Source |
| --- | --- | --- |
| `explorations/AYWEBS_OFFICIEL_LAB.html` | **commande Issam** : wordmark violet + panier, recherche de boutiques, Catégories, Historique, Explorer, écran Boutiques — 3 variantes | `officiel.source.html` |
| `explorations/AYWEBS_HOME_LAB.html` | exploration A/B/C/D (épuré, marque, éditorial, flux vivant) | `lab.source.html` |

```bash
node explorations/aywebs-mockup/build.js --source officiel.source.html \
                                          --out explorations/AYWEBS_OFFICIEL_LAB.html
node explorations/aywebs-mockup/build.js      # labo A/B/C/D
python3 explorations/aywebs-mockup/serve.py   # http://localhost:8080/officiel
```

## Labo « officiel » — la commande, section par section

1. **En-tête** 64 pt : wordmark AYWEBs **en violet officiel** (#571EF6) + icône panier avec pastille.
2. **Recherche de boutiques** 48 pt, rayon 12 — un seul champ, il ne cherche que des boutiques.
3. **Catégories** : titre 18/700 + « Tout voir » ; tuiles **116 pt** (écran 414), libellé 12/1,25 **sur deux lignes** — aucun texte coupé.
4. **Historique** : barre 56 pt avec la **dernière recherche** et son visuel devant, puis deux pastilles.
5. **Explorer les boutiques** : rail de **7 enseignes** en cartes 100 pt + ligne « Toutes les boutiques » (364).
6. **Écran Boutiques** : retour, recherche, **Favoris**, puis toutes les enseignes — **mêmes cartes**.

Les trois variantes ne diffèrent que sur le bloc Catégories : grille 3×2, rail, ou deux colonnes 174 pt.

## Jetons utilisés (aucune valeur inventée)

| | |
| --- | --- |
| Couleurs | `brand.json` : #571EF6 · #0A0A0A · #333 · #666 · #E5E5E5 · #FFF · #F2F2F2 |
| CTA d'achat | `COMMERCE.action` #FFD60A |
| Types | `tokens.generated` : 40 · 28 · 18 · 16 · 14 · 12 |
| Espacement | identité + `SPACE_EXTENDED` : 4 · 8 · 12 · 16 · 24 · 32 |
| Rayons | `RADIUS` : 4 · 8 · 12 · 16 · 24 · 999 |
| Icônes | `ICON_SIZE` : 14 · 18 · 24 · 32 |
| Chrome | `CHROME` : en-tête 64 · barre 56 |
| Polices | Zalando Sans · Noto Sans Arabic (sous-ensemblées dans le fichier livré) |

---

# Labo A/B/C/D (exploration précédente)

> **D · Flux vivant** est la seule direction qui ne parle pas de mise en page :
> elle montre la **technologie** — veille prix, preuves, frais détaillés,
> approbation d'achat. A, B et C restent des rangements du même annuaire.

## Les quatre directions

| | Question posée | Statut des briques |
| --- | --- | --- |
| **A · Épuré** | ranger sans refondre | prêt (UI seule) |
| **B · Marque** | assumer le violet | prêt (UI seule) |
| **C · Éditorial** | montrer plus sans scroller | prêt (UI seule) |
| **D · Flux vivant** | **décider** : quoi acheter, à quel prix réel | 3 briques serveur existent, 2 contrats à écrire |

Direction D s'appuie, dans le dépôt, sur : `src/ayrovix/services/priceWatch.ts`
(veille prix, 6 h, 50 par compte — **aucune API mobile**), `src/aywebs/evidence.ts`
(empreintes de lecture), `src/aywebs/variantQuotes.ts` (devis par valeur),
`src/services/pricing.ts` (douane, TVA, fret, marge de change),
`src/services/fxRates.ts` (taux live + bandes de sanité),
`src/aywebs/checkoutFees.ts` (payable = somme des lignes, par assertion).

Laboratoire de **design**, pas du code applicatif : rien ici n'est importé par
l'app. Il sert à trancher une direction avant d'écrire du React Native.

| Fichier | Rôle |
| --- | --- |
| `../../explorations/AYWEBS_HOME_LAB.html` | **la maquette livrée** — fichier unique, autonome, à ouvrir ou envoyer tel quel |
| `lab.source.html` | la source (photos et polices par leurs chemins relatifs) |
| `build.js` | fabrique la maquette livrée depuis la source |
| `serve.py` | sert le dépôt pour itérer : `/` → maquette, `/source` → source |
| `aywebs-wordmark-trim.png` | wordmark recadré, **version palette** (13 Ko au lieu de 49 Ko, même rendu à 1,3 % près) |

## Pourquoi un build

Deux défauts constatés sur la première version, tous deux bloquants pour une
relecture à distance :

1. **La page apparaissait vide** dans un visualiseur qui n'exécute pas les
   scripts : les trois téléphones étaient construits à l'exécution. Le rendu
   initial (français, avec dernière visite) est donc **imprimé dans le HTML** ;
   le script ne sert plus qu'à changer de langue et à sélectionner une catégorie.
2. **Les images et les polices ne suivaient pas le fichier** : elles vivaient
   dans l'arborescence du dépôt. Elles sont maintenant encodées en `data:` —
   aucune requête, aucun 404 silencieux, aucun serveur nécessaire.

Les polices sont **sous-ensemblées** (latin + arabe, features OpenType
conservées) : cinq TTF complets pèsent 730 Ko, le fichier livré en fait 550 Ko
au total.

## Regénérer

```bash
node explorations/aywebs-mockup/build.js      # nécessite fontTools pour les polices
```

```bash
pip install fonttools        # une seule fois, pour le sous-ensemble des polices
python3 explorations/aywebs-mockup/serve.py  # http://localhost:8080
```

## Ce que la maquette corrige (capture du 27/10/2026)

- **Wordmark sur plaque grise** `#E5E5E5` — c'était `AppImage` qui imposait
  `backgroundColor: theme.colors.line`. Ici : rendu sur fond net.
- **23 catégories sur 30 derrière la même icône « étiquette »** — ici, une
  correspondance par `category.id`, et un jeu d'icônes couvrant les familles.
- **« Maison & mobilier » servait la photo du casque** — la regex `audio`
  contenait `son`, qui matche « ma‑i‑**son** ».
- **Grille** : les six familles les plus fournies du registre (comptage sur les
  364 boutiques) — `electronics 21 · fashion 20 · home 20 · shoes 19 ·
  beauty 19 · kitchen 15` — soit cinq visuels sur six.
- **Contraste du champ** : 5,7:1 au lieu de 3,8:1.

Les logos de boutique sont des **placeholders typographiques** : dans l'app ils
viennent de l'API (`mediaUrl(store.logo)`), rendus par `AppImage` en `contain`.

## Bascule dans la maquette

- **FR / العربية** — direction RTL, chevrons inversés, libellés longs.
- **Avec / sans dernière visite** — sans visite, la carte de reprise doit
  disparaître (aujourd'hui elle affiche un message vide).
- **Clic sur une catégorie** — état sélectionné, identique dans les trois
  directions.

---

# Mocakup « officiel » rendu en CODE (27/10/2026)

`render_officiel.py` dessine la maquette avec les vraies fondations du dépôt —
une image générée invente ses tailles ; ce script ne le peut pas.

| Élément | Source réelle |
| --- | --- |
| Polices | `apps/mobile/assets/fonts/ZalandoSans-{Regular,SemiBold,Bold}.ttf` |
| Couleurs | `brand.json` : #571EF6 · #0A0A0A · #333 · #666 · #E5E5E5 · #FFF · #F2F2F2 |
| CTA d'achat | `COMMERCE.action` #FFD60A (`tokens.mobile.ts`) |
| Échelle de types | 12 · 13 · 14 · 15 · 16 · 22 · 26 |
| Espacement | 4 · 8 · 12 · 16 · 24 · 32 · 48 |
| Rayons | 8 · 12 · 16 · 24 · 999 |
| Icônes | tracés de l'app, trait 1,9 (panier, cœur, loupe, chevron, grille, horloge…) |
| Logo | `aywebs-wordmark-violet.png` — le wordmark de l'app, reteinté #571EF6 |
| Photos | `assets/aywebs/category-*.jpg` et `assets/hero/*.jpg` de l'app |

```bash
python3 explorations/aywebs-mockup/render_officiel.py     # nécessite Pillow
```

Produit :

| Fichier | Contenu |
| --- | --- |
| `img/officiel-01-accueil.png` | page longue : en-tête + recherche, **Catégories 2×3**, **Sponsorisé**, **Boutiques 2×2**, entrée liste |
| `img/officiel-02-boutiques.png` | écran Boutiques : retour, recherche, Favoris, grille 2 colonnes |
| `img/officiel-03-recherche.png` | recherche active : champ violet, chips, résultats + prix TND, CTA jaune |
| `img/officiel-set.png` | planche de comparaison des trois |

---

## État : maquette → code

Les trois sections de l'accueil sont **implémentées** dans l'application :

| Écran de la planche | Code | État |
| --- | --- | --- |
| Accueil (3 sections) | `apps/mobile/src/features/aywebs/AyWebsHomeContent.tsx` | ✅ livré |
| En-tête (mot-symbole + cœur + panier) | `apps/mobile/src/features/shell/AppHeader.tsx` | ✅ livré |
| Boutiques (`/aywebs/stores`) | `apps/mobile/src/features/aywebs/StoresContent.tsx` | ✅ livré — grandes cartes 3:4, **logo entier** (`contain` + 24 pt de réserve) |
| Recherche produits | — | ⏳ n'existe pas encore dans l'app |

Ce que le code emprunte, sans exception :

| Pièce | Fondation utilisée |
| --- | --- |
| Titres de section | `theme.text('lead')` — 18 pt, graisse `bold` |
| Libellés de carte | `theme.text('label')` — 14 pt, `bold`, **sous** l'image |
| Carte catégorie | `width: 48 %`, `aspectRatio: 1`, `theme.radius.card` (16) |
| Carte boutique | `width: 48 %`, `aspectRatio: MEDIA_RATIO.storeCard` (3:4), logo `contain`, réserve 24 |
| Espacement | `theme.space` — 32 entre sections, 12 dans une grille |
| Recherche | pastille 48 pt, `borderRadius: 999`, filet `theme.colors.line` |
| Cœur sur la carte | pastille 36 pt `theme.colors.surface` — même motif que `LinkedProductCard` |
| Bouton du bloc sponsorisé | `<Button tone="quiet" block>` — contour 2 pt, rayon 999 |
| Icônes | Ionicons, tailles 14 · 16 · 18 · 20 (grille 24) |
| Couleurs | `theme.colors` uniquement — aucun hexadécimal dans l'écran |

Vérifications passées : `tsc --noEmit`, `vitest run` (1 001 tests), `jest` (142 tests UI).

### Le logo d'une boutique n'est jamais rogné

Règle tenue à un seul endroit (`MEDIA_RATIO.storeCard` + styles de carte) :

  • le visuel de la carte est une **plaque** `theme.colors.shimmer`, pas une photo
    détournée : une boutique n'a pas de photo de produit, elle a un logo ;
  • le logo est posé en `contentFit="contain"` avec **24 pt de réserve** sur les
    quatre côtés — il garde ses proportions, ne touche jamais le bord ;
  • le cœur est une pastille posée sur la plaque, donc lisible sur tout logo ;
  • même gabarit sur l'accueil (§3) et sur la page Boutiques : une boutique ne
    change pas de silhouette d'un écran à l'autre.

Vérifié par `tests/ui/storesScreen.ui.test.tsx` (ratio, réserve, `contentFit`)
et `tests/ui/aywebsTab.ui.test.tsx` (même gabarit côté accueil).

---

## 27/10/2026 — feuilles « Sélectionnez votre article » et « Article ajouté »

Deux écrans de plus dans la planche (`officiel-04-options.png`,
`officiel-05-ajout.png`, réunis dans `officiel-sheets.png`) et, surtout, cinq
défauts corrigés dans le code — pas seulement dans l'image.

| Défaut constaté (captures du client) | Cause | Correction |
| --- | --- | --- |
| « Prix en dinars calculé à l'ajout. » en 28 pt sur trois lignes, qui passait sous le pied de la feuille | la phrase entière était rendue avec `variant="title"` | prix en `lead` dans la carte, **une ligne discrète** (`aywebs.priceAtAddShort`) dans le pied ; la phrase longue est supprimée des dictionnaires |
| Le prix ne revenait jamais après un changement de couleur/taille (« la feuille reste en calcul prix ») | la re-demande de devis était réservée aux feuilles `local` | la re-demande s'applique aussi aux feuilles serveur (requête exacte du web, sans capture), avec la même protection contre les réponses périmées |
| Pastilles de couleur = cadre gris + icône « image cassée », 17 fois | on n'affichait que l'image du marchand, sans repli | chaîne de replis : photo de la couleur → **couleur nommée** (`optionColour.ts`) → pastille neutre avec l'initiale |
| Le libellé se décalait quand la valeur était choisie (« Black ✓ ») | la coche était dans la ligne du texte | coche **posée sur la pastille** ; libellé sur largeur fixe, centré, deux lignes |
| Bandeau vert vide dans « Article ajouté » | aucun texte n'était rendu | « Ajouté au panier » + variante + quantité, `accessibilityLiveRegion` |

Ce qui n'a **pas** changé : le prix en dinars vient toujours du serveur (aucun
calcul local), et l'ajout reste refusé quand le serveur ne peut pas publier de
devis — l'écran le dit maintenant sans hurler.

## Comparatif de tailles (`comparer.py`)

Le client a demandé une comparaison chiffrée entre la grille **actuelle** et la
grille de sa **référence**. `comparer.py` la dessine à l'échelle 1:1 sur 390 pt
et cote tout :

| | A. aujourd'hui | B. réserve retirée | C. référence client |
| --- | --- | --- | --- |
| Colonnes | 2 | 2 | 3 |
| Carte | 176 × 176 | 176 × 176 | 119 × 136 |
| Photo dans la carte | 128 pt · 61 % | 172 pt · 100 % | 117 pt · 100 % |
| Boutiques par rangée | 2 | 2 | 3 |
| Visibles d'un coup | 4 | 4 | 9 |

Mesures de C, prises sur l'image fournie (1024 px) puis ramenées à 390 pt :
marge **37 px → 14,1 pt**, gouttière **19 px → 7,2 pt**, tuile **305 × 347 px
→ 116 × 132 pt** (ratio 0,879 ≈ **7:8**). Le code ne peut pas poser 7,2 : il
utilise marge 12 et gouttière 8, d'où 116,7 pt au lieu de 116,2 — un demi-point.

```bash
python3 explorations/aywebs-mockup/comparer.py   # → img/comparatif-tailles.png
```
