# Rapport P2.0 — Back Office Shell + Resource Framework

Phase : **P2.0** (fondation du back office unifié). commits `f39808d` + `d4c180b`, branche `main`, **poussés** (`origin/main = d4c180b`).
Périmètre revendu : **une seule coquille sous `/admin`** + **un framework de ressources**, pas un nouveau domaine métier, pas une refonte écran par écran.

---

## 1. Verdict

**P2.0 est terminé et vert.** `/admin` est maintenant rendu par `BackOfficeShell`, dont la navigation, les domaines, la recherche, la palette, les capacités et le statut des modules viennent d'**un registre serveur unique** (`src/back-office/`). Les 39 écrans existants rendent leur contenu **inchangé** ; aucun n'a été réécrit, aucun n'a été supprimé. Aucun deuxième moteur de table, de formulaire, de permission, d'audit ou de recherche n'a été introduit — les primitives existantes ont été **enrichies par props optionnelles**.

## 2. Ce qui était demandé, ce qui a été fait, ce qui ne l'a pas été (volontairement)

| Demandé | Fait |
|---|---|
| Un seul back office, coquille unique | ✅ `BackOfficeShell` (sidebar, header, workspace, cloche, profil, palette, recherche) |
| Navigation + domaines pilotés par le registre | ✅ `src/back-office/navigation.ts` + `src/erp-core/modules.ts` |
| Abstraction `Resource` (LIST→ASSIGN gated) | ✅ descripteurs + `GET /back-office/resources/:key` |
| Consolidation DataTable / Form / Search / Filters / Pagination / Modal / audit / notifs | ✅ enrichies dans `components.tsx`, déplacées dans `back-office/resource-ui.tsx`, `NotificationsBell.tsx` |
| Recherche globale unique + palette permission-aware | ✅ `src/back-office/search.ts` + `BackOfficeSearch.tsx` |
| Catalogue (P2.1) et CMS dans la coquille, auth, perms, audit, nav, search | ✅ déclarés comme ressources (`catalog.*`, `cms.*`, `content.*`) |
| **Pas fait, délibérément** | basculer les 9 écrans `ContentPage` sur `ResourceWorkspace` ; retirer les surfaces legacy `products`/`brands` ; brancher la cloche sur l'outbox ERP ; créer des tables de « vues » utilisateur. Chacun est **documenté** (§12, §17, §19) au lieu d'être fait à moitié. |

## 3. Inspection préalable (rien n'a été supposé)

270 routes admin/CRM/catalogue listées, 62 691 lignes parcourues, 88 tables DDL, 421 tests existants relevés comme **gels de comportement** (dont `ayrovi` 41, `erp-core-foundation` 31, `catalogue-foundation` 48, `admin-read-gates` 14, `ayrovix` 25, `public-upload-policy` 9), 199 lignes `erp_role_permissions`, 100 sites d'appel de `writeAuditEvent()`. Chaque colonne citée dans le framework a été vérifiée par `PRAGMA table_info` **avant** d'être écrite (trois cartes de colonnes écrites à la main se sont révélées fausses : `orders` n'a pas de `customer_name`, `crm_arrivals` n'a que 6 colonnes, `erp_employees` a `employee_code`, pas `code`). Chaque préfixe d'API d'un descripteur est **prouvé littéralement** dans `src/admin/routes.ts` par l'auto-test du framework (trois préfixes inventés — `/lens-requests`, `/pricing-config`, `/interface-config` — ont été corrigés en `/ayrovix-reviews`, `/pricing`, `/settings`).

## 4. Fichiers créés

- `src/domain/statuses.ts` (94 l.) — vocabulaires de statut partagés (`ORDER_STATUSES`, `PAYMENT_STATUSES`, `CATALOGUE_*`, `SUPPORT_STATUSES`, `AYROVIX_REVIEW_STATUSES`) + `statusTone`/`statusLabel`. Additif : aucun code existant n'a été déplacé hors de son fichier.
- `src/back-office/resources.ts` (642 l.) — **39 descripteurs** (9 dérivés du moteur `ResourceConfig`, 30 déclarant les écrans existants), `RESOURCE_ACTIONS`, `ACTION_METHOD`, `BACK_OFFICE_DOMAINS`, `backOfficeSections()`, `registerFrameworkResources()` idempotent.
- `src/back-office/navigation.ts` (132 l.) — `canSeeSection()`, `backOfficeNavigation()` (groupes, éléments triés, `roadmap`, `counts`).
- `src/back-office/search.ts` (126 l.) — 8 sources allowlistées, `MAX_PER_SOURCE=5`, aucune écriture.
- `src/back-office/routes.ts` (255 l.) — `GET /api/admin/back-office/{context,navigation,resources,resources/:key,search,self-test}`.
- `client/src/admin/back-office/framework.tsx` (258 l.) — provider unique, cache module-level des capacités, **une** requête partagée par endpoint, `sectionFromAdminPath()`.
- `client/src/admin/back-office/BackOfficeShell.tsx` (243 l.), `BackOfficeSearch.tsx` (152 l.), `ResourceWorkspace.tsx` (214 l.), `resource-ui.tsx` (87 l.), `NotificationsBell.tsx` (45 l.), `back-office.css` (101 l.).
- `tests/back-office-foundation.test.ts` (26 tests), `tests/back-office-shell.test.tsx` (24 tests).

