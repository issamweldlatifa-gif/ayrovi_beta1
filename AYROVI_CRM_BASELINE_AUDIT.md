# AYROVI CRM — BASELINE AUDIT (Phase 0)

**Portée :** audit de découverte et ligne de base du dépôt avant toute modification liée au CRM.
**Règle appliquée :** aucune ligne de production n'a été modifiée par ce document. Toutes les affirmations ont été vérifiées contre le code réel (`src/`, `client/src/`, `tests/`), jamais déduites de la documentation.
**HEAD observé :** `6bea0f5` (branche `main`) · Version applicative `3.10.4` · Date : 2026-09-07
**Méthode :** lecture directe + comptages outillés (`grep`/`awk`/`wc`) + exécution réelle de `npm test`, `npm run build`, `tsc --noEmit`.

---

## 0. Résumé exécutif

AYROVI est un **monolithe Express + React (Vite) + SQLite** mature (≈ **72 663** lignes TS/TSX suivies, **101** tables DDL distinctes, **49** fichiers de test) qui possède déjà une **fondation ERP partagée** (`src/erp-core/`, registre de modules, identité employé, un seul rédacteur d'audit, événements dérivés, séquences de numérotation, moteur de permissions en données) et une **coquille Back Office** (`src/back-office/`, navigation dérivée, framework de ressources, recherche globale, thème).

Le mot « CRM » est **déjà consommé par deux sens différents** :

1. **`module: 'crm'` = « CRM / Arrivages »** dans `ERP_MODULES` et dans les descripteurs (`crm.arrival`, groupe de navigation « Commerce ») → il désigne le système d'ingestion d'arrivages `src/arrival-ingestion/` (45 endpoints, 14 tables `crm_*`). Ce système est une **machine d'opérations logistique**, pas une gestion de relation client.
2. **Domaines `CRM`** dans le framework (`BackOfficeDomain = 'CRM'`) → utilisés par trois écrans très différents : `crm.arrival` (arrivages), `crm.party` (écran « Clients », **lecture seule**), `support.ticket` (tickets de l'assistant IA).

**Conclusion mesurée : il n'existe aujourd'hui AUCUN noyau CRM de relation** : pas de modèle `Party`/`Contact`/`Relationship`, pas d'activités, de tâches, de notes, de follow-ups, de dossier support client générique, de timeline 360°, de recherche CRM transverse ni de tableau de bord relation. Ce qui existe est un ensemble de **capacités voisines, non reliées** : clients de commande (`customers`), comptes e-commerce (`customer_accounts`), fournisseurs achats (`suppliers`), tickets assistant (`assistant_support_tickets`), notifications in-app (`admin_notifications`), journal d'audit unifié (`audit_logs` + `erp_audit_changes`).

Le travail CRM n'est donc **pas** un greenfield, mais il n'est **pas non plus** une extension d'un CRM existant : c'est la construction d'un **domaine relationnel propre** (`src/crm/`) qui **réutilise l'échafaudage ERP existant** et **raccorde** les entités voisines sans les réécrire.

---

## 1. Architecture actuelle (mesurée)

### 1.1 Vue d'ensemble

```text
AYROVI — un processus Express, une instance SQLite
│
├── client/  (Vite → public/, servi par express.static)
│   ├── /         PublicApp (e-commerce, Lens, assistant, compte client)
│   └── /admin    AdminApp + coquille Back Office (navigation dérivée)
│
├── src/server.ts        (374 l.) — montage, CSP, rate limiting, routers
│   ├── /api/admin       createAdminRouter(db) — router « maison » + enfants de modules
│   │   ├── legacy        src/admin/routes.ts (94 routes déclarées, 2 009 l.)
│   │   ├── /core         erp-core/routes.ts (17)
│   │   ├── /catalogue    catalogue/routes.ts (27)
│   │   ├── /inventory    inventory/routes.ts (20)
│   │   ├── /purchasing   purchasing/routes.ts (27)
│   │   ├── /back-office  back-office/routes.ts (6)
│   │   └── /arrival-ingestion  arrival-ingestion/routes.ts (45)
│   ├── /api/ayrovix      ayrovix/routes.ts (Lens)
│   ├── /api/customer     customer/routes.ts (39)
│   ├── /api/assistant / /api/voice
│   ├── /api/public       public/routes.ts (26)
│   └── /api              api/routes.ts (7)
```

Routers et routes déclarées (comptage `router.(get|post|put|patch|delete)(` par fichier) :

| Router | Routes | Fichier |
|---|---|---|
| `src/admin/routes.ts` (legacy + moteur générique) | 94 | 2 009 l. |
| `src/arrival-ingestion/routes.ts` | 45 | — |
| `src/customer/routes.ts` | 39 | — |
| `src/catalogue/routes.ts` | 27 | — |
| `src/purchasing/routes.ts` | 27 | — |
| `src/public/routes.ts` | 26 | — |
| `src/inventory/routes.ts` | 20 | — |
| `src/erp-core/routes.ts` | 17 | — |
| `src/back-office/routes.ts` | 6 | — |
| `src/ayrovix/routes.ts` | — | — |
| `src/api/routes.ts` | 7 | — |
| `src/assistant/routes.ts` | 6 | — |

### 1.2 Les couches transverses existantes (à réutiliser, pas à réinventer)

| Brique | Fichier | Rôle mesuré |
|---|---|---|
| Registre de modules | `src/erp-core/modules.ts` | 21 modules `active/legacy/planned`, sections CORE/OPERATIONS/FINANCE/CONTENT/SYSTEM. **`crm` y désigne déjà les arrivages.** |
| Identité employé | `src/erp-core/identity.ts` | `erp_employees` lié 1:1 à `admin_users`, backfill au boot, code `EMP-xxxxxx`. Les employés = « utilisateurs internes » cibles des affectations CRM. |
| Moteur de permissions | `src/erp-core/permissions.ts` | Grants **en données** `erp_role_permissions(role, module_key, action, resource_type, scope, granted)` ; `can()` ; garde `requireErpPermission(...)` ; **legacy toujours gagnant** (un accès existant ne peut pas être verrouillé par la table). |
| Permission legacy | `src/admin/permissions.ts` | 4 rôles (`SUPER_ADMIN/ADMIN/CONTENT_MANAGER/ORDER_MANAGER`), 14 chaînes `module:action`, `hasPermission()`, `requireAdmin(db, perm)` = session HttpOnly + scrypt + **CSRF sur les écritures**. |
| Audit unique | `src/erp-core/audit.ts` | **Un seul rédacteur** `writeAuditEvent()` (+ `fieldDiff` → `erp_audit_changes` par champ), verbes métier, colonnes additives (session/request/employee…), `finalizeRequestAudit()`. Wrapper legacy `recordAdminAudit()` dans `src/admin/audit.ts`. Aucun `INSERT` direct dans `audit_logs` hors de ce rédacteur (pratique appliquée par les modules). |
| Événements | `src/erp-core/events.ts` | `erp_events` durables dérivés des écritures auditées. |
| Séquences | `src/erp-core/sequences.ts` | `erp_sequences` + `nextSequenceNumber()` (identifiants courts, sans trous). Clés actuelles : employé/organisation/branche/département/équipe. |
| Notifications | `src/erp-core/notifications.ts` + legacy | `notifyAdminUser()` / `notifyCustomerAccount()` (tables existantes + payload `data`/`source`) et `queueDelivery()` (`erp_notification_deliveries` = outbox). Bell admin : `GET/POST /api/admin/notifications`, `POST /notifications/read-all` (legacy `dashboard:read`). Types du CHECK existant : `GENERAL/DEPOSIT_REVIEW/ORDER/SYSTEM`. |
| Framework de ressources | `src/back-office/resources.ts` | Descripteurs `domaine.entité` (clé, libellé, module ERP, permission de nav, section, alias, surface `framework|custom`, colonnes/champs, actions, vocabulaire de statut, module d'audit). ~40 ressources déclarées. |
| Navigation dérivée | `src/back-office/navigation.ts` | Groupes calculés à partir des descripteurs + registre ERP + autorisation (cache 30 s). `canSeeSection()` : legacy d'abord, grant ERP ensuite. |
| Recherche globale | `src/back-office/search.ts` | 8 sources fixes (produits, marques, news, arrivages, commandes, **clients**, arrivages CRM, employés), allowlists de colonnes, 5 lignes/source, lecture auditée `ACCESS`. |
| Statuts partagés | `src/domain/statuses.ts` | Vocabulaires + libellés FR/AR + tons ; `STATUS_VOCABULARIES` alimente les descripteurs. |
| Schémas des modules | `src/db/database.ts` (constructeur) + `*/bootstrap.ts` | Chaque module expose `ensureXSchema()` (idempotent) appelé dans le constructeur DB **et** à la première requête via `router.use` (boot à la demande, jamais bloquant). `db.ensureColumn()` pour les ajouts de colonnes. |
| Stockage | `src/erp-core/storage.ts` + `src/documents/fileAccess.ts` | Uploads publics par allowlist (`PUBLIC_UPLOAD_DIRS=['hero']`…), documents privés servis par endpoints autorisés, tous les accès (accordés/refusés) auditables. |

---

## 2. Capacités CRM existantes (l'existant à raccorder)

| Capacité | Où | Ce qu'elle fait | Limites mesurées |
|---|---|---|---|
| **Fiches « clients » de commande** | table `customers` | Créée au checkout (recherche par téléphone normalisé, `db/database.ts:2528`) et par l'ingestion d'arrivages (`arrivalClientService.ts:332`). Champs : name/phone (UNIQUE)/normalized_phone/governorate/address/status ACTIVE·INACTIVE·BLOCKED. | Aucun CRUD admin. Pas d'e-mail, de tags, de propriétaire, de source, de note, ni de lien vers contacts/entreprises. Duplique potentiellement `customer_accounts` (DUP-01 documentée). |
| **Comptes e-commerce** | table `customer_accounts` | Identité de connexion (Google/Facebook/SMS OTP) : display_name, email UNIQUE, phone UNIQUE, statuts ACTIVE/BLOCKED/DELETED, préférences marketing, adresses, favoris. | C'est un **compte d'authentification**, pas un profil relationnel. |
| **Écran « Clients »** | `client/src/admin/AdminApp.tsx` → `CustomersPage` ; API `GET /customers`, `GET /customers/:id` (orders incluses), `GET /customer-accounts`, `GET /customer-accounts/:id`, `PUT /customer-accounts/:id/status` | Deux onglets **lecture seule** : « Comptes enregistrés » et « Fiches de commande », avec commandes, valeur client, adresses. | Aucune création, modification, affectation, note ou activité possible depuis l'écran. |
| **Fournisseurs (partenaires fournisseurs)** | table `suppliers` (module purchasing P2.3) | Entité entreprise avec code UNIQUE, contact_name/phone/email/address, devise, conditions, délai, statut, notes, created_by/updated_by. CRUD complet + audit module. | Modèle isolé dans `purchasing/` : pas un modèle `Party` partagé. Pas de lien vers les contacts multiples ni l'historique de relation. |
| **Tickets support assistant** | table `assistant_support_tickets` | Tickets escaladés depuis l'assistant : reason, contact, statut PENDING/IN_PROGRESS/RESOLVED/CLOSED, priorité NORMAL/HIGH, `assigned_to` (admin_users), note interne. API + écran `AssistantSupportPage`. | Liés à une conversation/`conversation_id` de l'assistant : ce n'est pas un système de dossiers/issues CRM rattaché à un Party. |
| **Notifications internes** | `admin_notifications` (+ `erp_notification_deliveries`) | Bell du back office, marquage lu, endpoints legacy. | Types CHECK restreints ; pas encore d'abonnements métier CRM (tâche échue, issue assignée…). |
| **Audit de bout en bout** | `audit_logs` + `erp_audit_changes` | Qui/quoi/quand/avant/après/champs, acteur employé, refus et lectures sensibles tracés. | Doit simplement être **appelé par chaque mutation CRM** (aucun nouveau rédacteur). |
| **Recherche globale** | `back-office/search.ts` | Cherche déjà dans `customers` (nom/téléphone/adresse) → ouvre `section=customers`. | 1 source « clients » seulement ; pas de recherche parties/contacts/activités/tâches/issues. |
| **Employés/organisation** | `erp_employees`, `erp_organizations/branches/departments/teams` | Identité des collaborateurs (futurs owners des tâches CRM) et portées de permission. | — |
| **Événements** | `erp_events` | Log durable dérivé ; page « Événements ». | Ne reflète que les écritures auditées existantes. |

### L'ingestion d'arrivages `arrival-ingestion` (alias historique « CRM »)
Système opérationnel complet (20 fichiers, ~5 387 l., 45 endpoints, 14 tables `crm_*`, jobs durables, SCD-2, gates de classification, dispatch). **Décision : intouchable et hors périmètre relationnel.** Son nom `crm` dans le registre est un **conflit de nommage à documenter et à lever proprement** (voir §10 REC-01).

---

## 3. Entités existantes (inventaire des tables, 101 DDL distinctes)

Regroupement fonctionnel des tables hors `erp_*`/`catalogue_*`/`inventory_*`/`crm_arrival*` :

- **Ventes/OMS :** `orders`, `order_items`, `order_status_history`, `payments`, `payment_transactions`, `payment_proofs`, `invoices`, `deliveries`, `cart_items`, `expenses`
- **Clients :** `customers`, `customer_accounts`, `customer_addresses`, `customer_favorites`, `customer_preferences`, `customer_notifications`, `customer_auth_identities`, `customer_sessions`, `customer_otp_challenges`, `customer_oauth_states`
- **Commerce/catalogue :** `products`, `product_arrivals`, `promotions`, `promotion_products`, `promotion_arrivals`, `brands`, `categories` (customs), `catalogue_categories`, `catalogue_variants`, `catalogue_media`, `catalogue_attributes`, `catalogue_attribute_values`
- **CMS/marketing :** `arrivals`, `news_items`, `stories`, `story_interactions`, `story_publishers`, `publications`, `reels`, `magazine_drafts`, `hero_slides`, `hero_visuals`, `hero_content_settings`, `home_blocks`, `trust_bar_items`, `trust_bar_settings`, `settings`, `announcement_messages`
- **Support/connaissance :** `assistant_support_tickets`, `assistant_feedback`, `ai_knowledge`, `assistant_tool_audit`, `assistant_tool_idempotency`
- **ERP :** `erp_organizations`, `erp_branches`, `erp_departments`, `erp_teams`, `erp_employees`, `erp_role_permissions`, `erp_events`, `erp_audit_changes`, `erp_sequences`, `erp_notification_deliveries`
- **Achats :** `suppliers`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`
- **Stock :** `inventory_stock_items`, `inventory_stock_movements`, `inventory_stocktakes`, `inventory_stocktake_lines`
- **Arrivages :** `crm_stores`, `crm_store_source_profiles`, `crm_arrivals`, `crm_arrival_clients`, `crm_arrival_client_stores`, `crm_arrival_sources`, `crm_extraction_jobs`, `crm_extracted_products`, `crm_shipments`, `crm_shipment_cartons`, `crm_shipment_dispatches`, `crm_warehouse_dispatches`, `crm_categories`, `crm_schema_migrations`
- **Système/admin :** `admin_users`, `admin_sessions`, `admin_notifications`, `audit_logs`

**Aucune table ne correspond à :** party, contact, relation, activité, tâche/follow-up, note, issue/dossier CRM, communication (sauf tickets + notifications), timeline.

---

## 4. APIs existantes pertinentes pour le CRM

| API (admin) | Méthodes | Garde | Audit | Notes |
|---|---|---|---|---|
| `/customers`, `/customers/:id` | GET | `commerce:read` | — (lecture) | Retourne fiches + compte lié + commandes. |
| `/customer-accounts`, `/:id` | GET | `commerce:read` | — | |
| `/customer-accounts/:id/status` | PUT | `orders:write` | `audit(...)` legacy | Verbe métier « bloquer/réactiver ». |
| `/assistant-support*` | GET/PUT | `commerce:read`/`orders:write` | oui | Tickets escaladés. |
| `/notifications`, `/:id/read`, `/read-all` | GET/POST | `dashboard:read` | — | Bell admin. |
| `/core/employees`, `/core/organization`, `/core/permissions`, `/core/audit`, `/core/events` | GET/POST/PUT | `users:write`/grants | oui | Routeur ERP : employés, org, grants, audit, événements. |
| `/purchasing/suppliers*` | CRUD | `commerce:read` + grants `purchasing:*` | `writeAuditEvent` | Fournisseurs (partenaires). |
| `/back-office/navigation`, `/back-office/search`, `/back-office/resources` | GET | par rôle | lecture sensible tracée | Coquille. |
| Moteur générique (dans `admin/routes.ts`, `resources`) | list/view/edit | `content:*` etc. | via `finalizeRequestAudit` | Écrans « framework ». |

**Contrats de réponse partagés :** `{ success, data, pagination }` ; dialecte de liste `page/pageSize/search/status/sort/direction` ; erreurs `{ success:false, code, error }` ; **aucun** `500` générique pour un refus métier (table `STATUS_BY_CODE` par module).

---

## 5. Écrans existants (coquille Back Office)

Groupes de navigation actuels issus des descripteurs : « Vue générale » (dashboard), « Contenu », « Commerce », « ERP », « Système ». Les écrans liés de près ou de loin au CRM sont, dans **Commerce** :
`ArrivalIngestionPage` (`crm.arrival`), `OrdersPage` (`sales.order`), `AssistantSupportPage` (`support.ticket`, « Support IA »), `LensRequestsPage`, **`CustomersPage`** (`crm.party`, « Clients »), `ReportsPage`.

Il n'existe **pas** de groupe « CRM » ni d'écran Dashboard CRM, Parties (360°), Contacts, Activités, Tâches/Follow-ups, Issues, Rapports relationnels.

---

## 6. Flux existants (workflows)

1. **Checkout → fiche client** : commande créée ; `customers` recherchée/créée par téléphone normalisé (`db/database.ts:2528`) ; `orders.customer_id` rattache la fiche.
2. **Compte client** : inscription Google/Facebook/SMS OTP → `customer_accounts` ; rattachement d'anciennes commandes vérifié par téléphone.
3. **Écran Clients (lecture)** : liste + détail = commandes du client / comptes et adresses. **Fin du flux — aucune action de suivi.**
4. **Ticket assistant** : conversation escaladée → ticket support → assigné/note/résolu/clos par l'équipe (modulo conversation).
5. **Employé** : backfill auto `admin_users` → `erp_employees` au boot ; gestion des rattachements.
6. **Grants** : édition de la matrice `module:action:resource:scope` en données ; auditée.
7. **Recherche** : barre globale → ouvre la section d'une source.
8. **Notifications** : bell admin (lues/non lues) ; l'outbox `erp_notification_deliveries` documente l'intention d'envoi.

---

## 7. Permissions existantes

- **Legacy** (4 rôles × 14 permissions `module:action`) : `dashboard:read`, `content:read/write`, `commerce:read`, `orders:write`, `pricing:write`, `payments:write`, `settings:write`, `users:write/read`, `ai:read/write`, `audit:read`, `reports:read/write`.
- **ERP (en données)** : `erp_role_permissions` avec `module/action/resource_type/scope` ; seeds miroir du legacy (`origin=SEED`) ; `can()` ; `requireErpPermission()` ; **parité garantie : legacy gagne toujours** ; ajout de droits nommables (`approve`, `export`, `delete`, `assign`, `manage`).
- Les écrans « Clients »/« Support IA »/« Arrivals CRM » sont **encore gated `commerce:read` / `orders:write`** (décisions legacy explicites, aucun grant `crm:*`/`sales:*` semé pour eux). Les descripteurs le déclarent honnêtement (`permissions: {}`).
- Les routes module récentes (purchasing…) composent **deux gardes** : `requireAdmin(db, …)` puis `can()`/`requirePurchasing` avec **refus audités**.

---

## 8. État des tests et de la validation (mesuré dans ce dépôt)

- **`npm install`** : succès (363 paquets).
- **`npm run build`** (vite + esbuild) : succès (le client n'étant pas inclus dans le dépôt, `public/` doit être produit par le build avant les tests qui dépendent du fallback SPA).
- **`npm test`** : **603 tests, 49 fichiers** — voir résultat du baseline en §8.1.
- Typecheck `tsc --noEmit` (serveur) et `tsc -p tsconfig.client.json` : exécutés comme porte de sortie à chaque phase.

### 8.1 Résultat du run de baseline dans cet environnement
- Après `npm run build` (création de `public/`), **`npm test` → 49 fichiers passés / 603 tests passés, exit 0** (durée ≈ 50 s). La suite est **entièrement verte** sur ce dépôt ; elle constitue le verrou de non-régression pour toutes les phases CRM (aucun test ne sera affaibli).
- NB : sans build client préalable, 4 tests du fallback SPA échouent (`public-upload-policy`…) — comportement d'environnement (le client n'est pas versionné), pas un défaut du code.

---

## 9. Dette technique, duplication, dysfonctionnements, manques

### 9.1 Dette / duplication mesurée (hors périmètre strictement CRM mais à connaître)
- **DUP-01 — deux identités client** : `customers` (fiche de commande) vs `customer_accounts` (compte de connexion). Le pont est indirect (`orders.account_id`/`customer_id`). La Discovery l'a documentée ; l'écran Clients expose les deux sans les fusionner. **C'est LE risque de doublon d'un CRM.**
- **DUP-02 — le nom « CRM »** est déjà pris (arrivages) dans le registre ERP ET dans le framework (domaine `CRM` = arrivages/clients/support mêlés).
- **DUP-03 — vocabulaire** : historiquement 127 occurrences de statuts dispersées ; la couche `domain/statuses.ts` est la réponse en cours (le CRM doit y ajouter ses vocabulaires, pas les inventer).
- **Legacy `audit_logs`** vs moteur ERP : deux lecteurs, un seul rédacteur depuis P1 (`writeAuditEvent`). L'écran « Journal d'audit (legacy) » sera fusionné visuellement (DUP-06) ; l'API reste.
- `src/admin/routes.ts` (2 009 l.) reste un « couteau suisse » legacy (SQL dans les handlers pour l'OMS/checkout) ; les **nouveaux** modules appliquent le patron « service + routes minces + validation + audit », c'est le patron à suivre pour le CRM.
- Pas de pagination sur certaines lectures profondes (ex. `orders` entier d'un client dans `GET /customers/:id`, potentiellement lourd).
- `assistant_support_tickets.status` a des libellés manquants dans `STATUS_LABELS` (OPEN/WAITING absents car non utilisés) — à compléter par vocabulaires CRM.

### 9.2 Dysfonctionnements / lacunes bloquants pour un CRM
1. **Aucune écriture CRM** : on ne peut ni créer, ni éditer, ni archiver un Party, ni lui affecter un owner depuis l'admin.
2. **Aucun 360°** : pas de timeline consolidée (commandes + tickets + notes + activités + tâches).
3. **Aucun suivi** : pas de tâches/follow-ups/échéances ; un client « disparaît » après sa dernière commande.
4. **Pas de « prochaine action »** ni de notion de propriétaire interne sur les relations.
5. **Pas de détection de doublons** à la création (l'unicité `phone` protège `customers`, mais pas l'email ni les entreprises ; rien n'empêche 2 `customer_accounts` pour une même personne avec 2 téléphones).
6. **Pas de dashboard CRM** réel (les KPI existants sont commerciaux/financiers).
7. **Pas de recherche CRM transverse** au-delà de la source `customers`.
8. **Pas de notifications métier** (échéances, affectations) pour les employés.
9. **Support limité** : pas de dossier issue rattachable à un Party avec cycle complet configurable.
10. **Communication** : aucune notion générique de communication liée à un Party/Contact (mail/WhatsApp/SMS) — seul `assistant_support_tickets` et les notifications.

### 9.3 Risques sécurité mesurés (à traiter dans la conception CRM)
- **IDOR potentiel** : tout nouvel endpoint CRM doit être testé en cross-ressource (un ORDER_MANAGER ne doit pas lire les notes d'un CONTENT_MANAGER, etc.).
- **Frontend ≠ frontière** : l'écran legacy « Clients » masque déjà les boutons par `canWrite`, mais les routes font foi. Les nouvelles routes CRM devront **toujours** faire respecter la permission côté serveur et **auditer les refus**.
- **Mass assignment** : création/édition de Party depuis l'API → projection stricte des champs (pas de `body` brut).
- **Validation** : `parsePositiveInteger`, longueurs plafonnées (`slice`), LIKE paramétrés (jamais d'interpolation), allowlists — conventions à reprendre.
- **Données sensibles** : téléphone/e-mail/notes internes = données personnelles ; les exports/lectures en masse doivent être audités (déjà le cas pour l'export orders.csv).
- **Rate limiting** : mécanisme en mémoire existant (`rateLimit(name, limit, window, keyFn)`) ; à appliquer aux endpoints CRM coûteux/écrits si nécessaire.

### 9.4 Risques d'intégrité des données
- Référentiel dispersé (`customers` / `customer_accounts` / `suppliers`) sans table de correspondance.
- `customers.phone UNIQUE` : bonne barrière partielle, mais les téléphones peuvent être vides/différents ; pas de normalisation au niveau des comptes pour la détection de doublon inter-tables.
- Pas de suppression douce généralisée (soft-delete) pour les fiches relationnelles (archivage à définir — `customers` n'a que ACTIVE/INACTIVE/BLOCKED ; `suppliers` a ACTIVE/INACTIVE).
- Pas de clés étrangères entre `orders` et `customers` dans la DDL d'origine ? (à vérifier par `PRAGMA foreign_key_list`) — la cohérence est assurée en code.

---

## 10. Recommandations d'ordre d'exécution (Phase 0 → plan CRM)

Le plan d'exécution du CRM se cale sur l'existant au lieu de le contourner :

- **REC-01 — Nommage.** Introduire un module ERP **`crm360` (ou `crm-core`)** distinct de l'arrivage ; renommer **dans les libellés** le module existant « CRM/Arrivals » → « Arrivages / Ingestion » (les clés internes restent pour ne rien casser) ; déclarer un **domaine de navigation « CRM »** propre dans le framework. Décision de registre documentée et **testée**.
- **REC-02 — Domaine.** Construire `src/crm/` sur le patron module : `types.ts`, `validation.ts`, `bootstrap.ts` (DDL idempotente), services (`parties`, `contacts`, `activities`, `tasks`, `notes`, `issues`, `timeline`, `search`, `dashboard`), `permissions.ts`, `routes.ts` (monté sous `/api/admin/crm`), tout l'audit par `writeAuditEvent`. Tables : `crm_parties` (type individual/company, catégories customer/partner/supplier/prospect…), `crm_contacts`, `crm_relationships`, `crm_activities`, `crm_tasks`, `crm_notes`, `crm_issues`, + timeline/liens de référence, `crm_party_links` vers orders/tickets/suppliers existants.
- **REC-03 — Raccordement sans réécriture.** Garder `customers`/`customer_accounts`/`suppliers`/`assistant_support_tickets` **intacts** ; ajouter des colonnes de correspondance ou une table `crm_party_refs` ; l'écran Clients legacy devient une porte d'entrée vers le profil 360°. Aucune route existante ne change de comportement (règle « additif d'abord, retraite ensuite »).
- **REC-04 — Permissions.** Nouveaux droits `crm:*` nommables **en données** (grants) **sans verrouiller** : les rôles legacy qui ont déjà `commerce:read`/`orders:write` sur les écrans clients actuels gardent l'accès (parité), les nouveaux écrans exigent un grant CRM explicite.
- **REC-05 — Séquences.** `crm_party_code` (CUS-/SUP-/PRT-), `crm_issue_no`, etc. via `erp_sequences`.
- **REC-06 — Notifications.** Abonnements/échéances CRM via `notifyAdminUser` + `queueDelivery` (pas de nouveau canal ad hoc).
- **REC-07 — Recherche.** Étendre `back-office/search.ts` par de nouvelles sources (parties, contacts, tâches, issues) sans enlever les existantes.
- **REC-08 — Vocabulaires.** Ajouter dans `domain/statuses.ts` les états CRM (`activity`, `task`, `issue`, `party`) avec libellés FR/AR — une source, pas d'invention dans les écrans.
- **REC-09 — Porte de sortie à chaque phase** : `tsc` 0, `tsc -p tsconfig.client.json` 0, `npm run build` ok, `npm test` ≥ baseline **sans aucun test affaibli**, worktree propre, commit+push.
- **REC-10 — Docs miroir de la commande** : `AYROVI_CRM_ARCHITECTURE.md`, `AYROVI_CRM_DOMAIN_MODEL.md`, `AYROVI_CRM_API.md`, `AYROVI_CRM_PERMISSIONS.md`, `AYROVI_CRM_WORKFLOWS.md`, `AYROVI_CRM_TEST_MATRIX.md`, `AYROVI_CRM_CLOSURE_REPORT.md`.

### Ordre d'exécution proposé (map sur les phases de la commande)
| Étape | Contenu | Correspondance commande |
|---|---|---|
| E0 | Ce document (baseline) | Phase 0 |
| E1 | Module `crm360` : DDL `crm_parties`/`crm_contacts` + relations, détection doublons, validation | Phases 1, 2, 13 |
| E2 | Activités + tâches/follow-ups + notes + issues + timeline (services + API + audit) | Phases 3, 4, 5, 7 |
| E3 | Permissions `crm:*` + audit complet + intégration notifications | Phases 11, 12, 10 |
| E4 | Recherche globale étendue + dashboard CRM (KPIs réels) | Phases 8, 9 |
| E5 | UI : groupe CRM (Dashboard, Parties, Contacts, Activités, Tâches, Follow-ups, Issues) + profil 360° (header, quick actions, timeline, onglets) | Phases 15, 16 |
| E6 | Tests matrice (unité/API/intégration/E2E), performance/indexation, revue sécurité, cleanup | Phases 17, 18, 19, 20 |
| E7 | Documentation + Closure Report | §24 |

Chaque étape est close par un **gate** (§26 de la commande) ; rien n'est marqué DONE sans preuve.

---

## 11. Annexes — données brutes de la mesure

- Fichiers suivis : 927+ ; total TS/TSX : 72 663 lignes ; back-office + erp-core : 3 273 lignes.
- 101 DDL distinctes sur `src/` (dédup `awk`), dont 75 déclarées dans `src/db/database.ts` (2 tables créées deux fois : `customer_oauth_states`, `customers_customs`? → `customs_categories`, `customer_oauth_states` — doublons documentés dans AUDIT_ERP_2026-09-05) ; 4 index déclarés deux fois.
- Routes déclarées par router : cf. §1.1.
- Tests : 49 fichiers, 603 cas (baseline à confirmer après build).
- README de validation : `npm run typecheck && npm test && npm run build`.
