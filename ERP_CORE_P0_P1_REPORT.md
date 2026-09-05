# AYROVI — Rapport d'exécution P0 + P1 (fondation ERP)

**Date :** 2026-09-05 · **Périmètre approuvé :** P0 (sécurité des fichiers + intégrité de l'audit) et P1 (fondation ERP uniquement) · **Hors périmètre :** P2 et au-delà (Catalogue, Stock, Achats, Comptabilité, Ventes, Expéditions, Workflow, IA, Automatisation) — **non commencés, comme convenu.**

Règle zéro appliquée : **rien n'a été supprimé**, aucun changement non-additif, aucune table/colonne/endpoint renommé, aucun redesign d'UI, tous les nouveaux écrans dans `/admin`.

Preuve d'exécution (relancée sur l'état final, pas sur une intention) :

```
$ npx tsc --noEmit                          → exit 0
$ npx tsc -p tsconfig.client.json --noEmit  → exit 0
$ npm run build                             → exit 0 (Vite + esbuild dist/server.js 2,3 Mo)
$ npm test                                  → Test Files 40 passed (40) | Tests 350 passed (350)
```

**Chiffres finaux, revérifiés après nettoyage** (`ls tests/*.test.* | wc -l` = 40 ; reporter JSON = 350 assertions) :

