# AYROVI·X — Rapport de phase P2.1 (consolidation des listes et du descripteur)

**Commit :** `57fe0bb` + le correctif de vignettes et de rendu partagé de ce tour.
**Baseline respectée :** 471 tests → **477 tests / 45 fichiers, tous verts**. Zéro test supprimé, zéro test existant modifié pour « passer ».
**Bases de données :** aucune migration, aucun `DROP`/`TRUNCATE`/`ALTER` destructif.

---

## 1) Ce que la phase devait régler

P2.0 avait livré un moteur (`DataTable` + `ResourceWorkspace` + descripteurs serveur) mais **onze manières de dessiner une liste** coexistaient encore : 8 tables `<table>` écrites à la main dans des écrans, plus le moteur. P2.1 ferme ça : **une seule implémentation par concept**, et le descripteur serveur commence à piloter les écrans existants.

## 2) Ce qui a été fait

### 2.1 Le moteur absorbe les cas particuliers (au lieu qu'on les duplique)

Capacités ajoutées à `client/src/admin/components.tsx` — toutes **optionnelles**, donc aucun appelant existant n'a changé de comportement par accident :

| Capacité | Résout |
|---|---|
| `reorder={{ onReorder(from, to) }}` + colonne de préhension + `tr.is-drag-over` | le glisser-déposer de `TrustBarPage` (et de toute liste à ordre manuel) |
| `rowActions[].show(row)` / `.disabled(row)` / `.reason(row)` | Publier/Dépublier conditionnels, actions inertes **motivées** par infobulle |
| `rowActions[].hideLabel` | garder un bouton icône seul (listes denses) sans perdre `title`/`aria-label` |
| `columns[].label: ReactNode` | en-têtes à icône du studio stories |
| `rowKey`, `rowClassName`, `minWidth`, `error` + `onRetry`, `caption`, `density`, `selection: string[]`, `bulkActions` | journaux sans id, lignes grisées, listes larges, erreur de chargement, légende, densité, sélection multiple |

### 2.2 Les 8 tables artisanales sont parties dans le moteur

| Écran | Avant | Après |
|---|---|---|
| `TrustBarPage` | `<table>` + `onDrop`/`dragIndex`/`useRef` à la main | `DataTable` + `reorder`, `rowClassName` pour les lignes muettes, actions `hideLabel` |
| `SocialAdminPage` ×2 (publications, reels) | deux `<table>`, deux suppressions avec `confirm()` en ligne | `DataTable` (`minWidth` 640/700) + un seul helper `removeWithConfirm()` |
| `StoriesStudio` | `<table>` 8 colonnes, compteurs non alignés, ternaires d'action dans le JSX | `DataTable` `minWidth` 860, `admin-cell-num`, `show`/`disabled` par ligne |
| `HeroVisualsPage` | `<table>` avec deux `<input type="date">` dans une cellule | `DataTable` (dates conservées dans la colonne Planification), actions via `rowActions` |
| `AiLabPages` ×3 (OCR, runs, journal IA) | trois `<table>` | `DataTable` avec `rowKey` indexé, action « Évaluer » conditionnelle |

**Preuve de clôture :** `grep -rn "<table" client/src/admin --include=*.tsx` ne renvoie plus que
`ArrivalIngestionPage.tsx` (`arrival-product-table`, **gelée** en P2.1 par contrat) et
`components.tsx` (le moteur lui-même). Cette assertion est un **test** (`ne laisse aucune liste dessinée à la main hors du moteur (gel P2.1)`) avec allowlist explicitement motivée, plus un test vérifiant qu'aucune classe `admin-table` n'apparaît hors du moteur.

### 2.3 Le descripteur pilote réellement les écrans

