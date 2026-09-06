# AYROVI — rapport de phase P2.3 (Achats)

Commit de la phase : `281235d` (`feat(purchasing): P2.3 — fournisseurs, commandes d'achat, réceptions liées au stock`), poussé sur `origin/main`.
Contexte : `PLAN_EVOLUTION_AYROVI_P2_P5.md` §4 (ligne P2.3) et décision D-03 (Stock → Achats → thème).
Baseline entrante : 509 tests / 46 fichiers, `origin/main = 153debb`, arbre propre.

---

## 1) Livrables

**Module serveur — `src/purchasing/` (9 fichiers, ~2 040 lignes)**

| Fichier | Rôle |
| --- | --- |
| `types.ts` | Vocabulaire figé du module : actions, statuts de commande et de bon, qualités, devises, codes d'erreur, bornes matérielles. |
| `bootstrap.ts` | DDL additive (5 tables, 14 index dont 3 uniques), 3 séquences `erp_sequences`, amorçage idempotent des droits. |
| `permissions.ts` | 20 grants `ADMIN` (5 actions × 4 ressources), `requirePurchasing` = `requireAdmin` + `requireErpPermission({permissive:false})`, `canPurchasing` pour les appels non HTTP. |
| `validation.ts` | Règles serveur avant le SQL : quantités, coûts, taux, devise, qualité, emplacement, clés, références FK. |
| `audit.ts` | Verbes d'audit du moteur (`CREATE`, `UPDATE`, `STATUS_CHANGE`) + verbe métier en note (`SUBMIT`, `APPROVE`, `REJECT`, `CANCEL`, `POST`, `DISCARD`). |
| `suppliers.ts` | Fournisseurs : unicité du nom, code réservé, désactivation au lieu de suppression, agrégats lus (pas de colonnes comptables). |
| `orders.ts` | Commandes + lignes : totaux calculés à la lecture, gel après soumission, table de transitions, motif exigé pour refuser/annuler. |
| `receipts.ts` | Réceptions : **seule** voie qui mouvemente, via `recordMovement` du module Stock. |
| `routes.ts` | 27 endpoints sous `/api/admin/purchasing` (dont `/meta` et `/health`), dialecte du framework pour les trois listes. |

