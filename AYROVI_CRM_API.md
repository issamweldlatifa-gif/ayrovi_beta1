# AYROVI CRM 360 — API

Inventaire des routes du module (montées sous `/api/admin/crm`), de leurs gardes et de leurs codes d'erreur.

> Statut : livrable **E7** — 2026-09-07. Contenu ancré dans le code du dépôt (branche `main`),
> jamais dans une intention. Toute métrique citée est mesurée dans ce dépôt au moment de la rédaction.


## 1. Contrat général

Enveloppe de réponse : `{ success, data, pagination? }` ; `pagination = { page, pageSize, total,
totalPages }`. Erreurs : statut HTTP + `{ success:false, code, error }` — jamais de 500 pour une
cause métier. Toutes les routes sauf `/health` exigent une session admin ; toute écriture exige
`x-csrf-token`. Garde par route : `requireCrm(action, resource)` → refus sans grant =
`403 ERP_PERMISSION_DENIED`.

Codes métier (constante `CRM_ERRORS`, `src/crm/types.ts`) : `CRM_VALIDATION` (400),
`CRM_*_NOT_FOUND` (404), `CRM_DUPLICATE_PARTY` / `CRM_DUPLICATE_CONTACT` (409),
`CRM_BAD_STATUS_TRANSITION` (409), `CRM_INVALID_REFERENCE`, `CRM_IMMUTABLE`, `CRM_PERMISSION_DENIED`.

## 2. Routes

### Fiches (Party) — action `party`
| Méthode | Route | Action | Notes |
|---|---|---|---|
| GET | `/parties` | view | filtres `search`, `kind`, `status`, `owner`, `page`, `pageSize` (borné) |
| GET | `/parties/:id` | view | vue 360° enrichie (compteurs, liens legacy, prochaine action) |
| POST | `/parties` | create | refus de doublon 409 avec candidats ; exige nom + type + nature |
| PUT | `/parties/:id` | edit | refusé sur fiche archivée (immutable) |
| POST | `/parties/:id/archive` | archive | archivage terminal, tracé |
| GET | `/parties/:id/next-action` | view | prochaine action calculée |
| GET | `/parties/:id/timeline` | view(timeline) | événements fusionnés |
| GET | `/parties/:id/relationships` | view | relations internes |
| POST | `/parties/:id/relationships` | edit | lien interne (doublon refusé) |
| DELETE | `/relationships/:id` | edit | retrait d'un lien interne |
| POST | `/parties/:id/links` | edit | raccordement legacy (doublon refusé) |
| DELETE | `/links/:id` | edit | retrait d'un raccordement |
| POST | `/parties/duplicates` | view | candidats doublons avant création (param `name` requis) |

### Contacts — action `contact`
| Méthode | Route | Action |
|---|---|---|
| GET | `/contacts` | view (filtres `partyId`, `search`) |
| POST | `/contacts` | create (unicité téléphone/e-mail par fiche) |
| PUT | `/contacts/:id` | edit |
| DELETE | `/contacts/:id` | delete |

### Activités — action `activity`
GET/POST `/activities`, PUT `/activities/:id`, POST `/activities/:id/status` (edit) —
`{ status: OPEN|COMPLETED|CANCELLED }`. Filtres : `partyId`, `ownerId`, `kind`, `status`, `search`.

### Tâches — action `task`
GET/POST `/tasks`, PUT `/tasks/:id`, POST `/tasks/:id/status` (edit) — transitions de la machine
à états. Filtres : `partyId`, `ownerId`, `status`, `isFollowUp`, `due` (`overdue|today|upcoming`),
`search`.

### Notes — action `note`
GET/POST `/notes`, PUT `/notes/:id`, DELETE `/notes/:id`. Filtres : `partyId`, `pinned`.

### Issues — action `issue`
GET `/issues`, POST `/issues`, PUT `/issues/:id`, POST `/issues/:id/status` (edit) —
`{ status, resolution? }` ; `RESOLVED` exige `resolution`. Filtres : `partyId`, `ownerId`,
`status`, `priority`, `search`. GET `/issues/:id` (view).

### Communications — action `communication`
GET/POST `/communications` — canal, sens, contenu.

### Métadonnées et tableau de bord
| Méthode | Route | Garde | Rôle |
|---|---|---|---|
| GET | `/health` | — | état schéma/séquences/grants (diagnostic) |
| GET | `/meta` | `requireAdmin` | `capabilities` (ressource × action, booléens décidés par `canCrm`) + dictionnaire de statuts — ce que les écrans utilisent pour griser un bouton avant tout clic |
| GET | `/dashboard` | view(dashboard) | KPI réels (parties actives, tâches en retard/du jour, issues vivantes, prochaine action par responsable…) |

### Recherche globale
`GET /api/admin/back-office/search?q=…` (module générique, audité, réservé aux admins connectés)
interroge les sources autorisées du rôle — désormais y compris `crm360.party/contact/task/issue`.

## 3. Exemples de charge utile

Création de fiche : `{ partyType:'COMPANY', kind:'CUSTOMER', name, email?, phone?, governorate? }`.
Création de tâche : `{ partyId?, title, dueAt?, priority?, ownerEmployeeId?, isFollowUp? }`.
Transition d'issue : `{ status:'RESOLVED', resolution:'…' }`.

## 4. Contrat d'icônes / navigation

Le registre serveur déclare pour chaque écran `nav { group:'CRM', order, icon }` ; le client ne
rend que les icônes du sprite partagé (contrat verrouillé par test : 49 entrées).
