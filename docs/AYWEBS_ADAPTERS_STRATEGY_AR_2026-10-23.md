# AYWEBs — adaptateur par boutique ou adaptateur collectif ? Décision et mise en œuvre

**Date :** 23/10/2026 — **Branche :** `arena/1cb27f4f-ayrovi-beta1`

---

## 1. La réponse courte

**Ni l'un ni l'autre, tels quels.** La bonne réponse est un **collectif + des données** :

| Ce qu'on écrit quand on ouvre une boutique | Avant | Maintenant |
|---|---|---|
| une classe d'adaptateur | 1 classe ≈ 120 lignes | **0 classe** |
| une entrée au registre | 1 objet | 1 objet (inchangé) |
| la reconnaissance de la fiche | du code dans la classe | **une ligne de données** (`productUrlPattern`) |
| le prix, la devise, le stock | lues par le serveur | **toujours la capture du client, corroborée par le serveur** |

Autrement dit : **une classe par boutique est un coût qui ne se justifie pas** pour 380 boutiques ; mais **« un collectif qui ne sait rien de personne »** ne suffit pas non plus, parce qu'il ne sait pas dire « cette page est une fiche produit ». La solution retenue : le collectif apprend **le motif d'URL de chaque boutique**, en données.

**Résultat mesurable aujourd'hui :** ouvrir une boutique coûte **une ligne** dans `CAPTURE_WAVE_1` (identité + motif), pas une classe. Les 13 boutiques de la vague 1 tournent sur **un seul** `CatalogueStoreAdapter`.

---

## 2. Pourquoi le « tout collectif » ne suffit pas

Un adaptateur ne sert pas d'abord à *lire* : il sert à **répondre à une question** que le serveur doit trancher avant de dépenser quoi que ce soit —

> « cette URL est-elle une fiche produit ? »

Sans réponse, on ne peut pas :
- activer le bouton « Ajouter » (on ne sait pas si on lit un produit ou un rayon) ;
- afficher un prix (lire un prix de rayon = devis faux) ;
- remplir la feuille de variantes.

Un collectif **sans aucune connaissance d'URL** répond « je ne sais pas » à chaque fois : il ne reste que la capture pour prouver la fiche, ce qui marche (c'est le cas de MediaMarkt chez nous) mais **coûte une capture à chaque essai**, y compris sur les pages où l'utilisateur n'aurait jamais dû appuyer.

## 3. Pourquoi « une classe par boutique » ne se justifie pas

Une classe dédiée n'apporte quelque chose que si la boutique demande **un comportement** que le collectif ne peut pas produire :

| Ce qui justifie une classe | Exemple | Fréquence |
|---|---|---|
| lecture serveur (pas de capture possible) | Amazon : le serveur sait lire `#productTitle`, le twister | rare |
| structure de variantes propre | Amazon `variation_<dim>_name` | rare |
| rendu obligatoire (page vide sans JS) | SHEIN, Temu | rare, cher |
| **le motif d'URL de la fiche** | Walmart `/ip/…`, Etsy `/listing/…` | **très fréquent (≈ 95 %)** |
| le nom, le domaine, le logo, les catégories | toutes | **données** |

Autrement dit, dans l'immense majorité des cas, ce qu'on croyait être « un adaptateur » n'est **qu'une règle de reconnaissance** : une donnée, pas un programme.

## 4. Ce qui a été mis en œuvre (23/10/2026)

### 4.1 Le motif d'URL devient une donnée du registre

```ts
{ id: 'walmart', displayName: 'Walmart', country: 'US', currency: 'USD',
  homeUrl: 'https://www.walmart.com', categories: ['marketplace'],
  productUrlPattern: '^/ip/(?:[^/]+/)?\\d+' },     // ← la seule ligne « métier »
```

