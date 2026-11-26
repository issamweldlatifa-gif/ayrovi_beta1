# S Base — recherche marchande 1688 via Apify + photo

**Date** : 26/11/2026 · **Portée** : `apps/mobile` + `src/sbase`
**Statut** : un seul fournisseur (**Apify**), un seul magasin (**1688**), champ
unique (mot-clé **ou** photo), résultats groupés + filtre, fiche produit unifiée
avec tailles/couleurs et prix rendu TND.

---

## 1. L'écran

```
[ 📷 ]  Rechercher un produit (ex. mini traceur GPS)      [ 🔍 ]
        [1688]
        Capacités réelles · Mots-clés · Prix
        « 1 boutique · 2,4 s · 20 résultats · via apify »
        ── 1688 ── 20 résultats · 2,1 s
        ── 1688 ── APIFY_UNAUTHORIZED — clé refusée
```

- **Un champ unique** remplace la grille de boutiques.
- **Caméra** (à gauche) : choisir une photo → recherche visuelle immédiate.
- **Filtre = magasins interrogés** : la chip dit exactement ce qui part chez le
  fournisseur. Défaut = 1688 (la seule source).
- Décocher après une recherche **masque le groupe** sans nouvel appel, et affiche
  « sélection modifiée — relancez » : la kchedma ne double jamais en silence.
- Aucune icône décorative : pas de micro (aucune fonction vocale branchée ici).

## 2. Ce qui reste vrai

| Règle | Application |
|---|---|
| Pas de moteur unifié | chaque magasin = un appel ; résultats **groupés**, jamais fusionnés ni re-classés |
| Chaque groupe porte sa vérité | temps mesuré, `cached`, code d'erreur, coût de l'appel, `via {provider}` |
| Rien d'inventé | prix/devise de la source ; champs absents listés dans `missing` |
| Le prix rendu vient du moteur de la maison | `calculatePrice()` via `getPricingRules` ; devise non cotée ⇒ `priceEstimate: null` |
| Isolé d'AYWEBs | aucun import ; rien n'entre dans le panier |
| Isolé de Z Lens | aucune route, aucun quota, aucune modification |

## 3. Modes

### Mot-clé (Apify `sourabhbgp/1688-scraper`)
`POST /api/sbase/search { q, sources[] }` → `{ groups[] }`.
Le client (`src/sbase/apify.ts`) fait `POST /v2/acts/{actor}/runs` puis poll
`/v2/actor-runs/{runId}` jusqu'à `SUCCEEDED` puis lit `/v2/datasets/{id}/items`.
Fan-out parallèle borné à 7 sources ; cache 10 min par (boutique, requête) — la
clé de cache inclut le fournisseur.

