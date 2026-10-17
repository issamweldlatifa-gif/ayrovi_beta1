# AYROVI CRM 360 — Matrice de tests

Cartographie verrous ↔ fonctionnalités, mesurée sur la suite au moment de la rédaction : 645 tests verts, 51 fichiers, typecheck serveur + client propres, build ok.

> Statut : livrable **E7** — 2026-09-07. Contenu ancré dans le code du dépôt (branche `main`),
> jamais dans une intention. Toute métrique citée est mesurée dans ce dépôt au moment de la rédaction.


## 1. Couverture fonctionnelle (fichier `tests/crm-foundation.test.ts` — 36 tests)

| Domaine | Ce qui est verrouillé |
|---|---|
| Fondation | schéma idempotent, séquences et préfixes, bootstrap, module `crm360` actif, grants semés |
| Parties | création avec code lisible, refus 409 doublon téléphone et e-mail, liste + vue 360°, édition puis archivage terminal (jamais suppression) |
| Contacts/relations/legacy | doublon téléphone intra-fiche 409, opérateur sans `delete` refusé 403, suppression par admin, raccordement legacy + refus de doublon + vue enrichie |
| Cycle de vie | activité planifiée→complétée, tâche échue visible `due=overdue`, transition illégale 409, note épinglée, issue : résolution sans texte 400, résolution OK, clôture ; timeline fusionnée (note/activité/tâche/issue) |
| Autorisation/audit/notif | CONTENT refusé 403 `ERP_PERMISSION_DENIED`, opérateur ne peut archiver/exporter, audit CREATE+STATUS_CHANGE, événements `crm360_status_events`, notification de tâche assignée à autrui |
| `/crm/meta` (E5) | matrice complète ressource × action booléenne, dictionnaire de statuts, capacités par rôle (SUPER_ADMIN tout, ORDER_MANAGER partiel, CONTENT rien) |
| Recherche étendue (E6) | sources crm360 trouvées par l'admin avec deep link existant ; parité ORDER_MANAGER ; CONTENT voit les sources sautées, jamais interrogées |
| Revue sécurité (E6) | anonyme 401 (listes, meta, dashboard), écriture sans CSRF 403 sur session neuve, validation 400 `CRM_VALIDATION`, pageSize borné, fiche inconnue 404 `CRM_PARTY_NOT_FOUND` |
| API complémentaire (E7-bis) | relations internes (lier/lister/retirer, refus soi-même 400), notes listées avec filtre `pinned`, endpoint doublons, prochaine action `PENDING`, communications (créer/lire, canal inconnu 400 `CRM_VALIDATION`) |
| Couche client (E7-bis) | le SPA répond 200 en HTML pour les six sections `crm-*` |

## 2. Performance — indexation prouvée (`tests/crm-indexation.test.ts` — 10 tests)

`EXPLAIN QUERY PLAN` sur les requêtes chaudes : tâches en retard et par responsable, issues par
statut et par responsable, contacts/activités/notes par fiche, fiches par statut × nature,
raccordements legacy. Chaque plan doit traverser **son** index (pas de `SCAN crm360_*`) ; les
index de `crm360_parties` (statut, propriétaire, suivi, mise à jour) sont listés explicitement.
Un index disparu fait échouer la suite, pas une découverte en production.

## 3. Fichiers de support

| Fichier | Rôle |
|---|---|
| `back-office-foundation.test.ts` (29) | registre, navigation (49 entrées, 7 groupes), deep links (52), icônes, permissions par rôle, recherche globale (auditée, anonyme refusé) |
| `back-office-shell.test.tsx` (31) | rendu de la coquille, roadmap, absence de liste de navigation dans le client |
| `crm-ui-render.test.tsx` (2) | montage des six écrans CRM (fetch simulé) : titre + première ligne affichés, aucune image de substitution ; deep link `?id=party_…` ouvre la vue 360° |

## 4. Méthode

Les compteurs sont **mesurés** sur le dépôt et verrouillés (46→52 sections, 43→49 entrées,
6→7 groupes au fil des phases) — jamais affaiblis, uniquement augmentés quand une fonctionnalité
réelle est ajoutée. Les suites CRM créent leurs données par la voie canonique (API), jamais par
INSERT, et ne laissent rien derrière elles.
