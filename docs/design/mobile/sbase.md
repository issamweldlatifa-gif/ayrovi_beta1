# S Base — recherche marchande (SandBase) + photo

**Date** : 19/11/2026 (v2 le même jour) · **Portée** : `apps/mobile` + `src/sbase`
**Statut** : v3 — champ unique (mot-clé **ou** photo), résultats groupés + filtre, **fiche produit unifiée** avec tailles/couleurs

---

## 1. L'écran

```
[ 📷 ]  Rechercher un produit (ex. mini traceur GPS)      [ 🔍 ]
        [AliExpress] [Amazon] [eBay] [Google Shopping] [Bing] [Taobao] [1688]
        Capacités réelles · Mots-clés · Prix
        « 4 boutiques · 2,4 s · 87 résultats »
        ── Amazon ── 42 résultats · 1,1 s
        ── eBay   ── SANDBASE_UNAUTHORIZED — clé refusée
```

- **Un champ unique** remplace la grille de boutiques.
- **Caméra** (à gauche) : choisir une photo → recherche visuelle immédiate.
- **Filtre = boutiques interrogées** : les chips disent exactement ce qui part
  chez SandBase. Défaut = AliExpress, Amazon, eBay, Google Shopping (les autres
  existent, décochées : Taobao/1688/Bing ne partent jamais sans choix explicite).
- Décocher après une recherche **masque le groupe** sans nouvel appel, et affiche
  « sélection modifiée — relancez » : la kchedma ne double jamais en silence.
- Aucune icône décorative : pas de micro (aucune fonction vocale branchée ici).

## 2. Ce qui reste vrai (v1 → v2)

| Règle | Application |
|---|---|
| Pas de moteur unifié | chaque boutique = un appel ; résultats **groupés**, jamais fusionnés ni re-classés |
| Chaque groupe porte sa vérité | temps mesuré, `cached`, code d'erreur, coût de l'appel |
| Rien d'inventé | prix/devise de la source ; champs absents listés |
| Isolé d'AYWEBs | aucun import ; rien n'entre dans le panier |
| Isolé de Z Lens | aucune route, aucun quota, aucune modification |

## 3. Modes

### Mot-clé (SandBase)
`POST /api/sbase/search { q, sources[] }` → `{ groups[] }`.
Chaque source est un endpoint documenté (voir `src/sbase/descriptors.ts`).
Fan-out parallèle borné à 7 sources ; cache 10 min par (boutique, requête).

### Photo (Google Lens)
`POST /api/sbase/image` (multipart) → `{ items[], stores[] }`.
SandBase n'expose **aucun** endpoint « image → produits » pour Amazon/AliExpress/
eBay : la seule capacité réelle est `google_lens` via SerpApi. Le service
existant (`zayrovix/services/visualSearch.ts`) est **réutilisé tel quel** — c'est
le seul import Zayrovix autorisé, et un test le vérifie. Les résultats portent
leur boutique (`source`), et le filtre se construit **à partir des boutiques
reçues** (Amazon, SHEIN, … même si ce ne sont pas des sources SandBase).

## 4. Matrice de capacités

| Capacité | SandBase (7 boutiques) | Canal photo |
|---|---|---|
| Mots-clés | ✅ | — |
| Image | ❌ (endpoint inexistant) | ✅ Google Lens |
| Prix + devise | ✅ | ✅ quand la source en donne |
| URL / Détails / Variantes / Code-barres | ❌ | ❌ |

Le libellé « Capacités réelles » au-dessus des résultats est **l'intersection**
des boutiques cochées : il ne peut donc pas promettre plus que la plus pauvre.

## 5. Coût et garde-fous

- ~0,0143–0,0278 $ par boutique et par recherche ; défaut = 4 boutiques.
- Quotas serveur dédiés : 30 recherches /10 min, **12 photos /10 min** — séparés
  du quota Z Lens.
- Clé `SANDBASE_API_KEY` uniquement côté serveur ; rien ne sort vers le client.
- Sans clé : bandeau « non activé », aucune requête payante (testé).

## 6. Ajouter une boutique / un canal

