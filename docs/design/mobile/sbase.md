# S Base — recherche marchande via SandBase

**Date** : 19/11/2026 · **Portée** : application mobile (`apps/mobile`) + API serveur (`src/sbase`)
**Statut** : livré en v1 (recherche par mots-clés, 7 boutiques)

---

## 1. Ce que c'est

Un **nouveau point d'entrée** dans la barre du bas : `S Base`. Le client y trouve
les boutiques réellement couvertes par l'API SandBase (AliExpress, Amazon, eBay,
Google Shopping, Bing Shopping, Taobao, 1688), il en choisit **une**, et la
recherche part **sur cette boutique uniquement**, en direct.

Résultats affichés, tels que la source les donne : titre, image, prix **avec sa
devise**, boutique/vendeur, note, livraison, lien produit d'origine — plus le
**temps de réponse mesuré** et la liste des **champs que la source n'a pas
fournis**.

## 2. Ce que ce n'est pas (et ne deviendra pas sans décision explicite)

| Interdit | Pourquoi |
|---|---|
| Un moteur de recherche unifié multi-plateformes | Le brief exige des APIs testées **indépendamment**. Chaque boutique = un endpoint, un appel, une mesure. |
| Une extension d'AYWEBs | Aucune ligne de `src/sbase` n'importe `src/aywebs` ; le produit n'entre ni dans le panier ni dans le prix TND. Un test le vérifie (`tests/sbase.test.ts`). |
| Une extension de Z Lens | Aucun appel à `/api/zayrovix`, aucune modification de la caméra, des quotas ou de la pipeline Lens. |
| Des résultats de démonstration | Sans `SANDBASE_API_KEY`, l'API répond `503 SANDBASE_NOT_CONFIGURED` et l'écran l'affiche. Aucun produit inventé, aucun prix estimé. |

## 3. Matrice de capacités — ce qui est vrai aujourd'hui

Toutes les sources v1 sont **recherche par mots-clés**. La matrice est donc
volontairement pauvre, et c'est le contrat :

| Capacité | v1 | Détail |
|---|---|---|
| Mots-clés | ✅ | les 7 boutiques |
| Prix + devise | ✅ | prix de la source, jamais converti |
| Image / URL / Détails / Variantes / Code-barres | ❌ | nécessitent un autre endpoint (product detail) ou n'existent pas chez SandBase |

`supports` (dans `src/sbase/descriptors.ts`) est la **seule** source de vérité de
l'UI : `supportedCapabilities()` filtre les chips, donc une capacité non fournie
ne peut pas apparaître par accident. Une modification de la matrice se fait dans
le descripteur, jamais dans l'écran.

## 4. Architecture

```
app/(tabs)/sbase.tsx          → hub (grille des boutiques)
app/sbase/[merchant].tsx      → recherche sur UNE boutique
src/features/sbase/           → écrans + logique pure (durée, prix, chips)
src/api/sbase.ts              → client mobile (via notre serveur)

src/sbase/descriptors.ts      → 1 ligne = 1 boutique (endpoint, prix, capacités, marchés, corps)
src/sbase/client.ts           → POST SandBase + polling `/v1/run/{id}`, mesure du temps
src/sbase/extract.ts          → extraction défensive (schémas connus puis parcours profond)
src/sbase/routes.ts           → GET /api/sbase/sources · POST /api/sbase/search · GET /health
```

### Ajouter une boutique (sans reconstruire)

1. une entrée dans `SBASE_SOURCES` (endpoint documenté, `costUsd`, `supports`,
   `autonomous` , `arrays`, `buildBody`) ;
2. rien d'autre : le hub, l'écran de recherche, les routes et les tests de contrat
   prennent la nouvelle entrée telle quelle. Si le payload est exotique, le
   parcours profond de `extract.ts` suffit la plupart du temps.

## 5. Comportements observables

| Situation | Ce que voit le client |
|---|---|
| Clé serveur absente | Bandeau « S Base n'est pas encore activé » + badge `Non configuré` sur chaque boutique |
| Recherche en cours | Bouton « Recherche en cours… 1,2 s » (chrono vivant) |
| Résultats | Liste + « Temps de réponse · 812 ms · coût du test 0,014 $ » |
| Aucun résultat | « Aucun résultat pour « … » » (pas une erreur) |
| Erreur SandBase | Carte d'erreur avec le **code** (`SANDBASE_TIMEOUT`, `SANDBASE_UNAUTHORIZED`…) + Réessayer |
| Champ manquant | Chips « Image », « Boutique »… sous le compteur |
| Même recherche < 10 min | Même résultat, mention « déjà interrogé », temps d'origine affiché |

Détails : les prix passent par `formatItemPrice()` — le **texte de la source**
est repris tel quel quand il existe (ex. `89,99 €`), sinon `montant + devise`.
Rien n'est recalculé, rien n'est converti.

## 6. Coût et garde-fous

- Chaque appel est facturé par SandBase (≈ 0,0143–0,0278 $ ; `1688` non publié).
- Cache mémoire 10 min par `(boutique, marché, requête)` : une répétition ne
  repart pas en facturation, et le temps affiché reste celui du vrai appel.
- Limite dédiée : **30 recherches / 10 min** par utilisateur (ou IP), séparée du
  quota Z Lens (12/10 min, 40 images/jour).
- La clé vit **uniquement** dans `SANDBASE_API_KEY` côté serveur. Aucune valeur,
  même tronquée, n'est renvoyée au client.

## 7. Navigation — le changement d'onglet

La barre du bas était : `Accueil · Lens · Clean · AYWEBs · Cartes cadeaux · Profil`.
Elle est devenue : `Accueil · Lens · Clean · AYWEBs · S Base · Profil`.

`Cartes cadeaux` n'est pas supprimée : la route `/(tabs)/gift-cards` reste
déclarée (`href: null`) pour les liens directs, et l'écran gagne le bandeau
demandé **sous son hero** — `Boutique | Mes cartes` — qui remplace l'ancien
bouton « Mes cartes cadeaux ». Le portefeuille reste également joignable depuis
le hub Profil (`/account/gift-cards`).

## 8. Dette assumée (v1)

- Pas de page de détails produit : chaque résultat ouvre le **lien d'origine**
  dans le navigateur. Un endpoint `product` par boutique est la prochaine étape
  (et doit alors être exposé comme une capacité, pas comme un enrichissement
  silencieux).
- Pas de pagination : la première page suffit à l'usage « vérifier une source ».
- `1688` et `Taobao` sont en chinois : leurs libellés de champs restent ceux de
  la source, sans traduction inventée.
