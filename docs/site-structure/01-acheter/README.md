# Espace 01 — ACHETER : revue du 2026-09-22

Intention de l'espace : **le parcours qui mène au panier, et pas un clic de plus.**
Règle de revue appliquée telle quelle : un seul chemin par intention · rien qui ne serve · la même
règle en FR et en AR · mesuré, pas supposé (390 px et 1360 px, 0 erreur, 0 débordement).

---

## 1. Ce qui était cassé (mesuré avant toute modification)

| # | Constat mesuré | Preuve | Effet réel |
| --- | --- | --- | --- |
| **D1** | L'entrée **« Tous les produits »** du menu ne menait à rien. | clic → `scrollY 0`, page inchangée, 0 carte produit | Le seul chemin vers le catalogue était mort. |
| **D2** | Aucune surface produit à l'accueil : 1 produit servi par l'API, 0 carte affichée. | `/api/public/home` → `products: 1` ; `[data-product-id]` = 0 | Un visiteur ne pouvait atteindre aucun produit. |
| **D3** | **Aucune entrée panier.** `Navbar` recevait `onOpenCart` et `cartCount`… et ne les rendait jamais. | en-tête : `[Menu] [AYROVI] [Mon espace]` uniquement | Le panier n'était joignable que par le menu, en trois niveaux. |
| **D4** | En arabe, les onglets publics et une partie du chrome restaient en **français**. | menu AR : `Arrivage, Gift & Cards, Magazine` | Un visiteur arabophone lisait une interface à moitié française. |

Cause de D1, trouvée dans le code : `pageDefinitions` ne déclarait que
`['arrivals','promotions','stories','news']`, alors que le rendu de la page `products` **existait
déjà** (`if (page === 'products')`). Le contenu était écrit, la page n'était pas déclarée : le clic
naviguait vers une vue que personne ne rendait.

## 2. Ce qui a été corrigé

1. **Le catalogue est une page réelle** (`PublicCmsSections.tsx`) : `products` déclaré, avec accroche
   et description FR/AR (« Le catalogue AYROVI » / « كتالوج AYROVI »), en **première** position de la
   page — le chiffre avant le récit. L'entrée du menu ouvre désormais la grille servie par l'API.
2. **Le catalogue mène à la commande** (`commerce/catalogProduct.ts` + `App.tsx`) : la carte produit
   expose une action unique « Commander » / « اطلب الآن » qui ouvre **le même tiroir de commande que
   LENS** (prix calculés par le serveur, quantité, livraison). Un seul tiroir, deux entrées :
   la recherche visuelle et le catalogue.
   *Convertisseur testé* : prix serveur recopiés tels quels, plateforme inconnue → `generic`,
   produit épuisé → action désactivée, champ manquant → 0 (jamais un montant inventé).
3. **L'en-tête porte l'entrée panier** (`Navbar.tsx`) : icône du jeu maison + compteur d'articles,
   nom accessible « Ouvrir mon panier » / « فتح سلّتي » (et le nombre d'articles annoncé aux lecteurs
   d'écran). Les props mortes `onOpenCart`/`cartCount` sont maintenant consommées.
4. **Le menu parle la langue du visiteur** (`MenuDrawer.tsx`) : les onglets publics utilisent le
   libellé arabe du contrat partagé quand la page est en arabe.

## 3. Preuves

| Contrôle | Résultat |
| --- | --- |
| `tests/space-acheter.test.tsx` | **7 gardes** : page déclarée, ordre d'initialisation, entrée panier, libellés AR, branchement du tiroir, conversion (2 cas) |
| Navigateur réel, 4 vues (fr/ar × 390/1360) | entrée panier nommée · onglets AR arabes · catalogue ouvert avec le produit réel · tiroir de commande ouvert avec prix et quantité · **0 erreur JS** · 0 débordement |
| Captures | `docs/site-structure/01-acheter/avant/` (constat) et `../apres/` (menu, catalogue, tiroir) |

## 4. Défauts restants de cet espace (mesurés, non maquillés)

| # | Constat | Mesure | Traitement prévu |
| --- | --- | --- | --- |
| **R1** | **Le tiroir de commande est monolingue.** `ProductDrawer.tsx` : **0** appel `tr()`, 16 textes français en dur. En arabe, « Continuer vers la livraison », « Nouvelle commande… », etc. restent français. | `grep -c "tr("` = 0 | Traduire le tiroir (FR/AR) — c'est le cœur de l'espace 01 : on ne fait pas payer un visiteur arabophone dans une langue qu'il n'a pas choisie. |
| **R2** | **Le contenu éditorial n'existe qu'en français** (accueil, hero, stories, arrivages, articles, produits). Le modèle CMS n'a pas de champs par langue → l'API ne peut pas servir d'arabe. | payload : `title`, `description`, `name`, sans variante `_ar` | Champs par langue côté Admin (`titleAr`, `descriptionAr`…) + repli sur le français si vide. Changement **structurel** (base + Admin + API) : à faire une fois, pour tout le site. |
| **R3** | **Recherche : uniquement visuelle.** `/api/public/products` accepte `limit` et `arrivalId`, pas de recherche texte. | pas de paramètre `q` | Ajouter `q` (nom + description) et exposer un champ de recherche dans l'en-tête — décision à prendre avec toi avant de toucher au chrome. |
| **R4** | `LensFeature.tsx` et `StoriesShowcase.tsx` : **0** appel `tr()`. | `grep -c "tr("` = 0 | À traiter dans l'espace 05 ASSISTER, où vit LENS. |

## 5. Décisions prises dans cette passe (à confirmer si tu veux l'inverse)

* **Le panier entre dans l'en-tête** (à droite, à côté du compte, compteur seulement s'il y a des
  articles). L'en-tête était volontairement minimaliste ; un magasin sans entrée panier casse le
  parcours. Retrait = une ligne si tu préfères l'en-tête à trois zones.
* **Le catalogue s'ouvre en premier** dans la liste des pages CMS : c'est l'espace qui vend.
* **Une seule action par carte produit** (« Commander ») : pas de second bouton « voir le produit »
  tant qu'il n'existe pas de fiche produit distincte.
