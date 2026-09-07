# AYROVI CRM 360 — Closure Report (E7)

> Rapport de clôture du programme CRM — 2026-09-07. Toute affirmation est mesurée dans le dépôt
> (branche `main`), au moment de la rédaction : **651 tests verts sur 52 fichiers**, typecheck
> serveur + client sans erreur, build de production complet, historique poussé sur `origin/main`.

## 1. Déroulé des phases (E0 → E7)

| Étape | Contenu | Preuve | Commit |
|---|---|---|---|
| E0 | Audit de baseline mesuré (101 tables, ordre d'exécution) | `AYROVI_CRM_BASELINE_AUDIT.md` | `4ab8b96` |
| E1/E2 | Module `crm360` : DDL, parties, contacts, relations, raccordements, activités, tâches/follow-ups, notes, issues, timeline, dashboard | suite CRM (parties) + porte verte 626 → 645 | `5fe7a7a` |
| E3 | Permissions crm360 en données + audit unique + notifications (canal existant) | tests autorisation/audit/notif | dans `5fe7a7a` |
| E4 | Dashboard KPI réels + recherche globale étendue (REC-07) | `dashboard.ts` + sources crm360 (finalisées en E6) | `5fe7a7a` / `1eb2ab5` |
| E5 | Écrans back-office CRM (6 sections, groupe « CRM »), `/crm/meta`, enregistrement registre | `CrmPages.tsx`, tests meta, compteurs 43→49 | `ed8e333` |
| E6 | Matrice élargie, EXPLAIN/indexation, revue sécurité (anonyme/CSRF/validation/bornes), recherche étendue | `tests/crm-foundation` 32, `tests/crm-indexation` 10 | `1eb2ab5` |
| E7 | Documentation + closure | six documents + présent rapport | présent commit |
| E7-bis | Durcissement final : deep link `?id=` ouvre la vue 360°, tests API complémentaires (relations/notes/doublons/prochaine action/communications), SPA dessert les six sections, rendu UI des six écrans verrouillé | `CrmPages.tsx`, `tests/crm-*` | dernier commit |

Porte verte rappelée à chaque étape (REC-09) : `tsc` (serveur + client) 0, `npm run build` ok,
`npm test` ≥ baseline **sans aucun test affaibli**, worktree propre, commit + push.

## 2. Suivi des recommandations (baseline §10)

| Rec | Verdict | Où / preuve |
|---|---|---|
| REC-01 nommage module `crm360`, groupe nav « CRM » | ✅ | `erp-core/modules.ts`, `resources.ts` (groupe d'ordre), test 7 groupes |
| REC-02 patron module `src/crm/` + DDL idempotente | ✅ | arborescence, `bootstrap.ts`, tests schéma idempotent |
| REC-03 raccordement sans réécriture | ✅ | `customers`/… intacts ; `crm360_party_links` ; tests legacy |
| REC-04 permissions en données, sans verrou | ✅ | `permissions.ts` (grants), parité testée rôle par rôle |
| REC-05 séquences ERP | ✅ | 7 séquences, préfixes vérifiés par tests |
| REC-06 notifications via canal existant | ✅ | `notify.ts` → `admin_notifications` (source `crm360`, SYSTEM) |
| REC-07 recherche globale étendue | ✅ (E6) | 4 sources crm360 dans `search.ts`, gated `crm360:view`, testées |
| REC-08 vocabulaires partagés FR/AR | ✅ | `src/domain/statuses.ts` (crm.*) + `STATUS_LABELS` |
| REC-09 porte verte à chaque phase | ✅ | voir §1 (typecheck/test/build/commit/push) |
| REC-10 docs miroirs de la commande | ✅ | les six documents + ce rapport |

## 3. Revue sécurité (résumé E6)

- Aucune route CRM accessible aux non-connectés (401 testé : listes, `/meta`, `/dashboard`).
- Écritures sans `x-csrf-token` refusées 403 (session neuve prouvée) ; cookie session
  `HttpOnly; SameSite=Strict` sur `/api/admin`.
- Refus de grant = 403 `ERP_PERMISSION_DENIED` **et** ligne d'audit (jamais de silence).
- `/crm/meta` sous `requireAdmin` ; la recherche n'interroge que les sources autorisées du rôle.
- Lecture seule de la recherche : colonnes en allowlist, paramétrisation, audit une ligne.
- Jamais de suppression physique des fiches (archivage terminal).

## 4. Performances (résumé E6)

Indexation prouvée par `EXPLAIN QUERY PLAN` sur les requêtes chaudes (fichier
`tests/crm-indexation.test.ts`) : aucune requête en balayage complet ; 10 plans vérifiés +
présence des index de `crm360_parties`. La recherche globale borne coût et nombre de résultats.

## 5. État du travail (worktree) et chiffres

- Commit courant : voir `git log` ; travail poussé sur `origin/main`.
- 51 descripteurs de ressources ; navigation 49 entrées / 7 groupes / 52 sections protégées ;
  22 modules ERP dont `crm360` actif ; 12 sources de recherche ; 10 tables, 7 séquences.

## 6. Points d'attention / suite conseillée

1. **`getParty360 placeholders(0)`** : un écart potentiel signalé en cours de route n'a pas été
   reproduit par la suite (la vue 360° renvoie les vraies données). À rouvrir uniquement avec un
   cas reproductible ; aucune action ne le justifie aujourd'hui.
2. **Grants d'exploitation** : `archive`, `delete`, `export`, `manage`, `crm_config` ne sont
   accordés à personne en seed — les octroyer est une décision de données (ligne
   `erp_role_permissions`), à faire par l'exploitant selon l'organisation.
3. **Révoquer le jeton GitHub exposé en cours de conversation** et en générer un nouveau pour les
   prochains travaux (mesure de sécurité, non fonctionnelle).
4. Consolidations déjà fléchées par le code (fusion visuelle des journaux, écran « Clients »
   comme portail vers la fiche 360°) restent hors périmètre CRM.

## 7. Clôture

Le programme CRM 360 est livré : module backend complet, permissions en données, six écrans
back-office branchés sur la navigation dérivée, recherche globale étendue, dashboard réel, tests
matriciels et preuve d'indexation, documentation et ce rapport. Rien n'est marqué fait sans
preuve dans la suite (645 verts).