## 5. Fichiers modifiés (tous additifs ou par déplacement)

- `src/admin/routes.ts` (+17 l.) : `export interface ResourceConfig` / `export const resources` (les tests P1/P2.1 lisent ce fichier et y assertent des chaînes : la map **reste** là où elle est attendue), `router.use('/back-office', createBackOfficeRouter(db))`, `registerFrameworkResources(resources)` au montage.
- `client/src/admin/components.tsx` (+130 l.) : `DataTable` enrichi — tri, sélection, actions de ligne, actions groupées, erreur + réessai, densité, légende, colonnes masquables. **Signature rétro-compatible** : les 23 appels existants (`grep -rn "<DataTable" client/src/admin` hors `back-office/`) produisent le même markup qu'avant ; les capacités nouvelles sont opt-in.
- `client/src/admin/admin.css` (+14 l.) : styles des nouvelles capacités du moteur de table (`.admin-table-sort`, `.admin-table-bulkbar`, `.admin-table-caption`, cellules sélection/actions, densité compacte).
- `client/src/admin/AdminApp.tsx` (−129 l.) : suppression de la copie client de la liste de navigation (`navGroups`), du formulaire, de la cloche, du dictionnaire de libellés et des formatteurs — **déplacés**, pas perdus ; la chaîne de rendu devient `renderSection(ctx)` ; `ContentPage` applique la matrice centrale.

## 6. « Rien n'est supprimé » — preuve

`git diff --stat 06fdd03..HEAD` → **18 fichiers, +3 274 / −115**. Les 115 lignes retirées sont exactement : les 38 lignes de `navGroups`, 16 de `ResourceForm`, 13 de `NotificationsBell`, 10 de `labels`, 8 de `formatMoney`/`formatDate`/`titleFor`, 4 types, 2 `options`/`nowPlus`, 11 de l'ancien `AdminShell` — chacune reparaissant dans le module canonique. Le test `« le client ne réintroduit aucune copie de cette liste »` vérifie l'absence de `const navGroups`, et la parité de navigation est figée par **snapshot des 37 entrées legacy** (le test ne dépend plus d'une copie côté client, donc il est plus fort qu'avant, pas plus faible).

## 7. Source de vérité de la navigation

`backOfficeNavigation(db, role)` : un item n'existe que si un **descripteur** existe, que son module a une **permission** satisfied et que le module n'est pas `planned`. Aucune liste n'est écrite dans le client (test dédié). Un module du registre ERP sans écran (ex. `accounting`, `shipping`) apparaît dans `roadmap`, rendu en section « Modules à venir » **non cliquable** — jamais comme une route.

## 8. DomainSwitcher

Quatre domaines (`ERP`, `COMMERCE`, `CRM`, `CONTENT`) + « Tous », rendus depuis `context.domains` avec le compteur `permis/total` du rôle (ex. `Commerce 2/3`) — la seule source étant `moduleRegistryPayload()`. Choisir un domaine **filtre** la sidebar, il n'ajoute ni ne cache aucune donnée.

## 9. Sidebar dynamique

Groupe + ordre + icône viennent du descripteur (`nav.group`, `nav.order`, `nav.icon`, rendu par le sprite partagé `QatafoIcons`, aucun composant par écran). Deux étiquettes informatives, jamais des décisions : `legacy` (module `status==='legacy'`) et `doublon` (`canonicalOf`). Le drop-target « مجلتي » depuis l'onglet publications est conservé à l'identique.

## 10. Permissions — aucun nouveau système

