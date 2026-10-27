# Maquette AYWEBs — accueil (4 directions)

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
