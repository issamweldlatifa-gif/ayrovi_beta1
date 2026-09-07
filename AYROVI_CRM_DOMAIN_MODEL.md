# AYROVI CRM 360 — Modèle de domaine

Les entités, leurs statuts, leurs invariants et leurs règles d'intégrité — tels que la base les applique.

> Statut : livrable **E7** — 2026-09-07. Contenu ancré dans le code du dépôt (branche `main`),
> jamais dans une intention. Toute métrique citée est mesurée dans ce dépôt au moment de la rédaction.


## 1. Entité racine : Party (`crm360_parties`)

Une « fiche relationnelle » porte une identité unique et un historique. Types et catégories,
contrôlés par CHECK en base :

- `party_type` : `INDIVIDUAL` | `COMPANY`
- `kind` : `CUSTOMER` | `PARTNER` | `SUPPLIER` | `PROSPECT` | `OTHER`
- `status` : `ACTIVE` | `INACTIVE` | `ARCHIVED`
- `source` : `MANUAL` | `IMPORT` | `CHECKOUT` | `ARRIVAL` | `LEGACY` | `API`

Code lisible par nature (`party_code`, unique) délivré par séquence ERP. Doublons : l'unicité
« forte » est portée par l'index unique sur `normalized_phone` non vide (et l'e-mail) ; la
création vérifie aussi les candidats proches (téléphone normalisé OU e-mail OU nom à ≥ 3
caractères, hors fiches archivées) et refuse en `409 CRM_DUPLICATE_PARTY` en renvoyant jusqu'à 8
candidats — le POST `/parties/duplicates` permet de les pré-voir avant création.

**Archivage terminal** : une fiche archivée (`ARCHIVED`, `archived_at` renseigné) ne peut plus
être modifiée ni archivée de nouveau ; le service ne connaît aucune route de « désarchivage »
ni de suppression. L'événement d'état et l'audit conservent la trace.

## 2. Contacts (`crm360_contacts`)

Interlocuteurs rattachés à une fiche. Invariants :

- unicité téléphone normalisé **par fiche** (`idx_crm360_contacts_party_phone`) ;
- unicité e-mail **par fiche** (`idx_crm360_contacts_party_email`) — doublon ⇒
  `409 CRM_DUPLICATE_CONTACT` ;
- `is_primary` booléen (un seul contact principal par fiche, géré par le service) ;
- `status` : `ACTIVE` | `INACTIVE`.

## 3. Relations et raccordements legacy

- `crm360_relationships` : liens internes entre fiches (`relationship_type` parmi
  ACCOUNT_MANAGER, CUSTOMER, PARTNER, SUPPLIER, CONTACT, REFERRAL, OTHER) — un doublon est refusé.
- `crm360_party_links` : **raccordement, pas duplication**, vers les entités legacy —
  `customer`, `customer_account`, `supplier`, `order`, `assistant_ticket`, `external`
  (`ref_type` + `ref_id` indexés). Un second raccordement au même ref est refusé.

## 4. Activités (`crm360_activities`)

Ce qui a été fait ou reste à faire : `kind` ∈ CALL, MEETING, EMAIL, MESSAGE, VISIT, FOLLOW_UP,
INTERNAL, OTHER ; `status` ∈ OPEN, COMPLETED, CANCELLED. Une fois COMPLETED, l'activité est
figée (aucun retour en OPEN). Compléter une activité « touche » la fiche (`last_contacted_at`)
et écrit un événement de timeline.

## 5. Tâches et follow-ups (`crm360_tasks`)

`status` ∈ OPEN, IN_PROGRESS, WAITING, COMPLETED, CANCELLED. Machine à états explicite :

```
OPEN          → IN_PROGRESS | WAITING | COMPLETED | CANCELLED
IN_PROGRESS   → OPEN | WAITING | COMPLETED | CANCELLED
WAITING       → OPEN | IN_PROGRESS | COMPLETED | CANCELLED
COMPLETED / CANCELLED  → (terminal)
```

Une transition illégale répond `409 CRM_BAD_STATUS_TRANSITION`. `is_follow_up` marque un suivi qui
reste dans les « prochaines actions » tant qu'il n'est pas terminé. Filtre `due=overdue|today|
upcoming` calculé par la base, jamais deviné (voir dashboard).

## 6. Notes (`crm360_notes`)

Notes libres attachées à une fiche ; `is_pinned` pour l'épinglage (index partiel).

## 7. Issues (`crm360_issues`)

Dossier support/réclamation : `subject`, `category` (GENERAL par défaut),
`priority` ∈ LOW, NORMAL, HIGH, URGENT, `status` ∈ OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED.
Référence `issue_no` (ISU-AAAA-NNNNNN, unique). Transitions :

```
OPEN         → IN_PROGRESS | WAITING | RESOLVED | CLOSED
IN_PROGRESS  → OPEN | WAITING | RESOLVED | CLOSED
WAITING      → OPEN | IN_PROGRESS | RESOLVED | CLOSED
RESOLVED     → OPEN | CLOSED
CLOSED       → (terminal)
```

**Résolution écrite obligatoire** : `RESOLVED` exige un texte de résolution (sinon 400
CRM_VALIDATION) ; la résolution et les horodatages `resolved_at`/`closed_at` sont posés par le
service.

## 8. Communications et journal d'événements

`crm360_communications` : canal (`COMM_CHANNELS` : EMAIL/PHONE/SMS/WHATSAPP/INTERNAL/OTHER) et
sens (`INBOUND`/`OUTBOUND`). `crm360_status_events` : journal d'événements par entité
(`entity_type` ∈ party/contact/activity/task/issue…), alimenté à chaque mutation pour la timeline.

## 9. Vocabulaires partagés

Toutes ces énumérations vivent dans `src/domain/statuses.ts` (`STATUS_VOCABULARIES` :
`crm.party`, `crm.contact`, `crm.activity`, `crm.activity.kind`, `crm.task`, `crm.issue`,
`crm.priority`) avec libellés FR/AR (`STATUS_LABELS`). Les écrans n'inventent aucun état.