- compilé par `ayWebsProductUrlPattern()` : **ancré** (`^` ajouté d'office), **borné** (120 caractères), évalué sur le **chemin seul** (les paramètres de suivi charrient des jetons opaques) ;
- motif invalide ou dégradé = **aucun motif** : la boutique retombe sur la preuve par capture (jamais un motif « à moitié appliqué ») ;
- `recognition` vaut alors `pattern`, et `/stores` le publie.

### 4.2 Trois niveaux de reconnaissance, un seul endroit qui décide

| `product_recognition` | Qui prouve la fiche | Prix |
|---|---|---|
| `url` | l'adaptateur dédié (Amazon, SHEIN, Temu, AliExpress) | capture **ou** lecture serveur selon la boutique |
| `pattern` | le **motif déclaré** ; si la page ne matche pas, la capture peut encore prouver | **capture uniquement**, corroborée |
| `capture` | la **capture structurée** seule (JSON-LD + prix corroboré + titre) | capture corroborée |
| `none` | domaine hors registre (chemin « Order with URL ») | capture corroborée |

**Le motif ne fixe jamais un prix.** `CatalogueStoreAdapter.resolveProduct()` refuse explicitement toute lecture serveur : une boutique du catalogue ne coûte aucune requête marchande et ne peut pas produire un prix inventé.

### 4.3 Le seuil de preuve reste celui d'un inconnu

Pour **toute** boutique du catalogue (`pattern` ou `capture`), la capture doit être **corroborée** : JSON-LD publié par le marchand, **ou** deux sources d'accord sur le même montant. Un prix arraché au DOM tout seul est refusé (`PRICE_NOT_CORROBORATED`) — c'est la règle qui empêche un prix de publicité de devenir un devis.

### 4.4 La mesure qui tranche (et qui reste)

`GET /api/v1/aywebs/health` → `webview_capture.stats.by_store` donne, **par domaine réellement capturé** :

```
registre:walmart  { validated, accepted, rejected, acceptance_rate,
                    rejections, single_source, variant_groups_seen }
catalogue:ebay    { … }    ← boutique PRÉVUE mais fermée : la demande réelle
external          { … }    ← hors catalogue
```

Bornes assumées : 64 seaux max (au-delà → `autres`), 12 motifs de refus par boutique (au-delà → `autre`). Le domaine vient du **client** : la mémoire du serveur ne doit pas dépendre de son imagination.

La sonde `scripts/aywebs-store-probe.mjs` lit ces compteurs et **rend un verdict** par boutique :

| Taux d'acceptation (≥ 3 captures) | Verdict |
|---|---|
| ≥ 90 % | **COLLECTIF SUFFIT** |
| 60–90 % | **MOTIF / SÉLECTEUR À REVOIR** |
| < 60 % | **ADAPTATEUR DÉDIÉ OU FERMETURE** |
| < 3 captures | **À MESURER** (rien à trancher) |

Exemple de sortie (données de démonstration) :

```
boutique        monde      jugées  ok   taux   1 src  var.  verdict
walmart         ouverte    12      12   100 %  1      9     COLLECTIF SUFFIT
zalando         ouverte    8       7     88 %  5      7     MOTIF / SÉLECTEUR À REVOIR
                ↳ refus principal : prix d’une seule source ×1
mediamarkt      ouverte    6       2     33 %  4      0     ADAPTATEUR DÉDIÉ OU FERMETURE
                ↳ refus principal : aucun prix publié ×3
ebay            prévue     5       4     80 %  1      2     MOTIF / SÉLECTEUR À REVOIR
```

## 5. La règle de décision qui en sort

> **On n'écrit une classe que quand la mesure prouve que le collectif ne peut pas.**

Ordre d'escalade, du moins cher au plus cher :

1. **Donnée** — la boutique publie un motif d'URL stable → `productUrlPattern`, 0 classe. *(cas par défaut)*
2. **Motif + capture** — pas de motif fiable → `recognition: 'capture'`, la capture prouve. *(MediaMarkt, Cdiscount)*
3. **Sélecteur** — la page publie un prix que le crible générique rate (taux 60–90 %, refus `NO_PRICE_TEXT`/`PRICE_NOT_CORROBORATED`) → enrichir le **script de capture**, pas créer une classe : le gain profite à toutes les boutiques.
4. **Classe dédiée** — seulement si la boutique exige un comportement (lecture serveur, variantes propres, rendu JS). *(Amazon, SHEIN, Temu, AliExpress)*
5. **Fermeture** — taux < 60 % malgré 1–3, ou conditions d'utilisation hostiles → on ferme la boutique, on ne la laisse pas ouverte « au cas où ».

## 6. Ce que ça change concrètement pour la suite

| Étape | Coût | Décidé par |
|---|---|---|
| ouvrir 20–30 boutiques de plus | ~1 ligne chacune | mesure ≥ 90 % sur la vague 1 |
| enrichir la lecture (prix, variantes) | 1 correctif de script | refus dominants de la sonde |
| écrire un adaptateur dédié | 1 classe + tests | taux < 60 % persistant |
| fermer une boutique | 1 ligne | taux < 60 % + TOU hostiles |

**Contrainte de départ qu'on garde :** aucune boutique n'obtient `purchase` ni `tracking` ; l'achat reste en **revue humaine** (`MANUAL_REVIEW`) tant qu'aucune intégration de commande n'existe.

## 7. Vérifications

`tests/aywebs-catalogue-wave.test.ts` — **31 tests** :
- reconnaissance par motif : fiche reconnue, rayon/ recherche/ panier refusés, pour **11 boutiques** ;
- un motif dégradé est refusé (`(`, 200 caractères) ;
- motif déclaré ⇒ `isProductPage` vrai **mais** `resolveProduct` refuse toujours (aucune lecture serveur) ;
- motif absent ⇒ aucune fiche reconnue (MediaMarkt), la capture reste le seul chemin ;
- motif qui ne matche pas ⇒ repli sur la preuve par capture.

`tests/aywebs-capture-store-stats.test.ts` — **13 tests** : attribution (`registre:` / `catalogue:` / `external` / `url_invalide`), pas de double comptage d'un refus, bornes mémoire et motifs, cohérence global ↔ par boutique, taux réel.

Ensemble AYWEBs : **25 fichiers, 378 tests** verts (root) ; application mobile : **775** verts.

## 8. Ce qu'il reste à faire (et qui ne se décide pas sans chiffres)

1. Déployer, puis relever `stats.by_store` sur de vraies visites (Walmart, Zalando, MediaMarkt, OTTO).
2. Vérifier les 11 motifs sur **deux fiches réelles chacun** — un motif est une hypothèse tant qu'il n'a pas rencontré la boutique. Un motif faux coûte **un appui inutile**, jamais un prix faux (la capture tranche).
3. Ouvrir la vague 2 par données, en suivant les verdicts de la sonde.