### Fiche produit (même actor, `mode: product_detail`)
`POST /api/sbase/item { source, id | url }` → `{ detail }`. `offerIds` accepte
l'identifiant **ou** le lien `detail.1688.com` (documenté). Le run exige
`proxyConfiguration.useApifyProxy: true` (limite publiée par l'actor). La fiche
attend jusqu'à 110 s côté app : la lecture de la page 1688 est documentée
15–90 s par produit. Elle porte `weightKg` (`variants[].weightGrams`) qui nourrit
le fret réel du moteur de prix.

### Photo (Apify Server actor + actors run)
`POST /api/sbase/image` (multipart) → `{ items[], stores[], groups[] }`. La photo part en
**base64** — **aucune publication publique, aucune sonde réseau**. Le garde-fou
gratuit est **local** : décodage + compression dégradée sous la limite
documentée (corps ≤ 1 Mo) ; au-delà, refus `413` **avant tout appel payant**.

**Plusieurs magasins en parallèle** (26/11/2026) — chaque magasin = un appel
indépendant, avec SON temps, SON erreur et SON coût publié ; les résultats
portent leur magasin, le filtre de l'écran se construit sur les magasins reçus :

| Magasin | Actor | Entrée | Coût publié |
|---|---|---|---|
| `1688` | `topapi/image-search-1688-api` (Server actor) | `{imageBase64, maxResults:20, excludeAds:true}` — POST unique | 0,20 $/1000 résultats ⇒ **≈ 0,004 $/photo**, gratuit si 0 |
| `aliexpress` | `piotrv1001/aliexpress-image-search-scraper` (run actor, 320+ utilisateurs) | `imagesBase64:[…]` accepte **base64 directement**, `maxResultsPerImage:20`, `shipTo:US`, `currency:USD` | **0,02 $/photo** (1 page jusqu'à 60 résultats) ; **image en échec ou sans résultats = gratuite** |

Pages de sortie documentées de l'actor AliExpress : `productId, title, url,
image, price, currency, rating, sold, soldText, isBestMatch…` — MOQ/vendeur non
publiés ⇒ restent dans `missing`. Lignes d'échec documentées
(`no_matches` / `image_error` / `failed`) → chacune son code honnête
(`empty` gratuit / `SBASE_IMAGE_STORE_REFUSED` / `APIFY_FAILED`), jamais «
aucun résultat ». Si **tous** les magasins échouent, la réponse porte le code du
premier échec avec son vrai statut (402/429/504…) — un échec n'est jamais
facturé ni présenté comme une photo invalide.

0 résultat = cas normal **gratuit** chez chaque fournisseur — affiché « empty »,
jamais transformé en panne.

**Latence mesurée en direct (26/11/2026, serveur du propriétaire)** : photo
31 s, recherche par mot-clé ≈ 42 s — les budgets ont été alignés sur la réalité
(recherche 90 s, photo 75 s côté serveur ; 100 s / 85 s côté app) : avant, des
appels **réussis** mais lents étaient coupés en `APIFY_TIMEOUT` pendant que le
run continuait et se facturait chez le fournisseur.

## 4. Matrice de capacités

| Capacité | 1688 (Apify) | Canal photo |
|---|---|---|
| Mots-clés | ✅ | — |
| Image | ✅ | ✅ (actor image, Server actor) |
| Prix + devise | ✅ CNY | ✅ quand la source en donne |
| URL / Détails / Variantes | ✅ (`product_detail`) | ❌ |
| Code-barres | ❌ | ❌ |

Le libellé « Capacités réelles » au-dessus des résultats est **l'intersection**
des magasins cochés : il ne peut pas promettre plus que la plus pauvre.

## 5. Coût et garde-fous

- **Coûts publiés par le fournisseur** (affichés tels quels) :
  recherche ≈ **0,0848 $** (0,005 $/run + 20 lignes × 3,99 $/1000) ·
  fiche ≈ **0,00899 $** · photo : **0,004 $** (1688) + **0,02 $** (AliExpress)
  ⇒ jusqu'à **0,024 $/photo**, chaque magasin gratuit si 0 résultat/failure.
- Quotas serveur dédiés : 30 recherches /10 min, **12 photos /10 min** — séparés
  du quota Z Lens.
- Clé `APIFY_TOKEN` uniquement côté serveur (tête `Authorization: Bearer` — le
  token ne figure **jamais** dans une URL ni un corps visible du client) ; rien
  ne sort vers l'app.
- Sans clé : `503 APIFY_NOT_CONFIGURED`, **aucune requête payante** (testé).
- Un échec n'est **jamais** facturé ni présenté comme « aucun résultat ».

## 6. Ajouter une boutique / un canal

- Boutique : une entrée dans `SBASE_SOURCES` (`src/sbase/descriptors.ts`,
  `defaultEnabled` décide si elle part d'office). Rien d'autre à toucher.
- Canal : un module + une route, dans `src/sbase/`, déclaré dans `/sources`
  (comme `SBASE_IMAGE_SOURCE`) pour que l'écran l'affiche honnêtement.

## 7. Dette assumée

- Pas de pagination par magasin (20 lignes par run de recherche).
- 1688 : titres chinois quand `titleEn` manque, prix CNY — la conversion est le
  travail du moteur de prix, pas de l'écran.
- Pas de panier : S Base reste une expérience indépendante (voir journal v5).

## 8. Fiche produit et « tailles / couleurs »

Une seule fiche (`app/sbase/item.tsx` → `SbaseItemScreen`) : même écran, même
hiérarchie, quelle que soit la source. Ce qui change, c'est la **donnée**.

Règle : un résultat n'ouvre la fiche interne **que** si `supports.details` est
vrai ; sinon il ouvre le navigateur. Une ligne photo ouvre la **fiche 1688**
(`offerId` → `product_detail`), jamais une source externe.

`src/sbase/detail.ts` normalise :
- `item.sku_props[{name, values[{name, image}]}]` (1688 natif) ;
- `variants[]` d'Apify (`specAttributes`) — un groupe « options », les noms
  d'axes n'étant pas publiés par l'actor (on n'invente pas « Couleur ») ;
- `variations` objet `{Taille: [...], Couleur: [...]}` (forme générique).

Chaque valeur porte `available: true | false | null` — **null quand la source ne
le dit pas**. Si aucune variante n'est publiée : « cette boutique ne fournit pas
les tailles ni les couleurs » et `variants` apparaît dans « champs non fournis ».

## 9. Codes du canal image (et de la recherche)

| Code | HTTP | Sens |
|---|---|---|
| `SBASE_IMAGE_EMPTY` | 400 | aucune photo envoyée |
| `SBASE_IMAGE_INVALID` | 400 | l'image ne se décode pas (JPEG/PNG/WebP) — **seule faute du client** |
| `SBASE_IMAGE_TOO_LARGE` | 413 | dépasse la limite documentée (corps ≤ 1 Mo) — refus **local gratuit** |
| `SBASE_IMAGE_TIMEOUT` | 504 | le fournisseur a dépassé le budget |
| `SBASE_IMAGE_RATE_LIMITED` | 429 | 429 du fournisseur |
| `SBASE_IMAGE_PROVIDER_AUTH` | 503 | clé refusée (401/403) |
| `SBASE_IMAGE_BALANCE` | 402 | crédit fournisseur insuffisant |
| `SBASE_IMAGE_PROVIDER_REFUSED` | 502 | le run image a échoué chez le fournisseur — **jamais** présenté comme une photo invalide |
| `SBASE_IMAGE_REQUEST_INVALID` | 502 | requête mal formée **de notre côté** (nommée comme telle) |
| `SBASE_IMAGE_PROVIDER_DOWN` | 502 | 5xx, JSON illisible, indisponible |
| `SBASE_IMAGE_NOT_CONFIGURED` | 503 | `APIFY_TOKEN` absent |
| `SBASE_IMAGE_UNKNOWN` | 502 | cause inconnue, dite comme telle |

Côté mot-clé/fiche : `APIFY_NOT_CONFIGURED` 503 · `APIFY_UNAUTHORIZED` 401/403 ·
`APIFY_BALANCE` 402 · `APIFY_RATE_LIMIT` 429 · `APIFY_TIMEOUT` 504 ·
`APIFY_FAILED` 502 · `APIFY_EMPTY` 404 · `APIFY_HTTP/NETWORK/MALFORMED`.

Chaque échec de fournisseur renvoie `providerCode` (`APIFY_…`) : on diagnostique
depuis l'app, sans journal serveur. L'écran traduit **par code** (`sbase.err.*`),
le code reste affiché pour le diagnostic. Quand **tous** les groupes sont en
erreur : « Aucune boutique n'a répondu — rien n'a été facturé » + le code réel ;
un appel échoué affiche « échec non facturé » au lieu d'un coût.

## 10. Journal des décisions

- **19/11/2026 (v1–v2)** : champ unique, résultats groupés, chaque groupe porte
  son temps / son erreur / son coût ; rien d'inventé.
- **v3** : fiche produit unifiée + tailles/couleurs (`available` trois-états).
- **v4** : la photo vient de 1688 elle-même ; MOQ + fournisseur affichés (gros).
- **v5** : Alibaba.com retirée (aucune fiche publiée ⇒ promesse impossible) ;
  prix rendu TND via le moteur de prix ; CNY ajouté au flux de change marché.
- **26/11/2026 (incident 04:32)** : `page` partait en texte (400 sur chaque
  recherche) — les entiers sont verrouillés par test sur le **type** ;
  `parameter validation…` ⇒ code « faute de notre côté » ; zéro résultat photo
  dit « aucun produit ne correspond » ; un échec n'est plus un « aucun résultat ».
- **26/11/2026 (migration fournisseur)** : décision du propriétaire, finale —
  **« احذف امتداد sandbase نهائيا وعوّض المشروع بـapify »**. Exécutée en trois
  commits sans jamais laisser l'app sans source :
  1. le fournisseur Apify est **construit à côté** de l'ancien (rien d'activé) ;
  2. **activation par variable d'environnement** (`SBASE_PROVIDER=apify`),
  vérifiable en direct avec la clé du propriétaire sur le serveur publié ;
  3. **suppression totale de l'ancien fournisseur** — client, codes `SANDBASE_*`,
  publication de photo (`/photo/:token`, sonde, `SBASE_PUBLIC_URL`) et tests
  retirés ; `src/` ne contient plus aucune trace du nom (test d'isolation).

## 11. Environnement (Render)

| Variable | Rôle |
|---|---|
| `APIFY_TOKEN` | **la seule clé requise** — absente ⇒ 503 avant tout appel |
| `APIFY_1688_ACTOR` | optionnel (défaut `sourabhbgp~1688-scraper`) |
| `APIFY_IMAGE_ACTOR` | optionnel (défaut `topapi~image-search-1688-api`) |
| `APIFY_ALIEXPRESS_IMAGE_ACTOR` | optionnel (défaut `piotrv1001~aliexpress-image-search-scraper`) |
| `SBASE_PROVIDER` | **obsolète depuis le commit 3** — le fournisseur est unique ; la variable n'a plus aucun effet |

Vérification en direct (clé du propriétaire, sur le serveur publié) :

```bash
curl -s -X POST "https://topapi--image-search-1688-api.apify.actor/search" \
  -H "Authorization: Bearer $APIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"imageBase64":"<base64 ≤ 900 Ko>","maxResults":5,"excludeAds":true}'
# attendu : {"ok":true,"count":5,"items":[…],"meta":{…}}
```

Vérifié **en direct** le 26/11/2026 (serveur du propriétaire) : photo 1688
(31 s, 20 résultats, 0,0040 $ affichés). Ce qui reste **non vérifié en direct** :
le run recherche, la fiche, et l'actor image AliExpress — tout le reste est
verrouillé par les tests racine (47) et les tests mobile (unitaires + UI).

**SHEIN (reporté, décision factuelle)** : l'actor `factual_biscotti/shein-visual-search-actor`
est marqué **« Under maintenance »** par son développeur, la documentation
précise que **hors des États-Unis la protection anti-bot bloque souvent la
recherche visuelle** (CAPTCHA), et son mode d'entrée « raw bytes » n'est pas
clairement utilisable via API. Coût 5 $/1000 résultats. À réintégrer dès que
l'actor est fiable — un entrée dans `SBASE_IMAGE_SOURCES` + un traducteur
+ des tests suffisent.
