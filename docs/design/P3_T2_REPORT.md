# P3 / T2 — la couche des primitives du back office

Date : 2026-09-06. Commits : `2efd224` (déplacement outillé), `72f140e` (extractions + gardes).
Base de départ : `bf1e154`. Périmètre : `/admin` uniquement (décision D-02 de la session).

---

## 1. Ce que le plan demandait, et où on en était

> `client/src/design/` doit cesser d'être un coin de quelques composants et devenir la couche des
> primitives ; le moteur doit les réexporter au lieu de les redéfinir ; la façade publique du moteur
> reste le point d'entrée des écrans.

État mesuré avant ce travail :

| fait | valeur mesurée |
|---|---|
| fichiers dans `client/src/design/` | 3 (`Button.tsx`, `AppHeader.tsx`, `tokens.css`) |
| `client/src/admin/components.tsx` | 334 lignes, **19 définitions exportées** (le moteur définissait ses propres primitives) |
| écrans dans `client/src/admin/*.tsx` | 19 |
| motifs écrits à la main dans les écrans | 6 interrupteurs, 3 cases à cocher, 3 pastilles, 2 `CardTitle` **identiques caractère pour caractère** (+3 en-têtes de carte recopiés dans AdminPricingPage), 2 bandeaux de chiffres (Stock, Achats) |
| `admin/admin.css` | 1253 lignes, 0 littéral de couleur (hérité de T1-a/T1-c/T1-d/C5) |

## 2. Ce qui a été fait

### 2.1 Le déplacement (commit `2efd224`)

`scripts/design-primitives-move.cjs` découpe `components.tsx` au niveau zéro d'accolades, écrit un
bloc par primitive dans `client/src/design/admin/`, et recalcule les en-têtes d'import par usage réel.
Sortie mesurée : **20 blocs de haut niveau, 20 rattachés, 0 non rattaché, 16 fichiers visés,
20 déclarations**. Aucune ligne n'est retapée — c'est ce qui rend le déplacement vérifiable.

`components.tsx` devient la **façade** : 31 lignes, 22 réexports, **0 définition**. Les 19 écrans et
le framework (`ResourceWorkspace`, `resource-ui`, `framework`) gardent leurs imports
`../components` : aucun appel d'écran n'a été modifié par ce commit.

`scripts/design-primitives-verify.cjs` rejoue le découpage sur `git show bf1e154:…` et exige que
chaque bloc se retrouve mot pour mot dans la nouvelle couche : **20/20 blocs identiques** (résultat
au moment du déplacement ; après les extractions de 2.2, le même outil rend 19/20 — le bloc
`DataTable` est le seul que T2 modifie volontairement, et son rendu est prouvé par test, pas par
texte).

### 2.2 Les six extractions (commit `72f140e`)

Chaque primitive n'est créée que si le motif existe déjà **en double** dans le code vert. Le markup
est recopié, pas réinventé.

| primitive | remplace | sites |
|---|---|---|
| `Switch` | `<button className={`admin-switch ${on ? 'is-on' : ''}`}>` | 6 (HeroVisualsPage, HomeSectionsPage, InterfaceStudio ×2, LensSectionPage ×2, ResourceForm) |
| `Toggle` | `<label className="admin-toggle">` + checkbox | 3 (TrustBarPage) |
| `Badge` | `<span className={`admin-badge ${… ? 'is-success' : 'is-warning'}`}>` | 3 (AdminApp) |
| `CardTitle` | 2 définitions **identiques** + 3 en-têtes écrits à la main | 2 + 3 (AdminApp, ErpCorePages, AdminPricingPage) |
| `MetricStrip` | le bandeau de chiffres dupliqué Stock/Achats | 2 définitions, 2 écrans |
| `TableCell` | le calcul de classe de cellule, qui vivait dans `DataTable` | 1 (prolonge « un seul rendu de cellule », P2.1) |

Les quatre écrans qui redéfinissaient `const PageHeader` pour fixer leur `eyebrow` de domaine
(CataloguePages, ErpCorePages, InventoryPage, PurchasingPage) portent maintenant un nom de module —
`CatalogueHeader` / `ErpHeader` / `StockHeader` / `PurchasingHeader` — et une seule ligne de
délégation vers la primitive. Le nom de la primitive n'est plus ombré, le paramètre `eyebrow` n'est
plus amputé par un type local, et le markup `admin-page-header` n'existe qu'à un seul endroit.

Résultat : `client/src/design/admin/` = **22 fichiers, 613 lignes, 0 littéral de couleur** ;
12 écrans touchés ; `+464/−93` sur `72f140e`, `+784/−339` sur `2efd224`.

## 3. Les gardes, et la preuve qu'elles mordent

`tests/design-primitives.test.tsx` — **41 tests** :

1. une primitive = **une** définition, et elle est dans `design/admin/<Nom>.tsx` (22 noms vérifiés) ;
2. la façade ne définit rien (`export const|function|interface|type|default` absent, aucun `import`)
   et ses réexports sont **en miroir exact** des fichiers du répertoire ;
3. le moteur ne redéfinit aucune primitive (aucun écran ne porte `const <Primitive>: React.FC`) ;
4. les écrans passent par la façade : aucun import direct de `design/admin/*` ;
5. aucune couleur littérale dans la couche primitives ;
6. toute classe rendue par une primitive est habillée par `admin.css`, exceptions nommées avec leur
   motif (voir §4.1) ;
