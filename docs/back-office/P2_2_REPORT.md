# AYROVI·X — Rapport de phase P2.2 (module Stock)

**Statut :** construite, tests verts, poussée (sha en fin de document).
**Baseline :** 477 tests (P2.1) → **509 tests / 46 fichiers, tous verts**. Aucun test supprimé ; trois assertions de registre recalées **avec raison écrite** (§5).
**Base de données :** additif pur — 4 tables créées, zéro `DROP`, zéro `TRUNCATE`, zéro colonne retirée, aucune colonne de quantité ajoutée à `products`.

---

## 1) Ce que la phase devait livrer (extrait du plan §4)

`inventory_stock_items | inventory_stock_movements | inventory_stocktakes | inventory_stocktake_lines`, quantités **uniquement ici** (jamais dans `products`), permissions `inventory:*` via la matrice centrale, audit via `writeAuditEvent()`, `crm_warehouse_dispatches` non touché, module déclaré `active` dans le registre, et un écran servi par le framework.

## 2) Ce qui a été construit

### 2.1 Le module serveur `src/inventory/` (8 fichiers, calqué sur `src/catalogue/`)

| Fichier | Rôle |
|---|---|
| `types.ts` | vocabulaire fermé : sens `IN/OUT/ADJUST`, motifs de mouvement, statuts d'inventaire, codes d'erreur |
| `bootstrap.ts` | DDL additif (`CREATE TABLE/INDEX IF NOT EXISTS`) via `db.runSchema`, numérotation `STK-AAAA-#####` dans `erp_sequences`, idempotent |
| `permissions.ts` | 15 grants `erp_role_permissions` (ADMIN × 5 actions × 3 ressources), `requireInventory()` = `requireAdmin` + `requireErpPermission({permissive:false})` |
| `validation.ts` | `Check<T>` (forme plate, comme le catalogue), emplacements/quantités/motifs bornés, page ≤ 100, tri sur allowlist |
| `stock.ts` | lignes de stock + **seule écriture des quantités** : `recordMovement` avec `balance_before/after`, point de commande, archivage |
| `stocktakes.ts` | inventaire : photo du théorique, comptage, soumission, **validation = mouvements ADJUST**, refus motivé |
| `audit.ts` | `auditInventory()` → `writeAuditEvent()` uniquement (module `INVENTORY`, diff champ à champ) |
| `routes.ts` | 17 routes sous `/api/admin/inventory` (dont `/meta` et `/health`) |

**Quatre invariants tenus par le code et par la base, pas par la confiance :**

