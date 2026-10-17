# AYROVI CRM 360 — Parcours métier

Les flux de bout en bout tels qu'implémentés et verrouillés par les tests.

> Statut : livrable **E7** — 2026-09-07. Contenu ancré dans le code du dépôt (branche `main`),
> jamais dans une intention. Toute métrique citée est mesurée dans ce dépôt au moment de la rédaction.


## 1. Créer une fiche sans créer de doublon

1. POST `/crm/parties` (ou préalablement `/crm/parties/duplicates`).
2. Le service normalise téléphone (`+216…`) et e-mail, puis recherche les candidats proches
   (normalized_phone, e-mail, nom ≥ 3 caractères, hors archivées).
3. Candidat trouvé ⇒ `409 CRM_DUPLICATE_PARTY` avec la liste — on ouvre l'existante plutôt que de
   dupliquer. Sinon création avec `party_code` (CUS/PRT/SUP/PRO/OTH) et audit CREATE.

## 2. La fiche 360° et son cycle

- Vue enrichie : compteurs (contacts actifs, tâches et issues ouvertes), raccordements legacy,
  dernière activité.
- **Archiver** (`ARCHIVED`) est terminal : la fiche devient immuable, l'événement et l'audit
  conservent qui l'a fait et quand. Aucune suppression physique.
- La timeline fusionne notes, activités, tâches, issues, événements d'état dans l'ordre.

## 3. Prochaine action (follow-up)

`is_follow_up` garde une tâche dans les « prochaines actions » tant qu'elle est OPEN/IN_PROGRESS/
WAITING. Le tableau de bord et `next-action` calculent l'échéance (`due_at`) et le retard sur des
données, jamais sur une supposition. Affecter une tâche à **autrui** notifie le propriétaire via
le canal existant (`admin_notifications`, source `crm360`, type `SYSTEM`).

## 4. Activité : planifier puis compléter

POST `/crm/activities` → OPEN. La compléter (COMPLETED) touche la fiche
(`last_contacted_at`), écrit un événement timeline et fige l'activité. Une annulation (CANCELLED)
est possible tant qu'elle est OPEN.

## 5. Dossier (issue) : de l'ouverture à la clôture tracée

1. Ouverture (OPEN, priorité, sujet) avec `issue_no` (ISU-AAAA-NNNNNN).
2. Transition vers IN_PROGRESS/WAITING, puis **RESOLVED exige une résolution écrite** (400 sinon).
3. CLOSED pose `closed_at` et termine le cycle ; RESOLVED peut être rouvert en OPEN.

## 6. Raccorder l'existant legacy

POST `/parties/:id/links` crée un lien vers une commande/fournisseur/client/compte/ticket legacy
— jamais une copie. Les doublons de raccordement sont refusés ; la vue 360° les expose.

## 7. Recherche et audit

La recherche globale lit les sources autorisées et journalise chaque recherche (une ligne
`ACCESS`/`search`). Toute mutation CRM est écrite par le rédacteur unique ; les refus de
permission aussi.

## 8. Tableau de bord

Indicateurs réels : clients actifs, clients nouveaux (30 j), tâches en retard, à faire
aujourd'hui, issues vivantes (OPEN+IN_PROGRESS+WAITING), prochaine action par responsable,
fiches actives 14 j. Une base vide affiche zéro — aucune donnée de démonstration.