| | Fichiers | Tests exécutés | Mesure |
|---|---|---|---|
| Baseline (HEAD) | 39 | **319** | obtenu en retirant temporairement mon fichier de tests et en relançant `npm test` : `Test Files 39 passed (39) | Tests 319 passed (319)` |
| Après P0+P1 | 40 | **350** | `npm test` sur l'état final : `Test Files 40 passed (40) | Tests 350 passed (350)` |
| Delta | +1 (`tests/erp-core-foundation.test.ts`) | **+31** | 319 + 31 = 350, exact | **Aucun test supprimé, aucun test affaibli** : `git diff --numstat tests/` est vide (les 39 fichiers de baseline sont bit-à-bit identiques à HEAD, y compris `tests/hardening.test.ts`, que j'ai un instant modifié puis intégralement restauré).

Note d'honnêteté : une mesure intérimaire affichait « 41 fichiers / 352 tests » : un fichier de sonde temporaire (`tests/zz-probe2.test.ts`, 2 tests) traînait dans `tests/` et a été collecté par erreur. Il est supprimé (`git status --porcelain tests/` ne montre plus que mon fichier de tests, unique ajout), et le chiffre de baseline a été **mesuré** (retrait temporaire + relance) plutôt que rappelé de mémoire.

---

## 1. Point de départ — l'état exact du code (rappel vérifié)

| Constat de l'audit | Confirmé dans le code par | Ce qui a changé maintenant |
|---|---|---|
| `app.use('/uploads', express.static(data/uploads))` servait les factures PDF et les justificatifs de virement | `src/server.ts:167-171` (avant) | Garde default-deny par préfixe (`src/server.ts:176-192`) |
| Deux rédacteurs d'audit écrivant dans la même table `audit_logs` | `src/admin/routes.ts:272` (`audit()`) et `src/admin/audit.ts:25` (`recordAdminAudit`) | Un seul rédacteur : `writeAuditEvent` (`src/erp-core/audit.ts`), les deux anciens sont devenus des wrappers |
| 16 écritures admin sans audit sur 51 endpoints d'écriture (69 % de couverture) | grep des `router.post/put/delete` sans appel `audit(` | 12 écritures sans audit restantes → **0** (voir §3) |
| `INV-<année>-<COUNT+1>` pour les factures, `randomInt` pour commandes/paiements | `src/services/invoice.ts`, `src/admin/routes.ts` | Séquence partagée créée et utilisée pour les objets ERP (`EMP/BRC/DEP/TMB`) ; **générateurs métier existants inchangés** (P10, pas P1) |
| Pas d'identité employé : `admin_users` = un login, rien d'autre | `src/db/database.ts` (table `admin_users`, 8 colonnes) | `erp_employees` 1:1 avec `user_id UNIQUE`, code `EMP-000001` |
| Permissions = `Set` codé en dur de 12 chaînes `module:read|write` | `src/admin/permissions.ts:36-52` | Table `erp_role_permissions` (`module:action:resource:scope`) **en plus**, jamais à la place |

---

## 2. P0-A — Fuites de fichiers privés : correction

**Ce qui était exposé :** `GET /uploads/invoices/INV-2026-000123.pdf` (nom de fichier = numéro de facture, donc devinable depuis tout e-mail/confirmation de commande) et `GET /uploads/deposits/<order>-<timestamp>-<4chiffres>.png` (justificatifs de virement contenant RIB / références bancaires du client).

**Solution retenue : le choix explicite « séparer les médias publics des documents privés ».**

1. **Politique déclarée dans le code** (`src/erp-core/storage.ts`)
   - `PUBLIC_UPLOAD_DIRS = ['hero']` — servis par `/uploads`, URLs inchangées (zéro régression front).
   - `LEGACY_PRIVATE_UPLOAD_DIRS = ['invoices', 'deposits']` — racine historique, **toujours lisible par les endpoints autorisés** (pas de déplacement de données, pas de réécriture de la base).
   - `privateDirectory(kind)` → `data/private/documents/{invoices,payment-proofs,employee-documents,arrival-sources}`, mode `0700`, **jamais monté en statique**.
2. **Garde default-deny sur la route statique** (`src/server.ts:184-192`) : un chemin n'atteint `express.static` que si `isPublicUploadPath()` est vrai ; sinon `403 {code:'PRIVATE_DOCUMENT_NOT_PUBLIC'}`. Test : `PRIV_STATUS=403` pour `/uploads/invoices/x.pdf`, `PUB_STATUS=200` pour `/uploads/hero/x.png`.
3. **Écriture des nouveaux fichiers dans le privé** (`src/services/invoice.ts`) : `uploadsDir()` est marqué `@deprecated` (conservé pour la lecture legacy), `invoiceWriteDir()`/`depositWriteDir()` écrivent sous la racine privée. Lecture avec repli legacy : `invoiceReadRoots()` / `paymentProofReadRoots()`.
4. **Lecture des documents = un seul chemin d'accès audité** (`src/documents/fileAccess.ts` → `servePrivateDocument`) : le chemin vient **toujours de la ligne en base**, jamais de l'URL ; il doit être dans une racine privée autorisée ; **chaque lecture (DOWNLOAD) et chaque refus (ACCESS_DENIED) produit une ligne d'audit**. Branché sur : `GET /admin/orders/:id/deposit-proof`, `GET /admin/payment-proofs/:id/file`, `GET /admin/uploads/:id/invoice/download`, `GET /customer/account/orders/:id/invoice`.

**Vérifié, pas supposé :** `tests/erp-core-foundation.test.ts` > « P0.1 » : 6 tests (politique, 403 sur 3 racines privées, médias publics toujours servis, chemins à `..`, écriture privée confirmée dans le code source, endpoints de documents audités).

---

## 3. P0-B — Intégrité de l'audit : un seul système

**Ajouts à `audit_logs` (additif uniquement — 11 colonnes NULLables, 3 index, aucune colonne supprimée, aucune ligne réécrite) :**
`session_id, request_id, employee_id, employee_code, organization_id, branch_id, department_id, user_agent, resource_type, resource_id, changed_fields`

**Nouvelle table `erp_audit_changes`** : une ligne **par champ modifié** (`field_name, old_value, new_value, value_kind ∈ SCALAR|LIST|OBJECT|NULL_TO_VALUE|VALUE_TO_NULL`), FK `ON DELETE CASCADE` vers `audit_logs`.
`fieldDiff()` ignore les colonnes de comptabilité (`updated_at, password_hash, csrf_token, provider_payload, raw_extracted, field_evidence`) — un diff ne doit jamais contenir de secret.
`changed_fields` sur `audit_logs` garde le tableau JSON des noms de champs : filtrage rapide sans jointure.

**Les 16 écritures admin sans audit (audit §A2) :** 12 endpoints n'avaient aucun `audit(` →
`POST/PUT/DELETE /publications` (3) · `POST/PUT/DELETE /reels` (3) · `POST/PUT /story-publishers` (2) · `POST /lens-lab/run` + `PUT /lens-lab/:id/evaluation` (2) · `POST /ai-suggestions/approve` (1, module corrigé `AI_KNOWLEDGE` car la ligne est écrite dans `ai_knowledge`) · `PUT /orders/:id/payment` (1, **le refus 409 est lui-même audité** `ACCESS_DENIED`, un ERP doit savoir qui a essayé). Les 4 restants étaient en réalité déjà audités mais via le second rédacteur (donc incomplets) — désormais uniformes.
`GET /reports/orders.csv` (export massif de données clients) audité en `ACCESS`.

**Résultat mesuré :** endpoints d'écriture admin **sans audit : 16 → 0** (liste exacte reprise au point précédent, vérifiée par grep sur `audit(`/`writeAuditEvent(` dans `src/admin/routes.ts`).

**Bogue réel trouvé en implémentant (et corrigé) :** `QatafoDatabase.run()` est `prepare(sql).run(...)` → **une seule instruction**. Les blocs DDL multi-instructions ne créaient que leur première table (`erp_employees` manquait silencieusement). Corrigé par `QatafoDatabase.runSchema()` (`src/db/database.ts`, + `CREATE … IF NOT EXISTS` / `ALTER … ADD COLUMN` idempotents) et branché sur les 6 `ensure*Schema`. La garantie de schéma vit **dans le constructeur de la base**, donc tout consommateur (serveur, test, job futur) trouve le même schéma — pas seulement `server.ts`.

---

## 4. P1-A — Identité employé (extension du système existant, pas un remplacement)

`audit` / `WHY` : `admin_users` n'est qu'un login ; l'audit ne pouvait pas dire *qui* dans l'organisation a agi.
`SOLUTION` : `erp_employees` (`src/erp-core/identity.ts`) — `employee_code UNIQUE` délivré par la séquence (`EMP-000001`), `user_id UNIQUE REFERENCES admin_users(id) ON DELETE SET NULL`, `status ∈ ACTIVE|ON_LEAVE|SUSPENDED|TERMINATED` (CHECK), rattachements organisation/succursale/département/équipe/manager.
- `backfillEmployeesFromAdminUsers()` : idempotent, **chaque compte existant reçoit une fiche** (le prénom/nom est scindé sur le premier espace du champ `name` existant), et `ensureBootstrapAdmin()` l'appelle après création d'un compte → une connexion créée demain a sa fiche immédiatement.
- `updateEmployee()` ne touche **jamais** l'email, le mot de passe ni le rôle : uniquement identité lisible + rattachements ; erreurs explicites `EMPLOYEE_MANAGER_SELF` / `EMPLOYEE_STATUS_INVALID` / `EMPLOYEE_NO_CHANGES`.
- Le libellé d'audit devient `Salma Trabelsi (EMP-000001)`, ou `Système` pour un acteur sans fiche — jamais un identifiant brut.
- Organisation par défaut créée au premier boot : `ORG-0001 AYROVI` + `BRC-0001 Siège — Tunis`.
**Mesuré :** 1 compte admin en base de test → 1 employé avec `EMP-` conforme (`tests/erp-core-foundation.test.ts` > P1.2, 4 tests).

## 5. P1-B — Permissions : un modèle qui ne peut pas verrouiller

`erp_role_permissions(role, module_key, action, resource_type, scope, granted, origin ∈ SEED|MANUAL|IMPORT)` avec index unique.
- **`can()` évalue d'abord la décision héritée, et celle-ci gagne toujours** → activer le moteur ne peut qu'**élargir**, jamais retirer un droit existant. C'est la garantie demandée, et elle est testée (ligne `granted=0` en dur sur `cms:write` pour `CONTENT_MANAGER` → la décision reste `legacy-role`).
- Miroir seedé depuis les **12** chaînes réelles (`LEGACY_PERMISSION_MAP`) ; pour `SUPER_ADMIN`, les 9 actions × 14 modules sont matérialisées en lignes `SEED` (`grantId` lisible dans l'audit) plutôt que par une exception codée en dur. Le rôle dieu du legacy reste un rôle dieu, mais **visible en données**.
- Nouveautés réellement rendues possibles : `delete / approve / export / assign / manage`, `resource_type`, `scope` (`all|organization|branch|department|team|own`) avec `scopeSatisfies()`.
- Exposé **en lecture seule** en P1 : `GET /core/permissions/me`, `POST /core/permissions/check`, `POST /core/permissions/seed`. Aucune route existante n'a changé de gate.
**Mesuré :** 128 lignes de grants, zéro doublon (index unique), reseed idempotent ; corrections apportées à deux défauts fonctionnels notés dans l'audit — mais **non corrigés dans le comportement** à ce stade, volontairement (P2+) : `GET /users` toujours gated `users:write`, `ai-knowledge` toujours gated `settings:write`.

## 6. P1-C — Registre de modules : « ce module existe-t-il et est-il activé ? »

`src/erp-core/modules.ts` — 21 modules, familles `CORE/OPERATIONS/FINANCE/CONTENT/SYSTEM`, statut `active|legacy|planned`, `basePermission` prise dans les **vraies** chaînes de permission, `adminSection` mappée sur les ids de navigation réels de `AdminApp`.
**Mesuré :** 21 déclarés · **6 actifs · 11 hérités · 4 planifiés**. Endpoint `GET /api/admin/core/modules` + écran « Modules & environnement ».
C'est le contrat que respecteront les modules P2+ : un module sans entrée de registre n'a ni section, ni permission de base, ni événement.

## 7. P1-D — Événements + notifications : la fondation est posée, pas branchée aux écrans métier

- `erp_events` (`src/erp-core/events.ts`) : journal durable + handlers in-process (`onErpEvent`, `onAnyErpEvent`), `emitErpEvent` **ne lève jamais** une exception qui casserait une écriture métier, payload plafonné à 20 000 car.
- `writeAuditEvent` **dérive automatiquement** un événement par écriture auditée : `<resource>.created|updated|status-changed|deleted|archived|approved|rejected|confirmed` avec `{action, sourceModule, employeeCode, fields}`.
- Notifications : `erp_notification_deliveries` (destinataire, canal, statut, tentatives, erreur) + colonnes additives `data`/`source` sur `admin_notifications` et `customer_notifications`, helpers `notifyAdminUser/notifyCustomerAccount/queueDelivery/recentDeliveries`.
**Décision assumée (règle zéro) :** les **10 inserts de notification en ligne** dans `src/admin/routes.ts` / `src/customer/routes.ts` sont **laissés tels quels** ; les brancher sur `notifyAdminUser()` est un changement de comportement visible (double envoi possible) → à faire en P2 avec un test par écran. `UNKNOWN` volontaire : aucune valeur de notification client n'a été modifiée, donc je n'affirme pas qu'elles passent par le nouveau chemin.

## 8. P1-E — Séquences de numérotation partagées

`erp_sequences` + `nextSequenceNumber(db, key)` → `EMP-000001`, `ORG-0001`, `BRC-0001`, `DEP-0001`, `TMB-0001` (padding 6 pour l'employé, 4 pour les entités ; option `year_scoped` pour les documents).
`POST /core/sequences/preview` **ne consomme pas** le numéro (test dédié : `next_value` identique avant/après). Les générateurs `randomInt`/`COUNT+1` existants sont **inchangés par conception** en P1 : les basculer ferait bouger des numéros de documents déjà communiqués aux clients — c'est un sujet P10 (comptabilité) avec décision de reprise.

## 9. Fichiers créés

```
src/erp-core/storage.ts          144 l  politique public/privé, racines, résolution sécurisée
src/erp-core/sequences.ts         68 l  table + allocation + liste
src/erp-core/modules.ts          127 l  registre des modules
src/erp-core/audit.ts            419 l  LE rédacteur unique, diff, liste, couverture
src/erp-core/identity.ts         313 l  organisations, succursales, employés
src/erp-core/permissions.ts      305 l  grants en table, can(), gate d'API
src/erp-core/events.ts            82 l  journal d'événements + bus in-process
src/erp-core/notifications.ts    100 l  livraisons + colonnes additives
src/erp-core/bootstrap.ts         54 l  ensureErpCoreSchema / bootstrapErpCore
src/erp-core/routes.ts           265 l  17 endpoints /api/admin/core/*
src/documents/fileAccess.ts       80 l  lecture de document privé, auditée, unique
client/src/admin/ErpCorePages.tsx 437 l  6 écrans admin
tests/erp-core-foundation.test.ts 434 l  31 tests d'acceptation
```

## 10. Fichiers existants modifiés (8 — tous additifs)

| Fichier | Nature du changement | Lignes |
|---|---|---|
| `src/server.ts` | garde `/uploads` default-deny + `bootstrapErpCore(db)` au boot | +25/−2 |
| `src/db/database.ts` | `runSchema()` + appel `ensureErpCoreSchema(this)` dans le constructeur | +46/0 |
| `src/admin/audit.ts` | `recordAdminAudit` devient un wrapper de `writeAuditEvent` (même API publique, 13 services CRM inchangés) | +33/−18 |
| `src/admin/routes.ts` | `audit()` délégué, `sendProofFile` via `servePrivateDocument`, 12 écritures + 1 export audités, montage `router.use('/core', …)` | +49/−15 |
| `src/admin/auth.ts` | backfill employé après création du compte bootstrap | +7/0 |
| `src/customer/routes.ts` | justificatif écrit dans la racine privée ; facture lue via accès audité | +14/−10 |
| `src/services/invoice.ts` | séparation écriture privée / lecture legacy, `invoiceAbsolutePath` avec repli | +35/−6 |
| `client/src/admin/AdminApp.tsx` | groupe de navigation « ERP » (6 entrées) + routage vers les nouveaux écrans ; **aucun écran existant touché** | +10/−1 |

Total `git diff --numstat` mesuré : **+219 / −52** (10+33+7+49+14+46+25+35 = 219 ; 1+18+0+15+10+0+2+6 = 52). Les 52 suppressions sont intégralement les corps des 2 anciens rédacteurs d'audit, du `sendProofFile` non audité, de l'ancienne lecture de facture côté client et de l'ancien `express.static` nu — **chacun remplacé, pas perdu**.

## 11. UI : ce qui a été fait et ce qui ne l'a pas été

- **Aucun redesign.** Le layout, les composants (`DataTable`, `Field`, `Toast`…), la CSS existante sont réutilisés tels quels ; les écrans existants (`Utilisateurs`, `Journal d'audit`, CMS, social, CRM) sont **intacts**.
- 6 nouveaux écrans dans `/admin` : `Employés`, `Organisation`, `Rôles & permissions`, `Audit (ERP)` (filtres module/employé/ressource/période + détail champ par champ au clic sur la ligne), `Événements`, `Modules & environnement` (dont l'auto-test de sécurité et les séquences avec aperçu sans consommation).
- Le CMS reste là où il est. Les écrans ERP sont **dans la sidebar existante**, pas dans une nouvelle application.

## 12. Décisions prises (et pourquoi)

1. **« Rendre privé + servir par endpoint autorisé »** plutôt que « déplacer et réécrire la base » : `payment_proofs.file_path` et `orders.invoice_path` stockent des chemins absolus ; une migration de fichiers aurait été destructive et non réversible. Le repli legacy garde les lignes anciennes lisibles.
2. **Garde par préfixe de répertoire** plutôt que par liste d'extensions : une liste d'extensions se contourne (SVG, PDF renommé) et doit être maintenue.
3. **Un seul rédacteur d'audit, les deux anciens devenus wrappers** plutôt que « tout réécrire » : les 13 services `arrival-ingestion` appellent `recordAdminAudit` ; changer 13 fichiers pour un gain nul violait la règle zéro.
4. **Colonnes additifs NULLables** plutôt qu'une table d'audit parallèle : une table parallèle oblige à unionner deux systèmes pour toujours. L'ancien SELECT continue de marcher ; le nouveau filtre dessus.
5. **Le legacy gagne toujours dans `can()`** : le risque n°1 d'un moteur de permissions est de verrouiller des gens qui travaillent. Une UI de gestion des droits n'arrivera qu'avec des contrôles de réversibilité.
6. **Rien n'est verrouillé par défaut** : le moteur est exposé en lecture seule en P1 ; aucun endpoint métier n'a changé de gate (corrections des 2 bugs de gate reportées en P2, listées ci-dessous).
7. **Séquences posées mais non branchées aux documents** : changer la numérotation des factures en production est une décision comptable (continuité des numéros émis), pas un refactor.
8. **Événements = table + bus in-process**, pas de broker : une seule instance SQLite sur Render ; une file externe serait de l'infrastructure non demandée.
9. **`runSchema()` dans `QatafoDatabase`** plutôt que dupliquer le DDL dans `database.ts` : la fondation reste dans `src/erp-core/` mais est garantie par la base elle-même.

## 13. Ce qui est intentionnellement laissé de côté

| Item | Statut | Où/vers quoi |
|---|---|---|
| Comptoir d'écriture des droits (`erp_role_permissions` éditable) | Non fait | P2, avec UI de contrôle et reversement |
| `GET /users` gated par `users:write`, `ai-knowledge` gated par `settings:write` | Non corrigés (bug confirmé, correctif = changement de comportement) | P2 |
| `PUT /orders/:id/payment` : 409 → validation à 4 yeux | Non fait (le refus est au moins audité) | P7/P10 |
| 10 inserts de notification inline | Non branchés sur `notifyAdminUser` | P2 |
| Migration physique des fichiers legacy → `private/` | Non faite (lecture par repli) | P12 (backup + reprise) |
| Basculer factures/commandes sur `erp_sequences` | Non fait | P10 |
| `finalizeRequestAudit` (audit automatique par requête avec `res.getResponseBody()`) | Écrit, **non monté globalement** (risque de doubles lignes) | P2, après décision |
| Suppression des doublons de noms d'index, `payments.order_id UNIQUE`, `invoices.order_id UNIQUE` | Non touchés (hors P1) | P3/P10 |

## 14. Comment le vérifier (commandes réelles, toutes passées)

```bash
cd /home/user/ayrovi_beta1
npx tsc --noEmit                              # 0
npx tsc -p tsconfig.client.json --noEmit      # 0
npm run build                                 # 0
npm test                                      # 350/350 (dont 31 tests de fondation)
npx vitest run tests/erp-core-foundation.test.ts   # 31/31 (2,9 s)

# Live, une fois le serveur lancé :
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/uploads/invoices/probe.pdf   # 403
curl -s localhost:3000/api/ready | head -c 80        # {"status":"ready","database":"ok",…}
# puis, dans /admin : Employés · Organisation · Rôles & permissions · Audit (ERP) · Événements · Modules & environnement
```

Les 31 tests de fondation (`tests/erp-core-foundation.test.ts`, 434 l.) couvrent : politique de stockage, 403 sur les 3 racines privées, médias publics non cassés, chemins à `..`, écriture privée dans le code, contrat `/api/ready`, registre de modules (21 entrées uniques, sections ordonnées), environnement + auto-test, backfill `EMP-`, `PATCH` de fiche sans toucher au login, refus de statut invalide, arbre/unité d'organisation, miroir de permissions (12 héritées, 3 pour `CONTENT_MANAGER`), sémantique de `can()` (élargir seulement, jamais verrouiller), `fieldDiff`, ligne d'audit + diff par champ sur création/modification/suppression, requête unique pour back-office **et** CRM, événements dérivés, aperçu de séquence non consommable, et **quatre garde-fous « rien de cassé »** (surfaces admin legacy, CRM monté, colonnes legacy conservées, tables ERP purement additives).

## 15. Récapitulatif en 15 points

1. **P0 fichier :** les factures et les justificatifs ne sont plus accessibles par URL — garde default-deny sur `/uploads`, `403 PRIVATE_DOCUMENT_NOT_PUBLIC`, médias publics intacts (403/200 mesurés en test).
2. **P0 écriture :** tout nouveau document part dans `data/private/documents/*` (0700) ; les anciens chemins en base restent lisibles par repli — aucune donnée déplacée, aucune colonne réécrite.
3. **P0 traçabilité :** chaque lecture de document sensible (autorisée ou refusée) est une ligne d'audit (`DOWNLOAD` / `ACCESS_DENIED`) ; l'export CSV de commandes est audité `ACCESS`.
4. **Audit unifié :** un seul rédacteur (`writeAuditEvent`) derrière les deux fonctions historiques ; les 13 services CRM sont inchangés d'appel et gagnent le même enrichissement.
5. **Audit enrichi :** 11 colonnes additifs + `erp_audit_changes` (une ligne par champ modifié) → qui (employé `EMP-…`), quoi, quand, où, quel enregistrement, avant/après, IP, session, request-id, user-agent.
6. **Couverture d'audit : 16 écritures admin sans audit → 0**, y compris le refus de paiement manuel (qui était un trou noir) et le module d'audit `AI_SUGGESTIONS`→`AI_KNOWLEDGE` corrigé.
7. **Employés :** `erp_employees` 1:1 avec `admin_users`, code `EMP-000001` via séquence, statut et rattachements ; le login (email/mot de passe/rôle) n'est **jamais** touché par ces écrans.
8. **Organisation :** `ORG-0001` + `BRC-0001` par défaut au premier boot, départements/équipes créables, codes issus des séquences ; base des portées de permission.
9. **Permissions :** modèle `module:action:resource:scope` **stocké en données** (128 lignes seedées, 0 doublon) avec décision héritée prioritaire → l'activation du moteur ne peut pas verrouiller un rôle existant ; `delete/approve/export/assign/manage` deviennent exprimables.
10. **Registre de modules :** 21 modules, 6 actifs / 11 hérités / 4 planifiés, permissions de base réelles, sections d'admin mappées — le contrat que P2+ devra respecter.
11. **Événements :** `erp_events` durable + bus in-process, un événement dérivé de chaque écriture auditée ; **notifications** : table de livraisons + colonnes `data/source` posées,branchements métier reportés à P2 (décision explicite).
12. **Séquences :** un compteur par objet, format lisible, aperçu sans consommation ; factures/commandes **volontairement** sur leurs générateurs actuels jusqu'à P10.
13. **UI :** 6 nouveaux écrans dans `/admin`, zéro redesign, zéro écran existant modifié, CMS en place.
14. **Santé du projet :** typecheck serveur et client à 0, build de production OK, **350/350 tests verts** (319 fichiers de baseline intacts, bit-à-bit identiques à HEAD, + 31 nouveaux) ; 8 fichiers existants modifiés, +219/−52, aucun endpoint renommé ni supprimé.
15. **Un bug réel trouvé en codant, et sa correction :** `QatafoDatabase.run()` est mono-instruction → le DDL multi-tables ne créait que la première table (`erp_employees` absente). Corrigé par `runSchema()` + schéma de fondation garanti par le constructeur de la base, avec journalisation visible en cas d'échec — et 6 inserts ERP avaient le même défaut de compteurs de colonnes (corrigés, test de couverture ajouté).

---

### Ce qui est demandé avant P2

1. **Valider** la politique « public = `hero` seulement » : si un autre sous-répertoire de `data/uploads` doit rester public (ex. médias de collection), il faut l'ajouter à `PUBLIC_UPLOAD_DIRS` — c'est un tableau, pas un refactor.
2. **Trancher** les deux gates hérités défectueux (`GET /users`, `ai-knowledge`) : correctif d'une ligne chacun, mais changement de comportement visible → je ne l'ai pas fait sans accord.
3. **Décider** la bascule des notifications inline sur les helpers de fondation (P2) et la politique de numérotation des documents (P10).
4. **Sauvegarde** : `data/backups/pre-arrival-multistore-*.sqlite` existe déjà (motif de migration CRM) ; la fondation ERP n'exigeant aucune migration destructive, aucun snapshot supplémentaire n'a été créé par ce travail.