- Boutique : une entrée dans `SBASE_SOURCES` (`defaultEnabled` décide si elle
  part d'office). Rien d'autre à toucher.
- Canal : un module + une route, dans `src/sbase/`, déclaré dans `/sources`
  (comme `SBASE_IMAGE_SOURCE`) pour que l'écran l'affiche honnêtement.

## 7. Dette assumée

- Pas de page détails produit (le lien d'origine s'ouvre dans le navigateur).
- Pas de pagination par boutique.
- 1688/Taobao : titres en chinois, prix CNY — non convertis (règle maison).


---

## 8. v3 — fiche produit et « tailles / couleurs »

### Une seule fiche pour toutes les boutiques
`app/sbase/item.tsx` → `SbaseItemScreen` : même écran, même hiérarchie, quelle
que soit la boutique. Ce qui change, c'est la **donnée** :

| Boutique | Endpoint de fiche | Type | Ce qu'elle donne |
|---|---|---|---|
| Amazon | `/v1/api/amazon/product` (`asin`) | async | specs, images, **variantes**, offres |
| eBay | `/v1/api/ebay/product` (`product_id`) | async | item specifics, images, variations |
| Google Shopping | `/v1/api/google-shopping/product` (`q` + `gpcid`) | sync | specs, description, offres |
| Taobao | `/v1/api/taobao/item/detail` (`itemId`) | sync | images, **SKU (couleur/format)**, vendeur |
| AliExpress | — | — | **aucune fiche publiée** : le tap ouvre le lien d'origine |

Règle : un résultat n'ouvre la fiche interne **que** si `supports.details` est
vrai ; sinon il ouvre le navigateur. Aucune fiche vide, aucun « bientôt ».

### Tailles / couleurs
`src/sbase/detail.ts` normalise trois familles de payloads :
- Taobao/1688 : `item.sku_props[{name, values[{name, image}]}]` ;
- eBay : `variations` (objet `{Taille: [...], Couleur: [...]}`) ;
- Amazon : `variants[]` (un groupe « options » avec le titre de chaque variante).

Chaque valeur porte `available: true | false | null` — **null quand la source ne
le dit pas** (on n'écrit ni « en stock » ni « épuisé »). Si aucune variante n'est
publiée : la section affiche « cette boutique ne fournit pas les tailles ni les
couleurs » et `variants` apparaît dans « champs non fournis ».

### Alibaba.com (ajouté en v3)
`/v1/api/alibaba/search` — recherche B2B documentée (titre, fourchette de prix,
MOQ, fournisseur), **facturée par résultat** (≈ 0,00077 $/résultat, plafond
0,0193 $). Présent dans le filtre, décoché par défaut (comme Taobao/1688), et
l'écran affiche « (par résultat) » à côté du coût.

### Pourquoi trois boutiques sont décochées par défaut
| Boutique | Raison |
|---|---|
| Bing Shopping | Doublon de Google Shopping (+0,015 $/recherche pour les mêmes offres) |
| Taobao | Consommateur chinois : titres en chinois, pas de livraison TN directe |
| 1688 / Alibaba | **B2B** : MOQ, prix de gros en CNY, achat via agent |

Elles restent **une tape** dans le filtre — rien n'est caché, et le coût ne part
jamais sans un choix explicite. Changer les défauts = `defaultEnabled` dans
`src/sbase/descriptors.ts` (une ligne par boutique).

## 9. Canal image — pourquoi SerpApi, et pourquoi l'erreur était mensongère

**Question posée le 26/11/2026 :** « la recherche par image de S Base passe par
l'API SerpApi ? » → **Oui, et c'est assumé, mais c'était mal dit.**

- SandBase ne publie **aucun** endpoint image→produits pour ses 7 sources. Le seul
  endpoint image (1688) est du B2B chinois.
- Le canal image de S Base **réutilise le service visuel existant**
  (`zayrovix/services/visualSearch`, Google Lens via SerpApi) **importé tel quel** :
  aucune route Z Lens touchée, aucun quota Z Lens modifié.
- Conséquence : une photo = **1 upload + N recherches Lens** (une par marché).

### Ce qui était cassé (et ce qui est corrigé)

| Symptôme vu à l'écran | Cause réelle | Correction |
|---|---|---|
| `SBASE_IMAGE_INVALID` + « تعذّر تحليل الصورة » sur une photo valide | http 400 codé en dur pour **tout** échec, y compris un refus de Lens (quota, 429, timeout) | un code + un statut par cause (tableau ci-dessous) |
| Phrase **arabe** dans un écran **français** | le serveur renvoyait sa langue, l'écran l'affichait telle quelle | l'écran traduit **par code** (`sbase.err.*`), le code reste affiché pour le diagnostic |
| « ça marchait puis ça s'est arrêté » | chaque photo consommait **9 recherches Lens** (les 9 marchés par défaut de Z Lens) → quota SerpApi épuisé | S Base demande **1 marché** (`fr` par défaut, `SBASE_IMAGE_MARKETS=fr,uk` pour élargir) ; le nombre d'appels facturés est affiché |

### Codes du canal image

| Code | HTTP | Sens |
|---|---|---|
| `SBASE_IMAGE_EMPTY` | 400 | aucune photo envoyée |
| `SBASE_IMAGE_INVALID` | 400 | l'image ne se décode pas (JPEG/PNG/WebP seulement) |
| `SBASE_IMAGE_TOO_LARGE` | 413 | > 8 Mo |
| `SBASE_IMAGE_TIMEOUT` | 504 | Lens a dépassé le budget |
| `SBASE_IMAGE_RATE_LIMITED` | 429 | 429 du fournisseur |
| `SBASE_IMAGE_PROVIDER_AUTH` | 503 | clé refusée (401/403) |
| `SBASE_IMAGE_PROVIDER_REFUSED` | 502 | Lens refuse (quota/clé) — **jamais** présenté comme une photo invalide |
| `SBASE_IMAGE_PROVIDER_DOWN` | 502 | 5xx, JSON illisible, indisponible |
| `SBASE_IMAGE_NOT_CONFIGURED` | 503 | `SERPAPI_KEY` absent |
| `SBASE_IMAGE_UNKNOWN` | 502 | cause inconnue, dite comme telle |

Chaque échec de fournisseur renvoie `providerCode` (`SERPAPI_…`) : on diagnostique
depuis l'app, sans journal serveur. Dans tous ces cas la barre de recherche par
mot-clé reste utilisable, et l'écran le dit.

## 10. v4 — deux boutiques, et la photo vient de 1688 (26/11/2026)

Décision du propriétaire : **« بحث بالصورة لا علاقة له بـ SerpApi »**, et S Base
ne garde que **1688 + Alibaba.com**.

### Ce qui a changé

| Avant (v3) | Après (v4) |
|---|---|
| 8 boutiques (AliExpress, Amazon, eBay, Google Shopping, Bing, Taobao, Alibaba, 1688) | **2 boutiques** : 1688 et Alibaba.com |
| Photo → Google Lens via **SerpApi** (clé + quota séparés, 1 à 9 appels par photo) | Photo → **1688** (`/v1/api/1688/search/cross-border-by-image`) : une seule clé, celle de SandBase |
| Aucun endpoint image dans SandBase | La photo est **publiée 10 min** sur `GET /api/sbase/photo/:token` (JPEG, 48 hex aléatoires, `no-store`, `noindex`), puis 1688 la lit |
| Fiche : Amazon/eBay/Google/Taobao | Fiche : **1688 uniquement** (`item/detail`, ou `item/detail-by-url` si on n'a que le lien) |
| Résultats sans MOQ | **MOQ + fournisseur** affichés : c'est du commerce de gros |

### Ce que la documentation permet (et ne permet pas)

| | 1688 | Alibaba.com |
|---|---|---|
| Recherche par mot-clé | ✅ `search/cross-border` (`language: en`) | ✅ `search` (jusqu'à 25 résultats) |
| Recherche par image | ✅ `search/cross-border-by-image` (`imgUrl`) | ❌ **aucun endpoint image** |
| Détails produit | ✅ `item/detail` + `item/detail-by-url` | ❌ aucun endpoint |
| Tailles/couleurs (SKU) | ✅ `sku_props` → variantes | ❌ |
| Vendeur, MOQ, prix dégressifs | ✅ | ⚠️ MOQ/prix dans les résultats de recherche seulement |
| Coût publié | 0,014286 $ / appel | 0,00077 $ / résultat (0,00231 $ annoncé) |

Conséquence assumée : **une photo ne peut pas interroger Alibaba.com**. L'écran le
dit (« Photo → 1688 ») au lieu de laisser croire à une recherche photo sur les deux.

### Codes d'erreur de la photo (SandBase, plus SerpApi)

`SBASE_IMAGE_EMPTY` 400 · `SBASE_IMAGE_INVALID` 400 (image illisible — seule faute du client)
· `SBASE_IMAGE_TOO_LARGE` 413 · `SBASE_IMAGE_TIMEOUT` 504 · `SBASE_IMAGE_RATE_LIMITED` 429
· `SBASE_IMAGE_PROVIDER_AUTH` 503 · `SBASE_IMAGE_BALANCE` 402
· **`SBASE_IMAGE_URL_REJECTED` 502** (1688 n'a pas pu lire notre lien photo)
· `SBASE_IMAGE_NOT_CONFIGURED` 503 · `SBASE_IMAGE_UNKNOWN` 502.

### Réglages serveur

- `SANDBASE_API_KEY` : la seule clé nécessaire (SerpApi n'est plus utilisé par S Base).
- `SBASE_PUBLIC_URL` : origine publique du serveur (ex. `https://…onrender.com`).
  Sans elle, on la déduit de `x-forwarded-host`/`host` ; si elle manque totalement,
  la photo répond `503` en le disant, plutôt que d'envoyer un lien local à 1688.

## 11. v5 — carte produit, prix rendu en Tunisie, et Alibaba.com retirée

### 11.1 Une seule boutique : 1688

Alibaba.com a été *retirée* le 26/11/2026 (décision du propriétaire : « si ça ne
sert à rien pour nous, on laisse tomber »). Motif factuel : SandBase ne publie
pour Alibaba **qu'un** endpoint de recherche par mot-clé — ni image, ni détails,
ni variantes, ni disponibilité. La carte produit qu'on promet ne peut pas être
remplie avec ça. Retour éventuel = une ligne dans `descriptors.ts`.

### 11.2 La carte produit (mobile)

| Élément | Source | Règle |
|---|---|---|
| Image | `img` / `fullPathImageURI` | rien d'inventé ; absence ⇒ pas de bloc |
| Titre | `title` traduit (cross-border) | jamais le titre chinois quand l'endpoint en fournit un traduit |
| Prix source | `price` + `currency` | tel quel, en CNY |
| **Prix rendu TND** | moteur de prix serveur | `≈ 22,504 TND`, ou « estimation indisponible » |
| Fournisseur | `shop_info.company_name` | affiché à côté, pas à la place du store |
| MOQ | `moq` / `quantity_begin` | affiché — c'est du gros |
| Note / livraison | si fournis | sinon absents (pas de « — » trompeur) |

### 11.3 Le moteur de prix

`calculatePrice()` (`src/services/pricing.ts`) **n'est pas dupliqué** : S Base lui
passe ses règles via `createSbaseRouter({ getPricingRules })` et publie le
résultat dans `priceEstimate` (résultats + fiche). Détail de la fiche : produit
converti, fret, douane, TVA, frais de service, livraison locale, total, catégorie
douanière, `pricingVersion`.

- Sur une ligne de résultat : **sans** livraison locale (elle se paie une fois
  par commande) ; sur la fiche : **avec**.
- Devise non cotée ⇒ `priceEstimate: null` ⇒ l'UI écrit « estimation
  indisponible » (aucun taux codé en dur dans l'app).
- **CNY ajouté** à `FX_EXTRA_CURRENCIES` (flux marché) : sans lui, 1688 n'aurait
  jamais eu d'estimation TND.

### 11.4 Ce qui n'est pas encore fait : le panier

S Base reste une **expérience indépendante** : aucune ligne n'est créée dans le
panier ZAYROVI. Techniquement le panier exige un `store` connu, un prix TND
*coté par le serveur* et un **jeton de prix signé** (`priceToken`) ; 1688 n'est
pas une boutique AYWEBs. Brancher « ajouter au panier » proprement = mint du
jeton côté S Base + décision sur le `store`. C'est un chantier à part, pas un
bouton à moitié câblé.