7. contrat de markup exact par primitive (26 cas rendus puis comparés chaîne à chaîne) ;
8. **égalité de rendu** entre la forme manuscrite remplacée et la primitive (comparaison insensible
   à l'ordre des attributs, parce que React pose des propriétés, pas du texte) ;
9. l'inventaire des motifs restants est **un chiffre à ne pas faire grossir** (`admin-tabs` : 1 ;
   `admin-metrics` hors primitive : 1 ; porteurs du nom `Button` : 2, un par couche).

Mutation test, sur l'arbre de travail puis réverté : réinjecter un `admin-switch` à la main, une
couleur dans `Switch.tsx`, un `const CardTitle` local, ou un réexport dupliqué dans la façade fait
échouer **quatre gardes distinctes, chacune nommant son objet**.

Gardes héritées adaptées à la nouvelle géographie (`tests/back-office-shell.test.tsx`) : le `<table>`
du moteur est cherché dans `client/src/design/admin/DataTable.tsx`, la liste des exceptions reste
nommée avec sa raison (ArrivalIngestionPage, gelé), et la règle « la façade ne définit rien » s'y
ajoute. Elles mordent : les deux tests échouaient avant l'adaptation, et passent après.

## 4. Ce qui reste ouvert, mesuré

### 4.1 F-3 — deux classes rendues sans aucune règle CSS

- **WHERE** : `client/src/design/admin/EmptyState.tsx` (`admin-empty`), `ImageUploader.tsx`
  (`admin-image-uploader`) ; aucune occurrence de `.admin-empty` / `.admin-image-uploader` dans les
  8 feuilles CSS de `client/src`.
- **WHY** : antérieur à P3 — les composants ont été écrits avec des classes jamais stylées ;
  l'absence de style rend le composant dépendant du contexte (les `<h3>`/`<p>` héritent).
- **IMPACT** : les états vides du back office ne sont pas designés ; le conteneur de l'uploader
  n'a ni espacement ni bordure propres.
- **DEPENDENCIES** : T5 (états vides en SVG, structures de chargement) — corriger ici reviendrait à
  faire du design pendant un déplacement de code.
- **RECOMMENDED SOLUTION** : dessiner les deux motifs en T5, puis retirer les deux noms de
  l'allowlist du test de couverture CSS (la liste ne peut que se raccourcir).
- **PRIORITY** : P2 (visuel, non bloquant).

### 4.2 Aucun composant inventé

Le plan listait ~18 noms (Tabs, Switch, Tooltip, Avatar, Skeleton…). Sont créés **seulement** ceux
dont la duplication était mesurée (Switch, Toggle, Badge, CardTitle, MetricStrip, TableCell) plus
les 16 déplacés. Ce qui manque de porteur n'est pas écrit :

- `Tabs` : un seul `admin-tabs` (CataloguePages) ; les deux autres jeux d'onglets
  (`arrival-customer-modes`, `bo-domains`) ont des classes et une sémantique propres → choisir un
  seul motif est une **décision de design**, pas un déplacement : reporté en T4/T5.
- `Skeleton` : n'existe nulle part ; le plan le met en T5 (remplacer « Chargement… »).
- `Tooltip`, `Avatar` : 0 implémentation — `title="` est utilisé 78 fois en inline, ce qui est un
  choix d'accessibilité à traiter avec le focus (T5), pas un doublon à extraire.

### 4.3 Deux `Button`, un par couche

`client/src/design/Button.tsx` (Tailwind, `ay-runtime-button--*`, 2 porteurs publics déclarés +
`AppHeader`) et `client/src/design/admin/Button.tsx` (classes `admin-button--*`). Les fusionner
changerait le rendu du storefront, hors de la portée arrêtée pour P3 (D-02). La garde §3.9 **compte**
les porteurs et refuse un troisième ; l'unification est une décision de la couche publique (T4).

## 5. Gates (sur l'arbre final, et sur chaque commit isolé)

| gate | `2efd224` seul | `72f140e` seul | arbre final |
|---|---|---|---|
| `npm run build` | ✓ 863 ms | ✓ 868 ms | ✓ 916 ms |
| `npx tsc --noEmit` | 0 | 0 | 0 |
| `npx tsc -p tsconfig.client.json --noEmit` | 0 | 0 | 0 |
| `npx vitest run` | **562** tests (baseline intacte) | **603** tests (49 fichiers) | **49 fichiers / 603 tests** |
| `python3 scripts/design-token-equivalence.py --rev bf1e154` | — | — | 8387 comparaisons, **0 écart non consenti** |
| `node scripts/design-primitives-verify.cjs --rev bf1e154` | 20/20 | 19/20 ( DataTable, volontaire) | idem |

`admin.css` n'a pas bougé d'un octet (aucune feuille CSS touchée par T2) : `git diff` sur
`admin.css` et `tokens.css` entre `bf1e154` et `72f140e` est vide.

## 6. Ce que ça change pour la suite

- T3 (typographie et densité) travaille maintenant contre **une** liste de porteurs : les 22
  fichiers de `client/src/design/admin/`, plus `AdminApp.tsx` qui porte encore ~40 littéraux inline.
- T5 (états et affordances) a une porte toute prête : les deux classes non stylées de F-3, les
  trois « Chargement… » texte, et le `title=` d'infobulle à remplacer par un vrai tooltip au focus.
- Le garde de couverture CSS (§3.6) est l'outil qui permettra de vérifier que T5 n'a pas oublié un
  motif : sa liste d'exceptions ne fait que décroître.