**Schéma — cinq tables, exactement les noms promis au plan :** `suppliers`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`. ADD ONLY : aucun `DROP`, aucun `TRUNCATE`, aucun `ALTER` destructif, aucune colonne ajoutée à une table du CRM.

**Numérotation** (via `erp_sequences`, pas de `COUNT(*)+1`, pas d'aléatoire) : `SUP-0001` (fournisseur), `PO-2026-00001` (commande, scopée par année), `RCV-2026-00001` (bon de réception).

**Raccord ERP :** `purchasing` passe de `planned` à `active` dans le registre (`apiPrefix: '/purchasing'`, `adminSection: 'purchasing'`) ; ressources déclarées dans `MODULE_RESOURCES` (c'est ce qui fait couvrir les verbes `approve`/`write` par le miroir SUPER_ADMIN canonique) ; `supplier`/`purchase_order`/`purchase_order_line`/`goods_receipt` ajoutés à `RESOURCE_TO_MODULE` pour que l'événement dérivé soit rattaché à `purchasing` et non à `system` ; trois vocabulaires de statuts ajoutés au registre partagé (`purchasing.order`, `purchasing.receipt`, `purchasing.quality`) avec tons et libellés FR/AR.

**Client — `client/src/admin/PurchasingPage.tsx` (618 lignes)** : `PurchasingSuppliersPage` = simple commande de `ResourceWorkspace` (le descripteur serveur suffit) ; `PurchasingOrdersPage` (lignes, totaux, transitions, motif de refus/annulation) ; `PurchasingReceiptsPage` (brouillon à quai, qualité par ligne, affichage, écartement, lecture des mouvements). Trois sections additives (`purchasing`, `purchasing-orders`, `purchasing-receipts`), trois icônes déclarées dans la carte de la coquille (`Truck`, `Clipboard`, `PackageCheck`) — aucune liste de navigation recopiée côté client, aucune balise de table écrite à la main.

**Tests — `tests/purchasing-foundation.test.ts` : 36 tests**, plus le recalage mesuré de trois assertions comptables (§4). Aucun test supprimé, aucune capacité retirée.

---

## 2) Ce qui a été refusé, et pourquoi

| Refus | Motif |
| --- | --- |
| Stocker `subtotal`, `total_tnd`, `received_quantity`, `line_total` dans les tables | Deux écritures entretiennent une valeur faussée. Tout est `SUM`/agrégat lu à la lecture ; le test vérifie l'absence des colonnes. |
| Écrire une quantité de stock depuis le module Achats | Le stock appartient à P2.2. `receipts.ts` appelle `recordMovement`/`createStockItem`. Un test balaie les 9 fichiers source (verbes SQL, commentaires retirés) et refuse `INSERT/UPDATE/DELETE inventory_*`. |
| Sonder l'existence d'une ligne de stock avec `recordMovement(quantity: 0)` | Cela aurait écrit un mouvement de 0 dans un journal append-only. On **lit** `inventory_stock_items` (lire est permis), et si la ligne manque, `createStockItem` l'ouvre à zéro. |
| `adjust` comme verbe de permission d'achat (le plan évoquait des droits hors liste) | `ERP_ACTIONS` est le vocabulaire du moteur. `approve` (engager l'argent) et `write` (ouvrir le magasin) sont déjà deux droits distincts et suffisent. |
| Une route `POST /orders/:id/lines` qui écrirait une ligne isolée | Une quantité sans coût (ou l'inverse) n'engage à personne. Le verbe existe et **refuse** avec la règle écrite, pour ne pas être un 404 muet. |
| Suppression physique d'un fournisseur ou d'un bon | Un engagement et une trace d'entrée ne s'effacent pas : `INACTIVE` / `DISCARDED`, et les verbes `DELETE` renvoient 409 motivé. |
| `PUT /receipts/:id`, re-`post`, `discard` après affichage | Un bon `POSTED` a écrit des mouvements immuables : l'écart se corrige par un `ADJUST` côté stock. Les quatre verbes sont testés. |
| Réception « négative » ou quantité flottante | Un bon ne défait pas le stock ; les quantités sont des entiers strictement positifs partout (commande comme réception). |
| Clé d'idempotence sur la création d'un brouillon de bon | Un second brouillon est un second bon papier : le dire idempotent aurait menti. Ce qui ne doit pas se rejouer (l'affichage), ses mouvements portent déjà une clé dérivée `rcpt:<bon>:<ligne>:<qualité>`. |
| Convertir le coût d'achat dans la devise du produit au vol | Le coût est saisi **et stocké** dans la devise de la commande + un taux ; la conversion est une lecture. `products.final_price` n'est jamais touché (moteur Prix). |
| Ajouter une colonne côté CRM pour le lien arrivage | `purchase_orders.arrival_id` / `goods_receipts.arrival_id` (`ON DELETE SET NULL`) portent le lien. `crm_arrivals` ne gagne aucune colonne — vérifié par test. |
| Sixième moteur de liste / de formulaire / de recherche | Les trois listes passent par `ResourceWorkspace` ; `search.ts` reste mono-table, donc aucune source de recherche globale bidonnée n'a été ajoutée (reporté, cf. P2.2 §6). |
| Déclarer les trois écrans en `surface: 'framework'` | La preuve gelée `frameworkRendered === 9` du moteur legacy n'a pas à bouger : un écran de module est `custom` et délègue au moteur. |

---

## 3) Gates rejouées

Dans l'arbre de travail, puis **dans un worktree frais sur le commit poussé** (`281235d`) :

| Gate | Résultat |
| --- | --- |
| `npm run build` (client + serveur) | ✅ |
| `npx tsc --noEmit` (serveur) | ✅ 0 erreur |
| `npx tsc -p tsconfig.client.json --noEmit` (client — le seul vrai gate client) | ✅ 0 erreur |
| `npm test` | ✅ **47 fichiers / 545 tests** (509 baseline + 36) |
| Worktree frais : build + les deux tsc + suite complète | ✅ 47 / 545 |
| `git status --porcelain` après commit | 0 ligne |

La ligne stderr `[Arrival ingestion] ARRIVAL_INGESTION_FAILED` est un log émis par un test volontairement en échec d'extraction ; elle était déjà présente à la baseline P2.2 et le fichier correspondant est vert.

---

## 4) Assertions comptables recalées — valeurs **mesurées**

Trois nombres figeaient l'état d'avant. Chacun a été mesuré avant d'être écrit, jamais déduit d'un raisonnement sur le registre.

| Assertion | Avant | Après (mesuré) | Raison |
| --- | --- | --- | --- |
| `erp_role_permissions` total (seed serveur, `catalogue-foundation.test.ts`) | 208 | **217** | +9 = miroir SUPER_ADMIN du module `purchasing` écrit par `seedLegacyPermissions` dès que la clé est déclarée dans `MODULE_RESOURCES` (une ligne par verbe du moteur, `resource_type='*'`). Deux assertions complémentaires vérifient que le module n'apporte **rien d'autre** ici : `purchasing` = 9 lignes, et 0 ligne non-SUPER_ADMIN dans ce fichier (les 20 grants ADMIN viennent de `bootstrapPurchasing`, qui n'est pas déclenché dans ce test). |
| `backOfficeSections().size` (`back-office-foundation.test.ts`) | 43 | **46** | +3 sections d'achats. Rappel du piège : `backOfficeSections()` applique `flatMap(section, aliases)`, donc il inclut `hero-slides`, que la barre latérale ne contient pas — un total égal à « 39 + ajouts » est une erreur de lecture du moteur. |
| Entrées de navigation SUPER_ADMIN + `counts.sections/visible` | 40 | **43** | +3 entrées, et l'ensemble exact est recalculé comme `legacy ∪ {3 ajouts P2.2} ∪ {3 ajouts P2.3}` (pas un « alignement » du snapshot sur le serveur : le test doit continuer à attraper un ajout silencieux). |

Le test de roadmap a suivi la même logique que P2.2 : `purchasing` ne doit plus être dans la roadmap (`not.toContain`) et ne doit donc jamais y figurer comme écran cliquable.

---

## 5) Défauts de moteur trouvés pendant la phase, corrigés, avec garde

### 5.1 Des index uniques déclarés mais jamais créés

**WHERE** — `QatafoDatabase.runSchema()` (`src/db/database.ts`) : le découpage multi-instructions écartait tout segment commençant par `--`.
**WHY** — le filtre `!statement.startsWith('--')` ne distinguait pas un commentaire d'une instruction documentée. Or la convention du dépôt est d'écrire la raison de la contrainte juste au-dessus d'elle dans la chaîne SQL.
**IMPACT** — trois index uniques absents en base, silencieusement : `idx_inventory_item_identity` et `idx_inventory_movement_idempotency` (P2.2 — unicité de ligne de stock et clé d'idempotence), et `idx_po_line_product_unique` (P2.3, créé pendant cette phase). Les services les compensaient, donc **aucun test ne rougeait** : c'est exactement la classe de défaut qui survit à une revue. Tout autre écriveur (job, import, futur module) n'avait plus la garde.
**DEPENDENCIES** — toute DDL additive du dépôt qui documente une contrainte dans la chaîne SQL (`inventory`, `purchasing`, `erp-core`).
**RECOMMENDED SOLUTION** — appliquée : `runSchema` ne retire plus que les **lignes de tête** d'un segment, et n'écarte un segment que s'il est entièrement commenté ; le texte d'une instruction n'est jamais touché. Gardes écrites dans les tests : les trois index sont vérifiés présents, avec la leçon en commentaire.
**PRIORITY** — P0 (corrigé dans cette phase).

### 5.2 Un bouton d'écriture éternellement grisé (hérité de P2.2)

**WHERE** — `client/src/admin/InventoryPage.tsx` : `may('stock_movement', 'adjust')`.
**WHY** — P2.2 a **refusé** d'inventer un verbe `inventory:adjust` (il n'est pas dans `ERP_ACTIONS`), mais l'écran a gardé la demande de droit du brouillon initial ; `can()` accepte n'importe quelle chaîne, donc la vérification était fausse sans jamais lever d'erreur.
**IMPACT** — le CTA « Enregistrer un mouvement » était désactivé pour **tous** les rôles, SUPER_ADMIN compris, alors que `POST /api/admin/inventory/movements` est gardé par `inventory:write` et fonctionne. Un test d'API ne pouvait pas le voir.
**DEPENDENCIES** — aucun autre : c'est le seul appel restant à `adjust`.
**RECOMMENDED SOLUTION** — appliquée : `may('stock_movement', 'write')` + infobulle corrigée, commentaire sur place pour que la règle (le droit de la route = le droit demandé par le bouton) soit lisible.
**PRIORITY** — P1 (corrigé dans cette phase ; vérifié en relançant la suite shell/client + les 31 tests du stock).

### 5.3 Conséquence architecture : un seul moteur par concept, troisième appelant

Sans regroupement, P2.3 allait recopier `paginationOf`, `sortOf`, `isIdentifier`, la grammaire d'emplacement et le gabarit `withSavepoint`.
**Où** — `src/domain/query.ts` (nouveau) et `src/db/savepoint.ts` (nouveau) ; `src/inventory/validation.ts` et `src/inventory/stock.ts` les ré-exportent, donc aucun appelant du stock n'a bougé.
**Vérification** — comportement identique au caractère près sur les trois primitives (logique relue à la reprise), messages et codes d'erreur restés locaux au module ; les 31 tests du stock rejoués après chaque déplacement, et la suite entière.

---

## 6) Écarts assumés (ce que P2.3 ne fait pas)

1. **Pas d'objet « demande d'achat » séparé** : le plan dit « demande → approbation → réception ». Le brouillon `DRAFT` de la commande porte ce rôle (destinataire, motif, lignes), avec `submit` comme passage en revue. Un objet intermédiaire sans numéro, sans tableau et sans bénéficiaire identifié aurait été un deuxième moteur de la même chose — décision D-02.
2. **Pas de rapprochement bon ↔ facture fournisseur** (three-way match) : les factures vivent dans la Finance legacy, et la politique d'évaluation (`UNKNOWN-015`) n'est pas tranchée. Le lien existe du côté données (`goods_receipts.arrival_id`, `reference_type='goods_receipt'` dans le journal de stock).
3. **Pas de politique de coût → valeur du stock** : le coût du bon n'écrit aucun coût moyen, aucun `final_price`, aucune colonne de coût dans `products`. La valorisation appartient à la Comptabilité (P5) et au moteur Prix (P1).
4. **Pas de liste de prix fournisseurs / contrats** : le coût est saisi par ligne, comme le permet déjà l'extraction d'arrivage. Un catalogue de prix par fournisseur serait une deuxième source de vérité du coût tant que P5 n'existe pas.
5. **Pas de seuil déclencheur de commande automatique** : `reorder_point` reste un état de lecture (décision P2.2 §6), donc aucune suggestion de commande n'est générée.
6. **Pas de transferts ni d'entrepôts multiples** : `UNKNOWN-013` reste ouvert ; la réception choisit un emplacement, elle ne déplace rien.
7. **Le stock qui manque ne bloque toujours pas la vente** : `UNKNOWN-014` est une décision produit, hors P2.3.
8. **Pas d'écran « arrivage → commandes liées » dans `ArrivalIngestionPage`** : la page et son CSS sont hors périmètre de réécriture ; le lien est exposé côté achats (champ, détail, `arrival_name`/`arrival_status` lus).
9. **Le multi-emplacement n'est pas validé contre une liste d'entrepôts** : seule la grammaire d'étiquette courte est appliquée (celle du stock), l'ouverture de ligne restant du ressort de P2.2.

---

## 7) UNKNOWN ouverts à l'issue de P2.3

| ID | Question | Effet / priorité |
| --- | --- | --- |
| `UNKNOWN-002` | Deux gardes legacy à trancher (reportées depuis P2.0) | faible — hors chemin d'achat |
| `UNKNOWN-006` | Propriété de `crm_stores` | bloque P4.1 (fusion entrepôt), pas P2.3 |
| `UNKNOWN-013` | Périmètre des transferts inter-emplacements | bloque le multi-entrepôt ; la réception d'un seul emplacement reste valide |
| `UNKNOWN-014` | Le stock négatif doit-il bloquer `checkout` ou avertir ? | décision produit, à trancher avant P4.2 |
| `UNKNOWN-015` | **Nouveau, né ici** : quelle politique de coût la Comptabilité adopte-t-elle (coût d'achat saisi vs coût moyen pondéré vs FIFO), et qui en est propriétaire ? | bloque P5 (Comptabilité) ; **ne bloque pas** P2.3 — le coût est une donnée du bon, rien n'est valorisé |
| `UNKNOWN-016` | **Nouveau, né ici** : les emplacements autorisés à la réception doivent-ils être contraints par une liste d'entrepôts (et laquelle) ? | bloque P4.1 ; aujourd'hui n'importe quelle étiquette valide est acceptée, comme pour le module Stock |

`UNKNOWN-015` et `UNKNOWN-016` sont écrits ici plutôt que devinés : chacun change un comportement qui serait sinon figé par commodité.

---

## 8) Ce que P2.4 et P3 consomment de cette phase

- `/api/admin/purchasing/meta` = source unique des capacités (`can()` par ressource × verbe), des vocabulaires (statuts de commande, de bon, qualités, devises), des bornes (`maxLinesPerOrder`) et des **règles écrites** (`rules.lines`, `rules.receipt`) que les écrans affichent au lieu de les ré-inventer.
- Le gabarit d'un module futur, désormais complet et trois fois éprouvé : `types.ts` (aucun verbe inventé) → `bootstrap.ts` (ADD ONLY, séquences) → `permissions.ts` (grants = données, garde composée) → `validation.ts` → `audit.ts` (verbes du moteur + verbe métier en note) → services → `routes.ts` au dialecte du framework → descripteurs `custom` → page qui commande `ResourceWorkspace`.
- `src/domain/query.ts` et `src/db/savepoint.ts` : primitives partagées, à réutiliser au lieu de les recopier une quatrième fois.
- `src/domain/statuses.ts` : `purchasing.order|receipt|quality` + tons + libellés FR/AR — P3 (thème) rend ces états sans toucher aux modules.
- Baseline à ne pas faire baisser : **545 tests / 47 fichiers**, sections **46**, entrées de navigation SUPER_ADMIN **43**, grants **217** au boot serveur (**0** dans un `new QatafoDatabase()` nu).

---

## 9) Mesures d'isomorphie (base fraîche, worktree sur `281235d`)

| Mesure | Valeur |
| --- | --- |
| Tables d'une base fraîche | **97** = 92 mesurées en P2.2 + 5 (les cinq tables d'achat) |
| Index déclarés par le module | **14** dont **3 uniques** (`idx_suppliers_name_unique`, `idx_po_line_product_unique`, `idx_receipt_line_unique`) — tous vérifiés présents en base |
| Séquences ajoutées à `erp_sequences` | 3 (`supplier_code`, `purchase_order_number`, `goods_receipt_number`) |
| Colonnes de `products` correspondant à `qty\|quantity\|stock\|purchase\|supplier` | **une seule**, `stock_status` (déjà présente en P2.2) — aucune quantité, aucun coût d'achat |
| Colonnes de `crm_arrivals` évoquant un achat ou une réception | **0** |
| Lignes écrites dans `erp_role_permissions` par le constructeur de la base | **0** (le miroir SUPER_ADMIN vient du boot serveur, la voie canonique ; les 20 grants ADMIN viennent de `bootstrapPurchasing`) |
| Verbes SQL d'écriture dans `inventory_*` ou `crm_*` depuis le module | **0** (balayage des 9 fichiers source, commentaires retirés) |
| Poids de la phase | 3 174 lignes nouvelles (2 041 serveur + 618 client + 615 tests), 13 fichiers modifiés en additive (+226/−58) |