- **Les 9 écrans du moteur** (`ContentPage`) trient maintenant selon `descriptor.columns[].sortable`, avec `sort`/`direction` transmis à l'API — le serveur ne valide ces noms que contre `config.sortable`, donc aucun nom de colonne inventé n'atteint le SQL. Elles affichent aussi **erreur + réessai** au lieu d'un simple toast. Sans descripteur, l'écran rend exactement ce qu'il rendait avant.
- **Une seule implémentation du rendu de cellule :** `ContentPage` délègue sa cellule « entité » à `renderCell('entity', …)`, le rendu du framework. La structure canonique (`.admin-entity > span` qui porte la vignette 42×42) est appliquée partout — c'était le défaut visuel introduit par les premières conversions (image hors `span` = taille intrinsèque) et il est corrigé dans `SocialAdminPage`, `StoriesStudio` et `renderCell`.
- **Le bandeau « doublon / legacy » devient une action :** `BackOfficeShell` résout `canonicalOf`, retrouve la surface canonique **dans la navigation du rôle courant** et propose « Ouvrir la surface canonique ». Si le maître n'est pas navigable pour ce rôle, le bandeau reste informatif et aucune impasse n'est proposée.
- **Catalogue :** vérifié, rien à inventer — `CataloguePages.tsx` lit déjà `/catalogue/meta`, qui **reprend les permissions centrales** (`can('product','create'|'update'|'approve')`, vocabulaire de statut fourni par le serveur). Les descripteurs `catalogue-*` de P2.0 pointent la même matrice ; il n'y a pas deux sources de vérité à recoudre.

## 3) Gates passés (sorties réelles)

| Gate | Commande | Résultat |
|---|---|---|
| Types client | `npx tsc -p tsconfig.client.json --noEmit` | 0 erreur |
| Types serveur (tests inclus) | `npx tsc --noEmit` | 0 erreur |
| Suite complète | `npm test` | **45 fichiers / 477 tests passés** |
| Build de production | `npm run build` | ok |
| Arbre frais au commit | `git worktree add -f … 57fe0bb` + build + 3 gates | build ok, tsc 0/0, **477 verts** |

Le gate client est bien `tsconfig.client.json` (celui qui couvre `client/src`), pas `cd client && npx tsc --noEmit`.

## 4) Écarts assumés, et ce qui reste ouvert

- **`ArrivalIngestionPage` : hors périmètre, gelé.** Sa table `arrival-product-table` et `arrival-ingestion.css` (333 l.) ne sont pas touchés, comme engagé en P2.0. C'est la seule exception de la garde, écrite avec sa raison dans le test.
- **Deux styles de boutons d'action de ligne coexistent encore** : `.admin-row-actions button` (écrans métier non migrés : catalogue, shop, CMS) et `.admin-row-actions .admin-table-action` (moteur). Le moteur est habillé ; la réconciliation des libellés/boutons des écrans métier est un item de **P3/T2** (primitives), pas de P2.1.
- **Vignettes : 36 px → 42 px** dans les listes social/stories, parce qu'elles utilisent désormais la classe canonique `.admin-entity > span`. C'est le prix volontaire d'un seul habillage ; aucun autre écran ne change.
- **`ResourceWorkspace` n'est pas encore le rendu d'un écran métier.** Les 9 ressources « framework » restent servies par `ContentPage`, et `ResourceWorkspace` par les tests. Basculer un écran réel changerait ses libellés et son ordre de colonnes (le descripteur dérive les colonnes de `config.fields`, `ContentPage` a 3 colonnes choisies) — c'est un changement **visuel sur écran vivant**, donc planifié en P3/T2 avec le thème, quand les écrans seront de toute façon retouchés. En échange, P2.1 a supprimé la vraie duplication qui comptait : **le rendu de cellule est unique** et **le tri vient du descripteur**.
- **`UNKNOWN` hérités, non résolus par cette phase :** `UNKNOWN-002` (deux gardes legacy défectueuses, signalées en P2.0) et `UNKNOWN-006` (propriété de `crm_stores`, bloque P4.1, pas P2.1).

## 5) Ce que P2.2 (Stock) peut consommer immédiatement

1. `DataTable` avec tri, sélection, actions motivées, réordonnancement, erreur/réessai → lists `inventory_stock_items`, `inventory_movements`, `inventory_stocktakes`.
2. Descripteur serveur (`src/back-office/resources.ts`) + `canonicalOf` + `navlessReason` → déclarer `inventory:*` sans inventer de permission.
3. `writeAuditEvent()` + `AuditTrailPanel` déjà branchés sur `erp_events` → chaque mouvement de stock tracé sans 2ᵉ journal.
4. Garde `back-office-shell.test.tsx` : si une liste de stock est dessinée à la main, la suite rouge — la règle est mécaniquement tenue.
