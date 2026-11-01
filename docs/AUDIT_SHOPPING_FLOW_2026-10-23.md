# Audit du parcours d'achat — Lens × navigueur AYWEBs × panier (23/10/2026)

> **Nature de ce document.** Phase 1 du cahier des charges « Unify Shopping Flow » :
> audit seul, **aucune ligne de code applicatif modifiée**. Chaque affirmation porte
> son fichier (et sa ligne quand elle est stable). Les conclusions qui contredisent
> le cahier des charges sont explicitées : un ordre qui décrit mal le code fait
> écrire du code inutile.

---

## 0. Verdict en une page

**Ce que l'ordre voit juste.**

- Il y a bien **deux paniers physiques** (`cart_items` côté ZAYROVI/Lens,
  `ayweb_carts` + `ayweb_cart_items` côté AYWEBs) et **deux checkouts**
  (`POST /api/checkout`, `POST /api/v1/aywebs/orders`).
- Les deux entrées (Lens, navigateur) **n'écrivent pas au même endroit** ; c'est
  la racine du sentiment « produits perdus quand on change d'écran ».
- La carte Lens est effectivement un **passage obligé** vers une fiche riche,
  alors que le bouton « Add to Cart » du navigateur est déjà l'entrée directe.
- L'ordre a raison d'exiger un audit avant toute ligne de code.

**Trois prémisses à corriger (vérifiées dans le code, pas supposées).**

1. **« Il faut construire une couche d'ajout unique »** — elle existe depuis le
   04/10/2026 : `src/aywebs/ayroviBridge.ts` est *déjà* « le SEUL chemin qui fait
   passer une ligne AYWEBs dans le panier ZAYROVI » (en-tête du fichier), et
   `POST /api/v1/aywebs/cart/items` **ponte automatiquement** chaque ajout
   (`src/aywebs/routes.ts:970-1000`). Le test `tests/aywebs-unified-cart.test.ts`
   verrouille : ajout → `ayrovi.linked = true` → ligne ZAYROVI au prix du moteur,
   sans doublon. **Le panier unifié existe ; c'est l'interface qui ne le dit pas.**
2. **« Le calcul du prix est dupliqué »** — non. Il y a **une seule équation** :
   `src/services/pricing.ts::calculatePrice`, appelée par le panier ZAYROVI
   (`src/api/routes.ts:215`) **et** par AYWEBs (`src/aywebs/cart.ts:380,494,1028`,
   `src/aywebs/productResolver.ts`, `src/aywebs/checkoutFees.ts`). Le risque réel
   n'est pas l'équation, c'est **la fraîcheur** : deux émissions de jeton
   (`src/ayrovix/routes.ts:110` pour Lens, `src/aywebs/ayroviBridge.ts:149` pour
   AYWEBs) et une version de règles qui peut bouger entre l'ajout et le pont.
3. **« Supprimer la grande fiche Lens »** — elle porte des fonctions qui n'ont pas
   d'équivalent ailleurs : galerie zoomable, guide des tailles
   (`LensSizeGuide`), compte à rebours de validité du devis
   (`earliestCartDeadline`), favoris, et surtout le **contrat de variante**
   `inspectVariantOrder` (`src/ayrovix/services/variantAvailability.ts:300`) qui
   est la seule porte d'ajout pour une boutique **sans** capture WebView.
   La supprimer telle quelle supprime l'ajout pour ces boutiques.

**Sept angles morts de l'ordre** (§6) — le plus important : il ne dit nulle part
**d'où vient la preuve** du prix et du stock. Or c'est notre contrainte la plus
dure (aucun prix deviné, aucune disponibilité inventée) et c'est exactement ce
que le client nous a reproché les 23/10.

**État au 23/10/2026 — ce qui est livré dans ce lot (branche `arena/`).**

