# AYROVI CRM 360 — Architecture

Document miroir de la commande (REC-10). La règle du dépôt : le code existant est la source de vérité, rien n'est réécrit, chaque ajout est additif et chaque phase est close par une porte verte.

> Statut : livrable **E7** — 2026-09-07. Contenu ancré dans le code du dépôt (branche `main`),
> jamais dans une intention. Toute métrique citée est mesurée dans ce dépôt au moment de la rédaction.


## 1. Périmètre et positionnement

Le module relationnel « CRM 360 » (module ERP `crm360`, label « CRM 360 », statut `active`) vient
s'ajouter à l'existant sans le réécrire :

- les tables métier historiques (`customers`, `customer_accounts`, `suppliers`,
  `assistant_support_tickets`, arrivages `crm_arrivals`) restent intactes ;
- une fiche relationnelle (`crm360_parties`) peut être **raccordée** à ces enregistrements par
  `crm360_party_links` — pas dupliquée ;
- la navigation back-office dérive du registre serveur (`src/back-office/resources.ts`) : le
  domaine `CRM` existe déjà, un groupe de navigation « CRM » (ordre entre Commerce et ERP) porte
  les six écrans du module ; l'écran « Clients » legacy reste l'une des portes vers le relationnel.

Ordre d'exécution E0→E7 (défini dans `AYROVI_CRM_BASELINE_AUDIT.md`, §10) :

| Étape | Livré dans | Commit |
|---|---|---|
| E0 baseline | `AYROVI_CRM_BASELINE_AUDIT.md` | `4ab8b96` |
| E1/E2 backend complet (parties, contacts, relations, activités, tâches/follow-ups, notes, issues, timeline, dashboard) | — | `5fe7a7a` |
| E5 écrans back-office + `/crm/meta` | `client/src/admin/CrmPages.tsx` | `ed8e333` |
| E6 tests matrice / recherche étendue / indexation prouvée / revue sécurité | `tests/crm-*` + `search.ts` | `1eb2ab5` |
| E7 documentation + closure | six documents + closure report | présent commit |

## 2. Organisation du code

```
src/crm/
  types.ts         constantes (ressources, actions, statuts, limites, codes d'erreur)
  validation.ts    nettoyage/validation partagée (cleanText, cleanMultiline, parsePositiveInt, parsePageSize…)
  bootstrap.ts     DDL idempotente (CREATE TABLE/INDEX IF NOT EXISTS), séquences ERP, amorçage grants
  permissions.ts   grants crm360 en données + garde requireCrm + décision canCrm
  parties.ts       fiche relationnelle : création/édition/liste/doublons/archive/contacts/liens/relations
  contacts.ts      (via parties.ts) contacts
  activities.ts    activités planifiées et leur cycle
  tasks.ts         tâches & follow-ups, transitions, « prochaine action »
  notes.ts         notes épinglées
  issues.ts        dossiers support/réclamations, transitions avec résolution écrite
  timeline.ts      fusion d'événements pour le profil 360°
  dashboard.ts     indicateurs réels (KPI)
  notify.ts        notifications via le canal existant
  audit.ts         rédacteur unique du journal (writeAuditEvent)
  routes.ts        routeur monté sous /api/admin/crm
```

Client back-office : `client/src/admin/CrmPages.tsx` (six écrans exportés, branchés dans
`AdminApp.tsx` par `section`), primitives réutilisées depuis `client/src/design/admin`.

## 3. Tables et séquences

10 tables physiques (préfixe `crm360_`) : parties, contacts, relationships, activities, tasks,
notes, issues, communications, party_links, status_events. 7 séquences ERP (`erp_sequences`) :
`party_customer_code`/`party_partner_code`/`party_supplier_code`/`party_prospect_code`/
`party_other_code` (préfixes CUS/PRT/SUP/PRO/OTH, 6 chiffres) et `crm_issue_no` (ISU) /
`crm_task_no` (TSK) — les deux dernières scopées à l'année.

## 4. Chaîne d'autorisation d'une route CRM

```
session admin valide (requireAdmin) → CSRF exigé sur toute écriture
→ grant ERP : requireErpPermission({ module:'crm360', action, resourceType, permissive:false })
   (un refus = 403 ET une ligne dans le journal unique)
```

`requireCrm(action, resource)` = ce double verrou. Rien n'est accessible aux non-connectés ; les
écritures exigent `x-csrf-token`.

## 5. Recherche globale

`src/back-office/search.ts` expose 12 sources (lecture seule, colonnes en allowlist, coût borné,
jamais de seconde autorisation : une source n'est interrogée que si le rôle peut la lire).
E6/REC-07 a ajouté 4 sources `crm360.party`, `crm360.contact`, `crm360.task`, `crm360.issue`
(gated par le moteur ERP sur `crm360:view`), avec deep link vers un écran existant. Une recherche
est auditée (une ligne `ACCESS`/`search`).

## 6. Mesures (au moment de la rédaction)

- 51 descripteurs de ressources (CONTENT 17, ERP 13, COMMERCE 12, CRM 9) ;
- navigation SUPER_ADMIN : 49 entrées visibles dans 7 groupes, 52 sections/alias protégés ;
- 22 modules ERP enregistrés dont `crm360` (active) ;
- 645 tests verts sur 51 fichiers, typecheck serveur + client propre, build complet.
