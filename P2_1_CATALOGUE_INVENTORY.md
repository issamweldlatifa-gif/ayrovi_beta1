# P2.1 — Inventaire de départ : ce qui existe, qui le possède, qu'en faire

Date : 2026-09-05 · Branche `main` · Dépôt `ayrovi_beta1`
Périmètre : **inspection avant code** (§3/§4 du cahier des charges P2.1). Ce document a été
produit **avant** la première ligne de `src/catalogue/` et n'a pas été réécrit après coup :
les constats ci-dessous sont les mesures, pas la justification a posteriori.

Méthode (reproductible) :

1. `PRAGMA table_info` / `index_list` / `foreign_key_list` sur les 83 tables d'une base
   construite depuis cet arbre, via trois sondes vitest temporaires (créées, exécutées,
   supprimées — aucune n'est restée dans le dépôt) ;
2. lecture des requêtes réelles (`grep -rn "FROM products\|JOIN brands\|product_images" src/ client/src`),
   pas des noms de fichiers ;
3. comptage effectif des lignes (`SELECT COUNT(*)`) sur la base locale neuve ;
4. pour la base **déployée** : uniquement des sondes HTTPS (P0/P1) — son contenu ligne par
   ligne n'est **pas** mesurable depuis cet environnement → §6 `UNKNOWN`.

---

## 1. Tables pertinentes — `TABLE → PURPOSE → OWNER → USED BY → VERDICT`

| Table | But réel (d'après le code, pas le nom) | Propriétaire | Utilisée par | Verdict |
|---|---|---|---|---|
| `products` (83 tables au total ; **1 ligne** sur base neuve = `product_demo_01`) | Le produit vu par la vitrine, le back-office générique, l'extracteur et le client. Colonnes : `name!`, `description`, `image`, `additional_images`, `brand_id`, `brand_name`, `category` (texte libre), `source_url`, `source_platform` (CHECK SHEIN/AMAZON/TEMU/ALIEXPRESS/OTHER), `original_price`, `currency`, `converted_price`, `customs_fee`, `shipping_fee`, `service_fee`, `final_price`, `express_available`, `stock_status` (CHECK), `status` (CHECK DRAFT/ACTIVE/INACTIVE/ARCHIVED), `created_at`, `updated_at`. Index sur `status`. **Aucun** `sku`, `barcode`, `slug`, `product_code`, `created_by`, `updated_by`. | `src/db/database.ts` (DDL) · écritures : `src/admin/routes.ts` (CRUD générique) | `src/public/routes.ts`, `src/customer/routes.ts`, `src/magazine/service.ts`, `src/ayrovix/services/search.ts`, `src/admin/routes.ts` | **KEEP + EXTEND** (additif uniquement — voir §3) |
| `brands` (**10 lignes** = jeu de démonstration semé) | Marque : `name UNIQUE COLLATE NOCASE`, `logo`/`image`/`url`/`description` (`NOT NULL DEFAULT ''`), `category` CHECK (FASHION/SPORT_LIFESTYLE/BEAUTY/TECH/HOME/OTHER), `display_order`, `active`, horodatages. Pas de `slug`. | `src/db/database.ts` · `src/admin/routes.ts` | `src/public/routes.ts`, `src/admin/routes.ts` | **KEEP + EXTEND** (`slug` seulement) |
| `product_images` | Table d'images produit : **aucun DDL dans `src/db/database.ts`, zéro référence** dans `src/` et `client/src`. Vue **0 ligne** avec `url NOT NULL` + `image_type CHECK (IMAGE/VIDEO/OTHER)` lors de la sonde d'atelier ; **absente** d'une base construite depuis cet arbre aujourd'hui (vérifié : 88 tables, pas de `product_images`) → table d'une release antérieure, toujours vivante quelque part. | personne dans le code actuel | personne | **NE PAS ADOPTER, NE PAS TOUCHER** — le catalogue a sa propre table de références (§4) ; la supprimer relève d'une décision séparée (P2.1 interdit toute suppression). Son existence en production = `UNKNOWN` (§6) |
| `order_items` | Lignes de commande. `product_id` → `products.id` **déjà** (FK existante) ; la taille/couleur sont du texte libre (`requested_size`). | `src/db/database.ts` · écritures `src/customer/*`, `src/admin/routes.ts` | suivi de commande, rapports, CRM | **KEEP** — sera le pont commande↔variante en P2.3 (additif, jamais de renommage) |
| `crm_extracted_products` (0 ligne) | Sortie de l'extracteur IA ; porte déjà `sku`, `variant`, `size`, `color` en texte libre | `src/ai*` / `src/erp-core` (ingestion d'arrivage) | `ArrivalIngestionPage`, assistant | **KEEP** — le texte libre reste du texte ; aucune contrainte neuve n'est posée dessus en P2.1 |
| `crm_shipment_cartons` (0 ligne) | Cartons d'expédition ; porte `barcode_value` (texte) | CRM arrivages | `ArrivalShipments` | **KEEP** — pas de collision possible avec `catalogue_variants.sku` (tables disjointes) |
| `crm_categories` (0 ligne, clé `code`) | Classifieur d'arrivage du CRM — **pas** une arborescence de catalogue | CRM | pipeline d'ingestion | **NE PAS RÉUTILISER** (sens différent : classification entrante vs navigation vitrine) |
| `product_arrivals` (2 lignes) | Lignes d'arrivage physique (quantités reçues) | CRM | écrans Arrivals | **KEEP** — le stock n'est **pas** dans le produit (§ garde-fou P2.1) |
| `promotion_products` (1 ligne) | Association promotion↔produit (`product_id` texte) | `src/admin/routes.ts` | vitrine, promos | **KEEP** — référence l'identité produit, inchangée |
| `settings`, `hero_*`, `cms_*` | Contenu éditorial | CMS | site public | **HORS PÉRIMÈTRE** — aucun lien de clé ajouté |

### Tables créées par P2.1 (5) — toutes en `CREATE TABLE IF NOT EXISTS`

| Table | Clé / contrainte portée | Pourquoi elle existe |
|---|---|---|
| `catalogue_variants` | `product_id` → `products(id)` ON DELETE CASCADE, `sku` **`UNIQUE COLLATE NOCASE` au niveau colonne** | Le SKU est une identité, il ne peut pas vivre dans du texte libre |
| `catalogue_categories` | `parent_id` → elle-même ON DELETE SET NULL, `slug UNIQUE`, `sort_order`, `status` CHECK | « Homme / Femme / Enfant » = des lignes, pas de l'architecture |
| `catalogue_attributes` | `attribute_key UNIQUE`, `data_type`/`applies_to`/`status` CHECK, `options` JSON | Attributs extensibles sans `ALTER TABLE` |
| `catalogue_attribute_values` | `UNIQUE(attribute_key, product_id, variant_id)` | Une valeur par attribut et par porteur |
| `catalogue_media` | `product_id`/`variant_id` (FK), `media_type` CHECK, `is_primary` 0/1 | Références média publiques du catalogue |

**Additifs sur les tables existantes** (`ALTER TABLE … ADD COLUMN`, un seul appel,
`IF NOT EXISTS`-like par test de `PRAGMA table_info`) : `products` → `product_code`, `slug`,
`category_id`, `product_type DEFAULT 'STANDARD'`, `created_by`, `updated_by` ; `brands` → `slug`.
Index **partiels** (`WHERE … IS NOT NULL`) pour que les lignes legacy à NULL coexistent, et
**`COLLATE NOCASE`** sur `slug`/`product_code`/`brands.slug`/`catalogue_categories.slug` : un slug
est une URL, deux produits ne peuvent pas revendiquer la même adresse à la casse près.

---

## 2. Fichiers — `FILE → PURPOSE → OWNER → USED BY → VERDICT`

| Fichier | But | Propriétaire | Utilisé par | Verdict |
|---|---|---|---|---|
| `src/db/database.ts` (≈ 2 900 l.) | DDL complet + `seedCoreData` + helpers `all/get/run/runSchema/transaction` | socle | tout le serveur | **EXTEND** : un bloc `initCatalogueSchema()` (try/catch, additif) et rien d'autre |
| `src/admin/routes.ts` (1 987 l.) | Back-office : CRUD générique (`products`, `brands`, hero, FAQ…), uploads, rapports CSV | socle | `client/src/admin` | **EXTEND** : montage `router.use('/catalogue', …)` à côté de `/core` ; le CRUD générique `products`/`brands` reste **identique** (non-régression épinglée par test) |
| `src/admin/auth.ts` | session admin, `requireAdmin`, CSRF | socle | `src/admin/routes.ts` | **KEEP** — le catalogue le compose, ne le remplace pas |
| `src/erp-core/permissions.ts` | moteur `module:action:resource:scope`, `can()`, `requireErpPermission` | P1 | ERP Core, arrive P2.1 | **KEEP tel quel** — le catalogue s'y branche (aucun reconstruit) |
| `src/erp-core/audit.ts` | `writeAuditEvent`, `fieldDiff`, contexte, événements dérivés | P1 | tous les modules | **KEEP** — seul chemin d'audit utilisé par le catalogue |
| `src/erp-core/sequences.ts` | `nextSequenceNumber` (PRD-, EMP-…) | P1 | employés, commandes | **KEEP** — `product_code` / `variant_sku` ajoutés comme clés de séquence |
| `src/erp-core/modules.ts` | registre des modules, `RESOURCE_TO_MODULE` | P1 | écran environnement | **EXTEND** : `catalog` passe `active` + `apiPrefix`, 4 clés de ressources ajoutées |
| `src/erp-core/storage.ts` | politique privé/public (`isPrivateDocumentPath`, `isPublicUploadPath`, `PUBLIC_UPLOAD_DIRS=['hero']`) | P1 | garde `/uploads` | **KEEP** — le média catalogue ne fait qu'appliquer la même question |
| `src/public/routes.ts`, `src/customer/routes.ts`, `src/magazine/service.ts`, `src/ayrovix/services/search.ts` | lectures produit côté vitrine/client/IA | modules existants | site public | **KEEP INTACT** — ils lisent `products` : ils voient donc immédiatement la ligne canonique, aucun shim |
| `client/src/admin/AdminApp.tsx` | coquille du back-office (nav, `?section=`, permissions de lecture côté UI) | back-office | — | **EXTEND** : un groupe de nav « Catalogue » + trois branches de rendu |
| `client/src/admin/components.tsx`, `admin.css` | boutons, tableaux, modales, styles admin | back-office | toutes les écrans | **KEEP** ; 18 lignes de CSS **additives** pour six classes neuves |
| `tests/ayrovi.test.ts`, `tests/erp-core-foundation.test.ts`, + 40 autres | contrat de non-régression | atelier | CI locale | **KEEP** — une seule attestation re-ciblée, documentée (`§registre`, voir rapport P2.1 §5) |
| `data/*.sqlite` | base de l'environnement de dev (vide dans cet atelier) | exploitation | serveur | **NON TOUCHÉ** |

---

## 3. Décision de structure qui en découle

Une seule entité Produit canonique : **c'est `products`**, étendue, pas une table parallèle.
`catalogue_products` (ou `catalogue_brands`) aurait créé exactement ce que le cahier des
charges interdit — deux sources de vérité, un produit pour la vitrine et un produit pour
l'ERP. Conséquences assumées :

- `products.category` (texte) et `products.brand_name` (texte) **restent** : ce sont des
  miroirs d'affichage écrits depuis les clés étrangères canoniques, sinon `src/public/routes.ts`
  et le magazine mentent ou tombent en 500 ;
- le `status` du produit est un vocabulaire contrôlé (`DRAFT/ACTIVE/ARCHIVED`) — la valeur
  legacy `INACTIVE` reste lisible (colonne et CHECK inchangés) mais n'est plus proposé ;
- pas de file de publication, pas de jointure produit↔variante (la variante porte `product_id`),
  pas de quantités de stock dans le produit (elles appartiennent à P6/Stock) ;
- les prix ne sont **jamais** calculés par le catalogue : `final_price` & co restent la
  propriété du moteur de tarification existant ; l'écran catalogue les affiche en lecture.

## 4. Politique média (issue de P0/P1, pas réinventée)

Le catalogue ne téléverse aucun fichier : il **référence**. `mediaUrlOf()` refuse tout schéma
`file:`/`data:`/`blob:`, toute traversée `..`, et — règle miroir du garde statique de
`src/server.ts` — **tout chemin que le serveur ne servirait pas publiquement**
(`isPublicUploadPath`). Une facture, une preuve de paiement ou un document employé ne peut
donc pas devenir une photo produit, et un dossier inconnu n'est pas « public par défaut ».
`PUBLIC_UPLOAD_DIRS` reste `['hero']`. L'image principale est copiée dans `products.image`
(miroir vitrine) ; le fichier sur le disque n'est jamais déplacé ni supprimé.

## 5. Données existantes, risque de migration, plan séparé

Mesuré sur une base **construite depuis cet arbre** (seed inclus) : `products` 1, `brands` 10,
`product_arrivals` 2, `promotion_products` 1, `orders` 0, `order_items` 0, `customers` 0,
`crm_extracted_products` 0, `crm_shipment_cartons` 0, `crm_categories` 0.

**Risque de migration : quasi nul dans cet atelier** (aucun lien existant à casser, aucune
donnée à dupliquer) — mais **ce n'est pas la mesure de la production** : y vivent au moins la
table `product_images` absente du code et un volume produit inconnu ici. C'est pourquoi P2.1
**n'exécute aucune migration** et propose ce plan, à valider séparément :

1. **Gel** : sauvegarde (`npm run backup`) + comptage (`products`, `brands`, `order_items`) consigné ;
2. **Rattrapage de schéma** : `ensureCatalogueSchema` sur la base réelle (idempotent, additif — déjà écrit) ;
3. **Projection** (script en lecture d'abord) : pour chaque `products` sans `product_code` →
   attribution PRD- via `nextSequenceNumber` ; sans `slug` → `slugify(name)` + suffixe de
   collision ; `category`/`brand_name` texte → `category_id`/`brand_id` **uniquement en cas de
   correspondance exacte et unique**, sinon laissés NULL et listés dans un rapport ;
4. **Vérification** : écarts comptés, miroirs comparés, aucun `UPDATE` non journalisé ;
5. **Variante minimale** : une variante par produit sans SKU (SKU de secours émis depuis
   `variant_sku`), marquée `DRAFT`, pour que Stock/Expédition aient une cible sans inventer de
   faux choix ;
6. **Rejet** consigné : ce qui n'a pas pu être rattaché, ligne par ligne — jamais silencieusement.

Aucune de ces étapes n'est destructive. Les étapes 3 à 6 **ne sont pas exécutées** : elles
attendent une approbation explicite (§6).

## 6. Ce qui reste inconnu (`UNKNOWN`)

- `UNKNOWN` — contenu réel de la base déployée (nombre de produits, catégories texte distinctes,
  slugs déjà présents dans d'autres tables) : non mesurable depuis cet atelier, seulement
  atteignable en HTTPS. Le plan §5 est écrit pour être sûr dans les deux cas, pas parce que
  « probablement vide ».
- `UNKNOWN` — `product_images` : vue à la sonde d'atelier, absente du DDL de cet arbre, donc
  propre à une base plus ancienne. Ni adoptée, ni migrée, ni supprimée ; si elle porte des
  fichiers un jour, c'est P2.2+ qui tranche (et la politique média du §4 s'appliquerait).
- `UNKNOWN` — décision produit de redistribution des privilèges : aujourd'hui ADMIN et
  CONTENT_MANAGER gardent la parité avec l'ancien écran, ORDER_MANAGER n'a **rien** (il n'avait
  déjà aucun accès produit). Le rendre possible ne veut pas dire le faire.
- `UNKNOWN` — conventions de slug de la vitrine : `products.slug` est neuf ; aucune route publique
  ne le lit encore (elles utilisent `id`). Exposer `/produit/<slug>` est une décision P2.2/front.
