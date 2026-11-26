# S Base — recherche marchande (SandBase) + photo

**Date** : 19/11/2026 (v2 le même jour) · **Portée** : `apps/mobile` + `src/sbase`
**Statut** : v2 — **un seul champ** (mot-clé **ou** photo), résultats groupés par boutique, filtre par boutique

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