`module:action:resource:scope` reste décidé par `src/erp-core/permissions.ts::can()` sur `erp_role_permissions`, **plus** le plancher legacy : si la chaîne legacy de l'écran autorise, l'action est autorisée (`legacy-role` gagne). Le registre des modules reste **figé à 21 entrées** : `ai.knowledge` est donc rattaché à `settings` pour la navigation et garde `ai:*` pour l'autorisation, grâce à un champ `permissionModule` du descripteur — un écart de nommage documenté plutôt qu'une extension illégale du registre. **Aucun grant ajouté** : `erp_role_permissions` est toujours à 199 lignes, verrouillé par `tests/catalogue-foundation.test.ts:462`. Une action sans clé ERP déclarée renvoie `null` = « le framework ne tranche pas », **jamais** « refusé » (test dédié : une capacité ne peut pas contredire la route que le bouton appelle).

## 11. Abstraction `Resource`

Huit actions — `list`, `view`, `create`, `edit`, `delete`, `approve`, `export`, `assign` — mappées sur les méthodes HTTP (`ACTION_METHOD`) et sur une permission par action. Le descripteur porte aussi les colonnes (tri, alignement, rendu `entity|money|datetime|code|status`, masquage par défaut), les champs (type, requis, options, `readonly` pour les champs dérivés), le statut (champ + vocabulaire partagé), l'API (`prefix`, `kind`), l'audit (`module`, `resourceType`), `canonicalOf`, `navlessReason`. Un module futur déclare ce descripteur et obtient liste + formulaire + détail + journal **sans écrire de JSX**.

## 12. UnifiedDataTable — un seul moteur