| Lot | Contenu | État |
|---|---|---|
| **L3** | Carte Lens → navigateur AYWEBs à la page du produit (`lensOpenDecision`, `productEntryTarget`) ; fiche conservée pour la vente interne | **livré** |
| **L0 (vue)** | Le panier principal lit le panier AYWEBs, nomme les lignes non liées et propose de les relier ; après ajout, la feuille renvoie à `/cart` | **livré** |
| **L0 (rattrapage)** | Rattrapage en masse des lignes anciennes non liées | à faire (le bouton relie à la demande) |
| **L1** | Identité boutique unique (`storeKeyFor`) | à faire |
| **L2** | Clé d'idempotence sur `POST /api/cart/items` | à faire — le chemin externe passe désormais par AYWEBs, qui la porte déjà |
| **L4** | Écran de panier unique (fusion des deux écrans) | partiel : la vue est unifiée, les deux routes existent encore |

Deux constats d'exécution, utiles au lot suivant :
- `POST /api/checkout` **vide le panier dans la même transaction** qui crée la commande
  (`database.ts::createOrderFromCart` → `clearCart`), et `POST /aywebs/orders` revérifie
  avant de créer : un second appui tombe sur `EMPTY_CART` / `CART_EMPTY`. Ce n'est pas
  une clé d'idempotence, mais c'est un vrai garde-fou ; le trou restant est le **retry
  réseau** après une réponse perdue (le client reçoit une erreur alors que la commande
  existe — elle est visible dans l'historique).
- La boutique d'une ligne reste écrite dans trois vocabulaires (§4.5) ; tant que L1
  n'est pas fait, une même enseigne peut produire deux lignes distinctes — jamais une
  fusion silencieuse, ce qui est le comportement prudent.

**Ma recommandation.** Ne pas créer de troisième panier, ne pas enterrer la fiche
Lens : **faire du panier ZAYROVI la vérité de caisse, du panier AYWEBs l'antichambre
de preuve, et rendre le pont automatique et visible**. Lens devient une entrée
directe vers le navigateur (la carte ouvre la page marchande), la fiche riche
devient un **second chemin explicite** (« ajout rapide sans capture »), et les
deux écrans de panier affichent la même chose.

---

## 1. Méthode

Lecture du code, des routes HTTP et des tests existants. Aucune supposition :
quand un service est cherché, il est nommé avec son fichier. Aucun code modifié.

Points d'entrée lus : `apps/mobile/app/lens.tsx`, `apps/mobile/app/aywebs/browser.tsx`,
`apps/mobile/app/aywebs/cart.tsx`, `apps/mobile/app/(tabs)/cart.tsx`,
`apps/mobile/app/checkout.tsx`, `apps/mobile/src/features/lens/*`,
`apps/mobile/src/features/aywebs/*`, `apps/mobile/src/api/{cart,aywebs,lens,checkout}.ts`,
`src/api/routes.ts`, `src/aywebs/{routes,cart,orders,ayroviBridge,schema,productResolver}.ts`,
`src/services/{pricing,cartPriceTrust}.ts`, `src/ayrovix/{routes,priceQuote,services/*}`,
`src/db/database.ts`, et les suites de tests correspondantes.

---

## 2. Constat A — Lens (découverte → fiche → ajout)

**Recherche.** Trois entrées : texte, image (reconnaissance), URL/code-barre.
Le serveur interroge SerpApi `google_shopping` (`src/ayrovix/services/search.ts:269`)
puis, en secours, une recherche web IA (`aiCoreWebSearch`, même fichier). Les
candidats sont normalisés dans `shoppingCandidates` : `sourceUrl`, `price`,
`currency`, `availability`, `priceVerificationStatus: 'PENDING_MANUAL'`.
Une URL de redirection Google n'est pas retenue (`hasValidProductUrl`).

**Cartes.** `LensResultCard` / `LensResultsGrid`, données `LensCandidate`. La carte
porte le lien marchand (`sourceUrl`), l'image, le prix **source** et un prix TND
quand le serveur l'a calculé.

**Clic sur une carte.** `onOpen` → `openProduct` (`apps/mobile/app/lens.tsx:881`) :
**la fiche s'ouvre immédiatement**, puis la page marchande est relue en arrière-plan
(`analyzeUrl`) pour enrichir prix/stock/tailles. Autrement dit, le clic ne mène
**pas** au navigateur : il mène à une vue interne qui relit la page côté serveur.

**La fiche** (`LensProductView.tsx`, ~1 400 lignes) : galerie, description,
sélecteurs couleur/taille, guide des tailles, bloc prix avec compte à rebours de
validité du devis, favoris, compteur d'unités du panier, confirmation « ajouté ».

**Ajout au panier.** `submitOrder` → `buildCartPayload` (`productOrder.ts:143`) →
`addExternalToCart` (`api/cart.ts:260`) → `POST /api/cart/items`.
Le payload est refusé côté client si `orderBlock(selection)` non nul, si un choix
manque ou si l'offre n'a pas prix + devise + jeton signé (`completeOffer`).
Côté serveur, `POST /api/cart/items` (`src/api/routes.ts:203`) revalide tout :
URL publique, prix > 0, quantité 1..99, jeton `AYROVIX` valide, **et** la porte
de variante `inspectVariantOrder`.

**Ce que Lens ne fait pas.** Il n'ouvre pas la page marchande dans un WebView, ne
capture rien côté client, et n'utilise pas le panier AYWEBs. Il écrit directement
dans `cart_items`.

---

## 3. Constat B — Navigueur AYWEBs

**Ouverture.** `/aywebs/browser` accepte déjà `url`, `storeId`, `storeName`,
`capture` (`apps/mobile/app/aywebs/browser.tsx:73`). L'entrée depuis la liste des
boutiques est centralisée dans `storeEntry.ts` (`storeEntryTarget`), qui refuse
une boutique sans `browse` ou sans accueil HTTPS. **Le lien profond depuis Lens
est donc une donnée d'entrée déjà supportée** : il ne manque que l'appel.

**Navigation.** `decideWebNavigation` filtre chaque requête du WebView ; les liens
externes/intents sont bloqués, la page reste en HTTPS.

**Extraction.** Bouton « Add to Cart » → le serveur sert le script de capture
(`GET /api/v1/aywebs/capture/script.js`), injecté dans la page ; il remonte des
**textes visibles** (titre, prix, disponibilité, groupes de variantes, ASIN),
jamais du HTML ni des cookies. Le **serveur juge** (`src/aywebs/webviewCapture.ts`) :
intégrité du prix, devise prouvée, disponibilité, corroboration. Le bouton n'est
actif que si la page est classée **page produit** (`captureIsProductCard`) ; sinon
il est désactivé avec le motif écrit.

**Choix du client.** Il se fait **dans la page marchande**. Le script relit ce qui
est *affiché comme choisi* (`option:checked`, `aria-checked`, classes `selected`
dans un conteneur de variantes, JSon twister Amazon) et l'ASIN sélectionné.

**Confirmation.** `AddToCartSheet` : image, titre, prix TND serveur, sillon marchand,
champs de choix, quantité, disponibilité, bouton unique.

**Prix / devise / stock.** Prix TND calculé **par le serveur** à partir du prix
marchand capturé (`calculatePrice`) ; l'état de disponibilité vient du texte publié
(`AVAILABLE` / `LOW_STOCK` / `OUT_OF_STOCK` / `UNKNOWN`). Aucune valeur n'est
estimée ; `UNKNOWN` reste `UNKNOWN`.

**Services réutilisables déjà en place.** `captureScript` + `webviewCapture`,
`productResolver`, `ayWebsVariantQuotes`, `selectionQuote` (côté app),
`variantPageUrlFor` (relectures ciblées), `addAyWebsCartItem`, `ayroviBridge`.

---

## 4. Constat C — Paniers, prix, commandes

### 4.1 Deux paniers physiques, un panier logique déjà ponté

| | Panier ZAYROVI | Panier AYWEBs |
|---|---|---|
| Tables | `cart_items` (`src/db/database.ts:645`) | `ayweb_carts` + `ayweb_cart_items` (`src/aywebs/schema.ts:159,172`) |
| Écriture | `POST /api/cart/items` | `POST /api/v1/aywebs/cart/items` |
| Lecture | `GET /api/cart/items` | `GET /api/v1/aywebs/cart` |
| Preuve | jeton signé `AYROVIX` + `inspectVariantOrder` | capture WebView + `ayWebsSelectionEvidence` + devis signé |
| Idempotence | **aucune clé serveur** : un second ajout **incrémente** la quantité (`db.addItem`) | `ayweb_cart_add_requests` (clé d'idempotence durable) |
| Lien | reçoit les lignes AYWEBs | ponte vers ZAYROVI (`ayroviBridge.ts`) + table `ayweb_cart_ayrovi_links` |

**Le pont est automatique à l'ajout** (`src/aywebs/routes.ts:979`) : la ligne AYWEBs
est copiée dans `cart_items` avec le prix du moteur, l'identité source et la note
de traçabilité. `GET /api/v1/aywebs/cart` renvoie `linked_to_ayrovi` par ligne et
`unlinked_units` global. Le pont est **idempotent** (relancer ne double pas : il
synchronise la quantité, défaut corrigé le 04/10).

**Ce qui casse l'illusion d'unicité.** Trois choses, toutes côté interface :

1. `(tabs)/cart.tsx` lit **uniquement** `/api/cart/items` et n'affiche jamais
   `unlinked_units`. Une ligne AYWEBs non pontée (prix refusé, jetons, mode
   restreint) est **invisible** dans le panier principal ; elle n'existe que dans
   `/aywebs/cart`.
2. `storeShopping.ts` propose un segment « Lens & Shop » qui **affiche** le panier
   ZAYROVI à côté du panier AYWEBs — sans jamais les fusionner. C'est une vue, pas
   une unification.
3. Le pont **est bien déclenché à l'ajout** (`routes.ts:966-1005`, idempotent, un
   échec ne fait pas échouer l'ajout) ; mais son **échec** (`reason: BRIDGE_SKIPPED`,
   `BRIDGE_FAILED`, prix refusé…) n'est affiché que dans `/aywebs/cart`. Le panier
   principal, lui, ne lit jamais `unlinked_units` : la ligne disparaît de sa vue.

### 4.2 Une seule équation de prix

`src/services/pricing.ts::calculatePrice` : change + buffer, fret au poids, TVA et
douane par catégorie, commission, RPD, livraison locale, express. Utilisée par les
**deux** paniers. Le prix marchand est **toujours conservé séparément** du total
TND (`source_price` / `currency` / `pricing_tnd`). Aucun calcul de prix côté app
mobile : elle affiche ce que le serveur publie.

**Point de vigilance réel** : deux émetteurs de jeton (`src/ayrovix/routes.ts:110`,
`src/aywebs/ayroviBridge.ts:149`) pour un seul vérificateur
(`src/services/cartPriceTrust.ts`). Si les règles changent entre l'ajout AYWEBs et
le pont, le prix TND stocké et le prix recalculé divergent : la revérification de
commande doit alors refuser, pas corriger en silence. À tester explicitement.

### 4.3 Deux portes de variante

- Lens → `inspectVariantOrder` (`src/ayrovix/services/variantAvailability.ts:300`),
  contrat par `productKey` + taille/couleur.
- AYWEBs → `ayWebsSelectionEvidence` (`src/aywebs/variantEvidence.ts`), preuve de
  capture par valeur, avec `selection_matches_captured_page` /
  `selection_available_by_value` / `selection_not_in_capture`.

Elles ne se parlent pas. Le pont ne fait que **signer** le prix ; la preuve de
variante reste celle d'AYWEBs. C'est acceptable **à condition** que la ligne
pontée ne prétende pas avoir une preuve Lens.

### 4.4 Deux checkouts

- `POST /api/checkout` (`src/api/routes.ts:523`) : lit `cart_items`, exige un
  client authentifié, vérifie e-mail/téléphone, coordonnées, locale, puis crée la
  commande et laisse le paiement sur la fiche commande.
- `POST /api/v1/aywebs/orders` (`src/aywebs/routes.ts:1166`) : **revérifie la source**
  (`verifyAyWebsCart({ recheckSource: true })`), refuse en 409
  `AYWEBS_SOURCE_VERIFICATION_REQUIRED` si un prix/stock a bougé, puis crée une
  commande AYWEBs et annonce `purchase_integration: PENDING_INTEGRATION`.

**L'achat marchand automatisé n'existe pas** (drapeau fermé, réponse explicite).
L'ordre a raison d'exiger qu'on ne le cache pas ; il faut l'écrire aussi dans le
rapport final et dans l'écran.

### 4.5 Identité de boutique : trois vocabulaires

- Lens : `toStoreKey` renvoie 5 clés (`shein|amazon|temu|aliexpress|generic`).
- AYWEBs : identifiants du registre (`amazon`, `zalando`, `mediamarkt`…).
- Pont : `store: findAyWebsStore(id)?.id || item.storeId`.

Conséquence concrète : **le même Zalando vaut `generic` via Lens et `zalando` via
AYWEBs**. La déduplication (`store + external_id + source_url`) ne peut pas
reconnaître les deux lignes comme la même. À unifier avant tout travail de fusion.

---

## 5. Carte technique (livrable D du cahier des charges)

### D1 — Composants et flux actuels

```
Lens (recherche)  ──carte──> fiche Lens ──buildCartPayload──> POST /api/cart/items ─┐
                                                                                   ├─> cart_items ─> POST /api/checkout ─> orders
Navigateur AYWEBs ──capture──> AddToCartSheet ──> POST /aywebs/cart/items ─────────┤
                                                        │                          │
                                                        └─ pont auto ──────────────┘
                                                        └─ ayweb_carts (antichambre, revérifiée)
                                                                                   └─> POST /aywebs/orders (revérifié)
```

### D2 — Services déjà partagés (à réutiliser, pas à réécrire)

- `services/pricing.ts::calculatePrice` — équation unique.
- `ayrovix/priceQuote.ts::createAyrovixPriceToken` — signature unique.
- `services/cartPriceTrust.ts` — vérification unique à la commande.
- `aywebs/ayroviBridge.ts` — pont unique AYWEBs → ZAYROVI.
- `aywebs/captureScript.ts` + `webviewCapture.ts` — capture et jugement.
- `aywebs/variantQuotes.ts` + `api/aywebs.ts::variantQuoteList` — devis par valeur.

### D3 — Duplications réelles (à unifier)

| Duplication | Où | Décision |
|---|---|---|
| Deux écrans de panier | `(tabs)/cart.tsx` vs `aywebs/cart.tsx` | un seul écran logique, deux sections |
| Deux identités boutique | `toStoreKey` vs `ayweb_stores` | une fonction `storeKeyFor(url)` partagée |
| Deux portes variante | `inspectVariantOrder` vs `ayWebsSelectionEvidence` | garder les deux, **déclarer** laquelle s'applique |
| Deux idempotences | clé durable AYWEBs vs rien côté Lens | clé durable des deux côtés |
| Deux confirmations d'ajout | fiche Lens vs `AddToCartSheet` | une seule feuille de confirmation |

### D4 — À conserver sans y toucher

- L'équation de prix et ses règles versionnées.
- Le pont (idempotence et synchronisation de quantité).
- La capture serveur et son verdict (le serveur décide, jamais l'app).
- Le checkout ZAYROVI (authentification, coordonnées, locale, paiement).
- La revérification avant commande côté AYWEBs.
- `purchase_integration: PENDING_INTEGRATION` (honnêteté sur l'achat marchand).

### D5 — Fichiers à modifier (phase 2 et suivantes)

| Fichier | Changement | Pourquoi |
|---|---|---|
| `apps/mobile/app/lens.tsx` | `onOpen` → navigateur AYWEBs (avec repli fiche) | carte = entrée directe |
| `apps/mobile/src/features/lens/LensProductView.tsx` | devient « ajout rapide », lien vers la page | ne perdre aucune fonction |
| `apps/mobile/src/features/aywebs/storeEntry.ts` | `productEntryTarget(url, …)` | entrée produit, pas seulement accueil |
| `apps/mobile/app/aywebs/browser.tsx` | accepter `mode=product` et le retour Lens | contexte conservé |
| `apps/mobile/app/(tabs)/cart.tsx` | lire aussi `unlinked_units` + `/aywebs/cart` | ne plus perdre de lignes |
| `apps/mobile/app/aywebs/cart.tsx` | fusionner dans l'écran unique | un seul panier à l'écran |
| `src/aywebs/routes.ts` | `store_key` normalisé dans le pont | déduplication correcte |
| `src/aywebs/ayroviBridge.ts` | utiliser la clé normalisée | idem |
| `src/api/routes.ts` | clé d'idempotence sur `POST /api/cart/items` | double-tap |
| `shared/aywebsStores.ts` | `storeKeyFor(url)` exporté | une seule vérité d'identité |

### D6 — Risques et dépendances

1. **Page non produit** : une carte Lens peut pointer vers un agrégateur. Le
   navigateur refusera l'ajout (bouton désactivé). Il faut un **repli** vers la
   fiche Lens, sinon le client est dans un cul-de-sac.
2. **Boutiques sans capture** : si on supprime l'ajout Lens, ces boutiques
   deviennent non achetables. La fiche doit rester le chemin de secours.
3. **Prix refusé au pont** : la ligne reste non pontée. Sans affichage dans le
   panier principal, le client croit avoir perdu son produit.
4. **Deux jetons, une version de règles** : divergence possible entre l'ajout et
   la commande ; doit être refusée explicitement, jamais corrigée en silence.
5. **Fusion de quantités** : deux lignes identiques mais preuves différentes ne
   doivent pas être fusionnées (l'ordre le demande aussi).
6. **APK** : toute modification mobile n'atteint le client qu'avec une nouvelle
   APK ; la recette terrain ne peut pas précéder ce build.
7. **Base de données** : aucune migration n'est nécessaire pour le pont (tables
   déjà présentes). Un **rattrapage** des lignes non pontées existantes est à
   prévoir (script idempotent, pas de migration destructive).

### D7 — Conception cible proposée

- **Une vérité de caisse** : `cart_items` (elle est déjà branchée sur le checkout,
  l'OMS et le paiement).
- **Une antichambre de preuve** : `ayweb_carts`, déjà pontée **à l'ajout** —
  comportement à conserver, et dont le **résultat** (lié / non lié + motif) doit
  remonter dans l'écran unique.
- **Un seul écran de panier** : sections par boutique, une ligne = une identité
  (boutique normalisée + produit + variante + preuve). Les unités non pontées
  s'affichent avec leur motif et un bouton « réessayer le pont ».
- **Une seule entrée d'ajout** : `POST /aywebs/cart/items` (capture + devis),
  utilisée **aussi** par Lens quand le produit est ouvert dans le navigateur.
  Le chemin Lens direct reste pour les boutiques sans capture, avec la même clé
  d'idempotence et la même réponse (« ajouté », « revérification requise »).
- **Lens = découverte** : la carte ouvre la page marchande dans le navigateur.
  Un appui long (ou un bouton secondaire) ouvre la fiche rapide.
- **Une identité boutique** : `storeKeyFor(url)` partagée serveur/app.

---

## 6. Corrections à apporter à l'ordre

| # | Angle mort | Pourquoi c'est bloquant | Ajout proposé |
|---|---|---|---|
| 1 | Aucune mention de la **preuve** | « extraire les données » peut être lu comme « lire puis afficher » — c'est exactement ce qu'on nous a reproché | la couche d'ajout prend `capture` + `quote_token` ; sans preuve, l'écran dit « à vérifier à l'ajout » |
| 2 | Le pont **existe déjà** | sinon l'équipe reconstruit un troisième panier | l'ordre doit dire « adopter `ayroviBridge` », pas « créer une couche » |
| 3 | **Identité boutique** non unifiée | déduplication impossible (`generic` vs `zalando`) | une fonction partagée, testée |
| 4 | **Idempotence** asymétrique | double-tap = quantité doublée côté Lens | clé durable sur `POST /api/cart/items` |
| 5 | **Boutique non supportée** non définie | AYWEBs refuse l'ajout (bouton désactivé) ; l'ordre ne dit pas quoi faire | renvoyer vers la **demande d'achat** existante (`POST /api/v1/aywebs/purchase-requests`, revue humaine) |
| 6 | **Tests** non hiérarchisés | l'E2E réel sur Amazon/Zalando est instable (anti-bot) | distinguer : contrat (fixtures, CI) / UI (jest) / terrain (manuel, APK) |
| 7 | **Livraison** du correctif | le client teste sur APK | chaque lot = APK + notes de recette |

---

## 7. Plan d'exécution proposé (5 lots)

| Lot | Contenu | Fichiers | Tests | Risque |
|---|---|---|---|---|
| **L0** | Rattrapage des lignes non pontées + badge panier unifié | `src/aywebs/ayroviBridge.ts`, `(tabs)/cart.tsx`, `aywebs/cart.tsx` | unitaires + HTTP | faible |
| **L1** | Identité boutique unique | `shared/aywebsStores.ts`, `ayroviBridge.ts`, `lens/productOrder.ts` | table de correspondance | moyen (données existantes) |
| **L2** | Idempotence du panier ZAYROVI | `src/api/routes.ts`, `database.ts` (colonne/table dédiée) | double POST = 1 ligne | moyen (migration additive) |
| **L3** | Carte Lens → navigateur AYWEBs | `app/lens.tsx`, `storeEntry.ts`, `browser.tsx` | UI + contrat | moyen (repli obligatoire) |
| **L4** | Écran de panier unique + revérification visible | `(tabs)/cart.tsx`, `aywebs/cart.tsx`, API | UI + HTTP + terrain | élevé (recette) |

**Ordre imposé** : L0 avant L3 (sinon on ouvre une porte vers des lignes que le
panier ne montre pas). L1 avant L2 (la déduplication en dépend).

---

## 8. Ce qui n'est pas dans ce lot

- **L'achat réel chez le marchand** (passer la commande sur Amazon/Zalando) :
  inexistant, drapeau fermé, réponse `PENDING_INTEGRATION`. Aucune unification ne
  doit laisser croire le contraire.
- **Le suivi de colis marchand** : dépend du même chaînon.
- **Le paiement** : inchangé, il reste sur la fiche commande.

---

## 9. Décisions demandées au donneur d'ordre

1. La carte Lens doit-elle ouvrir **toujours** le navigateur, ou seulement quand
   la page est reconnue comme produit (sinon fiche rapide) ?
2. Le panier principal doit-il afficher les lignes **non pontées** (avec leur
   motif), ou seulement les lignes pontées et un avertissement ?
3. Accepte-t-on une **migration additive** pour la clé d'idempotence du panier
   ZAYROVI (colonne + index, réversible), ou doit-on rester sans changement de
   schéma ?

---

*Audit réalisé le 23/10/2026. Aucun fichier applicatif modifié. Les numéros de
ligne renvoient à l'état `b1321b2c`.*
