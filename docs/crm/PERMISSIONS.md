# AYROVI CRM 360 — Permissions

Les droits comme données, sur le moteur ERP, sans jamais verrouiller un rôle legacy.

> Statut : livrable **E7** — 2026-09-07. Contenu ancré dans le code du dépôt (branche `main`),
> jamais dans une intention. Toute métrique citée est mesurée dans ce dépôt au moment de la rédaction.


## 1. Principe

- Un seul module ERP : `crm360`. Une permission = une ligne
  `erp_role_permissions (role, module_key='crm360', action, resource_type, scope, granted)`.
- Ressources : `party, contact, activity, task, note, issue, communication, timeline, dashboard,
  crm_config` (10).
- Actions : `view, create, edit, archive, delete, export, manage` (7).
- Rien n'est codé en dur dans les routes : la garde lit la base (`requireErpPermission`,
  `permissive:false`). Accorder une action à un rôle devient une décision de **données**.

## 2. Semis initial (`CRM_SEED_GRANTS`, `src/crm/permissions.ts`)

- **SUPER_ADMIN et ADMIN** : toutes les actions × toutes les ressources (le moteur traite de
  toute façon SUPER_ADMIN comme tout-puissant).
- **ORDER_MANAGER** : `view` sur toutes les ressources + `create`/`edit` sur le relationnel
  (party, contact, activity, task, note, issue, communication). Jamais `archive`, `delete`,
  `export`, `manage`, ni de main sur `crm_config`.
- **CONTENT_MANAGER** : aucun grant crm360 (aucun accès legacy aux clients/support) — refus 403
  propre, sources de recherche sautées, capacités toutes `false` dans `/crm/meta`.

Parité stricte : aucun rôle existant ne perd d'accès ; aucun n'en gagne par la seule navigation.

## 3. Gardes des routes

`requireCrm(action, resource)` = session admin + CSRF (écritures) + grant ERP. Un refus produit
un 403 `ERP_PERMISSION_DENIED` **et** une ligne dans le journal d'audit (refus tracés).

`/crm/meta` (capabilities) est sous `requireAdmin` : la matrice réelle du rôle y est exposée
pour rendre les boutons inertes avant tout clic — aucune règle client ne prétend connaître les
droits.

## 4. Navigation et recherche

- La navigation des six écrans reste `commerce:read` (parité avec les écrans legacy auxquels
  ADMIN et ORDER_MANAGER accédaient déjà) ; les écritures, elles, passent les grants `crm360:*`.
- La recherche globale interroge les sources crm360 seulement si le moteur accorde `crm360:view`
  (module-level via `resourceType:null`) — pour ORDER_MANAGER c'est le cas ; pour CONTENT_MANAGER
  les sources sont sautées sans être interrogées.

## 5. Identité de l'acteur

L'acteur d'un événement/audit est l'**employé** résolu (`erp_employees`), jamais l'uuid de
session ; sans employé, l'acteur reste nommé mais sans FK contrefaite. L'audit passe par le
rédacteur unique (`writeAuditEvent`) — module `CRM`, actions CREATE / UPDATE / STATUS_CHANGE /
ARCHIVE / DELETE / ACCESS, diff champ à champ.