Capacités ajoutées par props **optionnelles** uniquement : `sort/onSortChange` (avec `aria-sort` réel sur l'en-tête), `selectable/selection/onSelectionChange`, `rowActions` (bouton inerte + `title` expliquant le motif du refus — jamais un 403 après clic), `bulkActions`, `error/onRetry`, `emptyAction`, `density`, `caption`, `column.hidden`. Preuve de non-régression : le test « garde le markup d'origine pour les appels existants » assert `not aria-sort`, `not checkbox`, `not bulkbar`, `not <caption>` sur un appel ancien ; `ResourceWorkspace` passe par le moteur (`expect(workspace).not.toContain('<table')`).
**Reste à consolider (documenté, non fait)** : 8 écrans dessinent encore un `<table className="admin-table">` à la main (`AiLabPages.tsx` ×3, `SocialAdminPage.tsx` ×2, `HeroVisualsPage.tsx`, `TrustBarPage.tsx`, `StoriesStudio.tsx`). Les basculer est un travail écran par écran (§20 « pas de refonte globale ») — c'est le premier item de P2.1.

## 13. ResourceForm / formulaires

Un seul formulaire déclaratif, dans `back-office/resource-ui.tsx`, branché sur `FieldDefinition` ; `fieldDefinitionsFor(descriptor)` projette les champs serveur vers ce même formulaire (test : `full`/`readonly`/`options` conservés). Aucun écran n'a son propre formulaire. Deux écarts **assumés et commentés** : `ArrivalIngestionPage` (fichier gelé) et `MagazineAgentPage` (dates en `ar-TN`) gardent leur formatteur local, car l'unifier changerait l'affichage — ce n'est pas une décision de coquille.

## 14. Recherche globale et palette

**Une** recherche pour tout le back office, dans l'entête ; aucun écran n'a ajouté la sienne (`search.ts` : 8 sources, allowlist, `MAX_PER_SOURCE=5`, terme court = aucune requête, résultat = **deep link existant**, jamais une route inventée). La palette ⌘K (ou Ctrl+K) liste les écrans rendus visibles par la navigation serveur et n'ajoute une commande « Créer » que si `capabilities.create !== false`. Deux rendus tests : une entrée refusée disparaît de la palette, alors qu'elle reste **visible mais grisée** dans la table — la règle exacte demandée (§12).

## 15. Audit — un seul rédacteur

Aucun `INSERT INTO audit…` n'a été écrit dans le module `src/back-office/` : `writeAuditEvent()` (+ `auditContextFromRequest`) de `src/erp-core/audit.ts` reste l'unique plume, et un test assert que le framework **n'écrit dans aucune table métier**. Le panneau `AuditTrailPanel` ne fait que **lire** `GET /api/admin/core/audit?resourceType=&resourceId=`. Une recherche globale est une lecture de données clients : elle produit **une** ligne `ACCESS` / `BACK_OFFICE` avec le terme borné, jamais le contenu des résultats.

## 16. Notifications et identité employé

La cloche est déplacée (markup et API `/notifications` identiques) et vit dans la coquille, plus dans `AdminApp`. Le menu profil affiche le compte **et** la fiche employée rattachée (`EMP-…`, libellé, succursale) via `resolveEmployee()` — ou un message explicite « aucune fiche employée rattachée ». Le passage de la cloche sur l'outbox ERP (`erp_notification_deliveries`) est une décision de phase ultérieure : il n'a pas été fait, et il n'y a pas de troisième canal.

## 17. Catalogue P2.1, CMS, `meta.capabilities`

Le catalogue (`catalog.product|category|brand`, API `/api/admin/catalogue/*`) et les 9 écrans CMS (`cms.*`, `content.*`) sont **dans** la coquille : mêmes auth (`requireAdmin`), mêmes permissions (`can()`), même audit, même navigation, même recherche, mêmes primitives d'UI. Les capacités remontent par `capabilitiesFor()` exactement comme `meta.capabilities` du module catalogue, et `ContentPage` les consomme : `capability?.edit ?? canWrite` / `capability?.create ?? canWrite` — donc **legacy gagne tant que le framework n'a pas tranché**, et aucune page n'est bloquée par un méta-endpoint indisponible (bandeau + réessai, page rendue : test dédié).

## 18. Doublons et `arrival-ingestion`

`products` et `brands` legacy sont **marqués** `canonicalOf` (badge « doublon » dans la sidebar, bandeau nommant le maître canonique sur l'écran) et conservés : aucun retrait, car les deep links et les usages internes ne sont pas tous prouvés sûrs. `arrival-ingestion` n'a été **ni réécrit ni branché autrement** : son écran, son CSS et ses routes sont intouchés ; le framework le déclare uniquement comme ressource navigable (`crm.arrival-ingestion`). L'ordre imposé — généraliser → identifier le canonique → migrer → retirer — est respecté, et le « retirer » n'est pas encore à l'ordre du jour.

## 19. Compatibilité des liens, des API et des données

- `?section=…` et `?request=…` (et `tab=orders` depuis une notification) : comportement conservé à l'identique, `pushUrlPreservingNavigation` + `popstate` rejoués dans la coquille, section inconnue/non permise retombant sur `dashboard` comme avant.
- **Additif** : la forme chemin `/admin/<section>` initialise maintenant la même variable (`sectionFromAdminPath`) ; `?section=` garde la priorité ; aucune route serveur nouvelle (le fallback SPA servait déjà `/admin/*`). `/admin/cms` n'a jamais été une section (les écrans CMS sont `news`, `hero-visuals`, `stories`, `promotions`, `ticker`, `brands`, `arrivals`, `magazine-agent`) — il rend le dashboard, comme avant P2.0, ce qui est dit ici plutôt que « réparé » en silence.
- **Base de données : aucune migration, aucun `ALTER`, aucun `DROP`, aucun `TRUNCATE`, aucun renommage, aucune donnée métier modifiée.** Preuve : `git diff 06fdd03..HEAD | grep -c "ALTER TABLE\|DROP TABLE\|DROP COLUMN\|INSERT INTO erp_role_permissions\|TRUNCATE"` → `0`. Les préférences de densité/colonnes sont en `localStorage` (présentationnel) ; aucune table de « vues » n'a été créée — décision différée, pas un oubli.

## 20. Gates, tests, restes, suite

| Gate | Commande | Résultat |
|---|---|---|
| Types serveur | `npx tsc --noEmit` | **0 erreur** |
| Types client | `npx tsc -p tsconfig.client.json --noEmit` | **0 erreur** |
| Build | `npm run build` | **ok** (client Vite + esbuild serveur) |
| Tests | `npm test` | **471 passed / 45 fichiers** (baseline 421 → +26 fondation serveur → +24 coquille), **0 régression** |
| Arbre frais | `git worktree add -f` sur `f39808d`, `node_modules` symliné, `npm run build` + `npm test` | **470/470**, tsc serveur et client 0 — sans `npm run build`, 4 tests échouent faute de `public/` (dossier généré, gitignoré) : condition pré-existante, pas une régression |

**Restes connus (aucun bloquant)** : `UNKNOWN-012` périmètre RH/Paie (impacte les permissions du champ employé), `UNKNOWN-002` deux gardes legacy défectueuses, `UNKNOWN-006` propriété de `crm_stores` ; plus les 8 tables manuelles de §12 et la bascule des 9 `ContentPage` vers `ResourceWorkspace`. **Prochaine étape : P2.1 Catalogue dans la coquille** (écrans catalogue du framework sur le descripteur, consolidation `products`/`brands` vers le maître canonique, puis suppression des tables manuelles) — sans nouveau domaine avant clôture de P2.0 côté recette.

 commits : `f39808d` (coquille + framework), `d4c180b` (deep links chemin) — **poussés sur `origin/main`**.