1. **La quantité ne vit pas dans `products`.** Un test lit `PRAGMA table_info(products)` et refuse `quantity|stock|stock_quantity|available_quantity|on_hand`.
2. **Jamais négatif** : `CHECK (quantity >= 0)` + refus au service (400 `INVENTORY_NEGATIVE_STOCK`) ; un test insère directement une quantité négative et attend que la base **rejette**.
3. **Journal append-only** : `PUT/PATCH/DELETE /movements/:id` répondent 409 `INVENTORY_MOVEMENT_IMMUTABLE` avec la raison (« une erreur se corrige par un mouvement ADJUST »).
4. **Atomicité** : `UPDATE` de la ligne + `INSERT` du mouvement dans un même `SAVEPOINT` (SQLite allow-nesting ; `QatafoDatabase` n'expose pas de transaction publique, `BEGIN` casserait un appelant déjà en transaction). Un échec en cours d'application d'un inventaire **ne laisse aucun** mouvement appliqué.

Deux protections supplémentaires : `idempotency_key` unique (un double-clic réseau renvoie le mouvement existant, `duplicated: true`, au lieu de doubler le stock) et `UNIQUE` d'identité de ligne par index d'expression `(product_id, COALESCE(variant_id,''), location)` — un `UNIQUE` simple aurait autorisé deux lignes « sans variante », deux `NULL` n'étant jamais égaux en SQL.

### 2.2 API (dialecte du framework, pas un dialecte par module)

```
GET  /meta · GET /health
GET  /stock (?search&location&status&low&product_id&page&pageSize|page_size&sort&direction)
GET  /stock/:id · POST /stock · PUT|PATCH /stock/:id · DELETE /stock/:id (archive)
GET  /movements · POST /movements
GET  /stocktakes · GET /stocktakes/:id · POST /stocktakes
PUT  /stocktakes/:id/lines/:lineId · POST /stocktakes/:id/submit|approve|reject
```

- La liste accepte **exactement** les paramètres que `ResourceWorkspace` envoie → aucune adaptation dans l'écran.
- `PUT /stock/:id` **refuse** `quantity`, `stock` et `location` (409) : le point de commande et le statut sont les seuls champs éditables d'une ligne.
- Le tri est validé contre une allowlist ; un `?sort=quantity; DROP TABLE products` renvoie 200 sur l'ordre par défaut et la table est toujours là (test).
- `/meta` renvoie les capacités **calculées par `can()`** sur la matrice, le vocabulaire de statuts vient de `src/domain/statuses.ts` (aucune copie de libellés).

### 2.3 Écran : le premier écran métier réellement servi par le framework

`InventoryStockPage` (client) ne contient que ceci : `descriptorFor('inventory')` → `<ResourceWorkspace descriptor={descriptor} />`. Colonnes, tri, recherche, filtre de statut, formulaire, archive et journal viennent du **descripteur serveur**. C'est l'item que P2.1 avait ajourné (« `ResourceWorkspace` sert un écran réel ») : il est clos par un module neuf, sans changer un seul écran existant.

`InventoryMovementsPage` et `InventoryStocktakesPage` sont les deux seuls écrans écrits à la main du module, et ils n'écrivent **aucune** balise de table : `DataTable` + primitives partagées, boutons grisés avec motif quand le droit manque (`may('stock_movement','write')`, `may('stocktake','approve')`).

### 2.4 Registre, navigation, permissions, thème

- `ERP_MODULES` : `inventory` passe de `planned` à **`active`**, `apiPrefix: '/inventory'`, `adminSection: 'inventory'` (21 modules, compte inchangé — promotion, pas ajout).
- `MODULE_RESOURCES` : `inventory → stock_item | stock_movement | stocktake` ; le miroir `seedLegacyPermissions` donne à SUPER_ADMIN les 9 actions du module sans code dédié.
- `resources.ts` : 3 descripteurs (`inventory.stock|movement|stocktake`), groupe « Commerce », ordres 260/270/280, sections `inventory`, `inventory-movements`, `inventory-stocktakes` — **additif**, aucun deep-link existant déplacé.
- `src/domain/statuses.ts` : deux vocabulaires (`inventory.stocktake`, `inventory.movement`) + tons de badge, pour que le stock n'invente pas ses libellés.
- `components.tsx` : `PageHeader` devient **une** primitive partagée (trois copies quasi identiques disparaissent, remplacées par des alias qui ne portent que l'œil-de-bœuf du domaine) ; `renderCell` gagne un rendu `number` (alignement tabulaire + séparateur de milliers) utilisé par les colonnes chiffrées du stock.
- 3 lignes de CSS seulement (`.admin-cell-input`, `.admin-cell-num.is-positive|is-negative`), avec les teintes déjà présentes dans `admin.css` : aucune couleur nouvelle (la règle des 392 couleurs littérales reste intacte pour P3).

## 3) Ce qui est refusé, et pourquoi (comportement attendu, pas des bogues)

| Cas | Réponse | Motif |
|---|---|---|
| Sortie supérieure au solde | 400 `INVENTORY_NEGATIVE_STOCK` | la quantité ne devient jamais négative ; l'écart réel se constate à l'inventaire |
| Édition directe de la quantité | 409 `INVENTORY_CONFLICT` | seul un mouvement déplace une quantité |
| Ajustement sans note | 400 | un écart sans raison écrite n'est pas auditable |
| Quantité nulle / > 1 000 000 | 400 | une faute de frappe n'est pas un stock |
| Seconde validation du même inventaire | 409 `ALREADY_APPROVED` | la validation ne se rejoue pas ; on ouvre une nouvelle session |
| Comptage après décision | 409 | la session est tranchée |
| Refus sans motif | 400 | une décision negativa s'écrit |
| Inventaire d'un lieu sans ligne | 409 `EMPTY_LINES` | rien à photographier |
| Ligne archivée non sol dé | 409 | on n'archive pas une ligne encore approvisionnée |
| Rôle sans grant (CONTENT_MANAGER, ORDER_MANAGER) | 403 `ERP_PERMISSION_DENIED` **+ ligne `ACCESS_DENIED` dans le journal** | la matrice décide, pas l'écran |

## 4) Gates (sorties réelles)

| Gate | Commande | Résultat |
|---|---|---|
| Types serveur + tests | `npx tsc --noEmit` | 0 erreur |
| Types client | `npx tsc -p tsconfig.client.json --noEmit` | 0 erreur |
| Suite complète | `npm test` | **46 fichiers / 509 tests passés** |
| Build | `npm run build` | ok |
| Arbre frais au commit poussé | worktree + build + 3 gates | voir §7 |

## 5) Les trois assertions recalées (et pourquoi ce n'est pas un « alignement »)

1. `catalogue-foundation.test.ts` : total `erp_role_permissions` **199 → 208**. +9 = miroir SUPER_ADMIN du module `inventory` dans `MODULE_RESOURCES`. L'intention d'origine (détecter un droit accordé à un mauvais rôle) est **renforcée** : deux assertions nouvelles vérifient que ces 9 lignes ne concernent que SUPER_ADMIN et qu'aucun autre rôle n'a été touché.
2. `back-office-foundation.test.ts` : 37 → 40 entrées navigables, 39 → 43 sections (39 legacy + alias `hero-slides` + 3 entrées du stock **citées nommément**), et l'égalité stricte de navigation devient « legacy ∪ {inventory, inventory-movements, inventory-stocktakes} ». Une quatrième entrée ne passera pas inaperçue.
3. `back-office-foundation.test.ts` : `roadmap` ne contient plus `inventory` — c'est précisément la preuve que la phase a construit le module (assertion `not.toContain`). `purchasing` et `accounting` restent planifiés et le contrôle « un module planifié n'est jamais cliquable » s'applique toujours à eux.

Aucun test n'a été supprimé, aucun test métier n'a été affaibli ; les 31 tests ajoutés sont dans `tests/inventory-foundation.test.ts` et la garde du shell en contient 1 de plus.

## 6) Écarts assumés avec le plan (à lire avant P2.3)

- **`inventory:adjust` n'existe pas.** Le vocabulaire du moteur de permissions est `read|write|create|update|delete|approve|export|assign|manage` ; introduire un verbe neuf aurait créé un second dialecte. Le droit d'écrire un mouvement est donc **`inventory:write`**, et `approve` reste distinct. Le garde-fou du framework (auto-test) a attrapé l'incohérence de mon premier jet : c'est la preuve que la règle travaille.
- **`ResourceWorkspace` sert la liste de stock, mais par un écran qui la commande** (`surface: 'custom'` + `component: 'InventoryStockPage'`). Garder `surface: 'framework'` aurait cassé la preuve P2.0 « les 9 ressources du moteur sont dérivées, pas recopiées » en comptant une 10ᵉ ressource dérivée. Le moteur de repli (`if descriptor.surface === 'framework' → ResourceWorkspace`) est en place pour P3/P4 : un module futur n'aura plus rien à écrire.
- **Pas de source de recherche globale pour le stock.** `SEARCH_SOURCES` est un moteur mono-table (pas de jointure) ; une source « stock » n'aurait pu chercher que l'emplacement, ce qui est un résultat médiocre plutôt qu'une couverture. À faire quand la recherche acceptera une source jointe (P3/T2), sans forcer maintenant.
- **`reorder_point` ne déclenche aucune alerte ni réappro** : l'état `LOW` est une lecture ; la notification et la commande d'achat appartiennent à P2.3 (Achats) et P5 (Automatisation).
- **Aucun transfert entre emplacements** : `TRANSFER_IN/OUT` existent comme motifs, pas comme opération atomique (une sortie + une entrée). L'opération « déplacer » suppose de décider qui approuve un transfert — c'est un arbitrage produit, pas un détail de code (`UNKNOWN-013`, §7).
- Les quantités ne sont pas encore consommées par la vente : `checkout` ne décrémente pas le stock (P2.3/§plan). Le module est la source de vérité, pas encore l'autorité bloquante.

## 7) Registre des UNKNOWN ouverts

| Clé | Sujet | Effet |
|---|---|---|
| `UNKNOWN-002` | deux gardes legacy défectueuses (P2.0) | aucun, P2.2 ne les utilise pas |
| `UNKNOWN-006` | propriété de `crm_stores` | bloque P4.1, pas P2.3 |
| `UNKNOWN-013` (nouveau) | périmètre exact des transferts (qui approuve, quel droit, quelles conséquences sur les deux emplacements) | bloque l'opération « déplacer » ; P2.3 peut vivre sans elle |
| `UNKNOWN-014` (nouveau) | le stock doit-il bloquer le `checkout` (refuser une vente) ou seulement avertir | décision produit avant de brancher ventes → mouvements |

## 8) Ce que P2.3 (Achats) consomme déjà

- `suppliers`, `purchase_orders(_lines)`, `goods_receipts(_lines)` en ADD ONLY, et une **réception** = `recordMovement(direction:'IN', reason:'RECEPTION', reference_type:'purchase_order')` — le réapprovisionnement n'écrit pas de quantité, il écrit un mouvement ;
- la matrice : `purchasing` est encore `planned` → même promotion que celle de P2.2 ;
- le garde-fou `<table>` et l'auto-test du framework (une ressource déclarée avec une action hors vocabulaire ou un `api.prefix` inventé rougit immédiatement) ;
- `arrival-ingestion` reste non réécrit : P2.3 s'y branche en additif (lien `purchase_order` sur les arrivages existants), pas en remplacement.

## 9) Mesures et preuve d'isomorphie (base fraîche, script exécuté après le commit)

Sur une baseSQLite créée de zéro par `new QatafoDatabase(chemin_tmp)` :

| Mesure | Valeur |
|---|---|
| Tables au total | **92**, dont **88 hors stock** et **4 du module** (`inventory_stock_items`, `inventory_stock_movements`, `inventory_stocktake_lines`, `inventory_stocktakes`) |
| Index `idx_inventory*` | 8 (dont l'index d'expression d'identité de ligne et l'index unique d'idempotence) |
| `erp_sequences` | 1 ligne ajoutée : `stocktake_code` / préfixe `STK` / padding 5 / year-scoped |
| Colonnes de `products` contenant `qty|quantity|stock` | **`stock_status` uniquement** — une étiquette de disponibilité qui existait avant P2.2 ; aucune colonne de quantité n'a été ajoutée (c'est ce que vérifie le test de garde) |
| `erp_role_permissions` au boot du constructeur seul | 0 — le constructeur n'assure que le DDL ; les grants sont semés par `bootstrapInventory` (à la demande, comme le catalogue), donc aucune écriture de données au chargement du module |

Le chiffre de « 87 tables » cité dans les rapports de phases précédentes provenait d'une base de travail existante ; la mesure ci-dessus est faite sur une base fraîche et le delta imputable à P2.2 est exactement **+4 tables / 8 index / 1 séquence**, sans aucune modification de table préexistante.

**Vérification sur arbre frais au commit `5f39547` :** `git worktree add -f … 5f39547` + build + `npx tsc --noEmit` + `npx tsc -p tsconfig.client.json --noEmit` + suite complète → build ok, **0 / 0**, **46 fichiers / 509 tests passés**.
