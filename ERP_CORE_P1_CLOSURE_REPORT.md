# Rapport de clôture P1 — ERP Core (closure gate)

Date : 2026-09-05 · Branche `main` · Dépôt `ayrovi_beta1`
Périmètre : **les 7 points de la porte de clôture P1 uniquement**. Aucun module P2
(Catalogue, Stock, Achats, Comptabilité, Ventes, Expéditions, Workflow, IA applicative,
Automatisation) n'a été commencé. Après ce livrable, le travail s'arrête.

Arbre de référence : `2789927` (fin de P0+P1, déjà poussé). Travaux ci-dessous :
`2248256`, `50cc1f8`, `fd8d9e1`, `5b8cabb`, + le présent rapport.

---

## 1. Verdict

**La porte de clôture P1 est passée.** Les deux décisions d'autorisation qui traînaient
depuis l'audit sont corrigées, la politique de fichiers est désormais testée pour
elle-même, l'additivité est vérifiée, et **373 tests passent (350 à la référence + 23
nouveaux, aucun test existant supprimé)**.

Un point de l'énoncé n'a **pas** été fait tel que formulé, volontairement, et est
documenté au §5 (`users:read` refusé à ADMIN) : il conflicte avec une attente figée par
`tests/ayrovi.test.ts`, qui est une exigence de l'atelier (« les tests existants doivent
continuer de passer »).

---

## 2. Les 7 points, un par un

| # | Exigence de la porte | Statut | Preuve (exécutable) |
|---|---|---|---|
| 1 | Un test dédié à la politique de fichiers publics | **Fait** | `tests/public-upload-policy.test.ts`, 9 tests, issus de commit `2248256`. Politique lue depuis `PUBLIC_UPLOAD_DIRS` / `privateDirectory()` et non recopiée en dur. |
| 2 | Corriger le gate de lecture legacy sur la liste des comptes (`users:write` → droit de lecture) | **Fait** | `src/admin/routes.ts` (commit `5b8cabb`) : `GET /users` passe par `requireErpPermission(db, { module:'users', action:'read', resourceType:'admin_user', permissive:false })`. Écritures toujours sous `users:write`. |
| 3 | Corriger le gate legacy de la ressource `ai-knowledge` (`settings:write` → droits IA) | **Fait** | même commit : `permission: 'ai:write'`, nouveau `readPermission: 'ai:read'` dans `ResourceConfig` ; `POST /ai-suggestions/approve` passe de `settings:write` à `ai:write`. |
| 4 | Additif uniquement : pas de renommage, pas de suppression | **Fait, mesuré** | `git diff --name-status --find-renames 2789927..HEAD` → aucune ligne `R` ni `D`. `+309 / −23` sur 7 fichiers. Les −23 sont des lignes remplacées (littéraux d'ensemble de permissions, signatures de routes), pas des capacités retirées. |
| 5 | Tests de non-régression sur les droits de lecture | **Fait** | `tests/admin-read-gates.test.ts`, 14 tests : lecture autorisée/refusée par rôle, `POST/PUT` toujours sous `users:write`, CSRF toujours exigé, `lens-lab` inchangé, et **l'invariance** « le rôle qui pouvait lire avant = celui qui peut lire maintenant ». |
| 6 | Les 4 validations (tsc serveur, tsc client, build, tests) | **Fait** | §4, avec sorties. |
| 7 | Rapport de clôture puis **STOP** | **Fait** | ce fichier. Aucun début de P2. |

---

## 3. Ce qui a réellement changé dans le modèle de permissions

`src/admin/permissions.ts` (additif) — 3 chaînes de plus dans l'`AdminPermission` :

| Droit | SUPER_ADMIN | ADMIN | CONTENT_MANAGER | ORDER_MANAGER | Pourquoi |
|---|---|---|---|---|---|
| `users:read` | ✔ | ✘ | ✘ | ✘ | nomme la lecture de la liste des comptes. **Pas donné à ADMIN** : voir §5. |
| `ai:read` | ✔ | ✔ | ✘ | ✘ | ADMIN lisait déjà `ai-knowledge` **via** `settings:write` : c'est un renommage sémantique, pas un accès neuf. |
| `ai:write` | ✔ | ✔ | ✘ | ✘ | idem (écriture de la base de connaissances et approbation de suggestions). |

L'invariant est testé, pas affirmé : pour chaque rôle,
`hasPermission(role,'ai:read') === hasPermission(role,'settings:write')` et
`hasPermission(role,'ai:write') === hasPermission(role,'settings:write')`, donc
**personne ne gagne et personne ne perd** sur la ressource IA.

`src/erp-core/permissions.ts` (additif) — le moteur sait maintenant nommer ces droits :
`LEGACY_PERMISSION_MAP` gagne `users:read`, `ai:read`, `ai:write` ; `MODULE_RESOURCES`
gagne `ai: ['ai_knowledge','ai_suggestion']` ; la liste du seed est dérivée de
`ALL_ADMIN_PERMISSIONS` (au lieu d'une copie à la main, qui était le seul endroit où
oublier un droit faisait dériver la table).

Comptage réel sur une base fraîche (`:memory:`), mesuré et non supposé :

- `erp_role_permissions` : **139 lignes** (128 à la fin de P1) = SUPER_ADMIN 119,
  ADMIN 13 (+2 : `ai:read`, `ai:write`), CONTENT_MANAGER 3, ORDER_MANAGER 4 ;
- doublons `role/module/action` : **aucun** (`GROUP BY … HAVING n>1` → 0 ligne) — le
  miroir legacy et le bloc « tous droits » de SUPER_ADMIN produisent le même id, donc
  aucun cumul ;
- `erp_employees` : 1 ligne (rétro-alimentation depuis le compte admin toujours OK).

Effet de bord utile : accorder la lecture des comptes à un nouveau rôle ne demande plus
de toucher au code — une ligne dans `erp_role_permissions` suffit. C'est précisément ce
que teste « granting read access is a row of data, not a code change » (insertion d'un
grant `CONTENT_MANAGER / users / read`, `GET /users` passe à 200, `POST /users` reste à
403, suppression du grant → 403 de nouveau).

Le refus est **audité** : `access_denied` avec `module='PERMISSIONS'`,
`resource_type='role_permission'`, `new_value` contenant le module, l'action et la
raison (`no-grant`). Aucun refus silencieux.

---

## 4. Validations (sorties réelles)

```
npx tsc --noEmit                  → exit 0 (srce + tests, tsconfig include tests/**/*)
cd client && npx tsc --noEmit     → exit 0
npm run build                     → exit 0 (vite « ✓ built in 919ms » + esbuild serveur)
npm test                          → Test Files 42 passed (42) · Tests 373 passed (373)
```

Vérifications intermédiaires (obligation « ne jamais pousser un build rouge ») :

- arbre de `fd8d9e1` (après durcissement du mode) : **359/359** dans un worktree neuf ;
- arbre de `5b8cabb` (après correction des gates) : **359/359** dans un worktree neuf,
  dont `tests/ayrovi.test.ts` — l'attente RBAC existante qui dit qu'ADMIN reçoit
  403 sur `GET /users` est restée verte sans être modifiée ;
- référence `2789927` (avant porte de clôture) : **350 tests**, d'où +23 exactement.

Les suites de la porte ont été lancées 5 fois de suite (fichiers en parallèle) :
**54/54 à chaque fois** — la correction du §6 a supprimé le seul aléa trouvé.

Les deux nouveaux fichiers de tests ont été validés par mutation, pas seulement par
passage :

| Mutation temporaire | Tests qui ont dû tomber |
|---|---|
| retirer le prédicat `isPublicUploadPath(…)` du garde `/uploads` | 2 échecs dans `public-upload-policy.test.ts` |
| `permissive:false` retiré sur `GET /users` | 3 échecs dans `admin-read-gates.test.ts` |
| `readPermission: 'ai:read'` → `'settings:write'` | 1 échec (assertion de source + refus par rôle) |

---

## 5. Décisions non prises (volontairement) et pourquoi

| Sujet | Décision | Motif |
|---|---|---|
| `users:read` pour ADMIN | **Refusé** | `tests/ayrovi.test.ts:1232` fige « ADMIN gère les réglages mais ne voit pas les comptes ». Le corriger aurait demandé de modifier une attente existante pour un choix produit qui n'a pas été tranché. Le gate étant devenu nommable, l'accorder est désormais une ligne de données, plus une modification de code. |
| Visibilité de l'entrée « Utilisateurs » côté client | inchangée (`users:write`) | `UsersPage` n'a pas de mode lecture seule ; montrer l'écran à un rôle qui ne peut que lire afficherait des boutons condamnés à 403. |
| `lens-lab/*` (2 routes sous `settings:write`) | **Touché à rien** | hors périmètre de la porte ; le laboratoire d'objectifs est une fonction de réglages, et le test de non-régression le confirme inchangé. |
| Passer `GET /users` en mode permissif (grant ERP seul, sans droit legacy) | **Refusé** | `permissive:false` est ce qui garantit que personne n'obtient la liste par accident. |
| Chaîner `requireErpPermission` sur les routes d'écriture de `/users` | **Refusé** | `requireAdmin` applique le contrôle CSRF sur les méthodes non-GET ; le remplacer l'aurait fait disparaître sur des écritures. Les écritures gardent donc `requireAdmin`, avec les mêmes permissions legacy. |
| Réparer le mode de `data/` lui-même (0755, contient `qatafo_*.sqlite`) | **Non fait** | le faire dépend de l'utilisateur qui sert le site sur Render ; à valider séparément. Recommandé en priorité **haute** si le volume persisté est partagé. |

---

## 6. Le bug trouvé par le nouveau test de politique

`tests/public-upload-policy.test.ts` passait dans l'espace de travail et **échouait dans
un arbre tout neuf** : `data/private/documents` y était en `0755` alors que
`data/private` y était en `0700`. Cause : `fs.mkdirSync(dir, {recursive:true, mode:0o700})`
n'applique `mode` qu'aux répertoires qu'il crée réellement — le premier arrivé fixe le
mode, et un worker de test parallèle (ou un script de déploiement) pouvait créer
l'arborescence avant le code applicatif. Conséquence concrète : la racine qui contient
factures, preuves de virement et documents employés pouvait rester lisible par le groupe
et par les autres sur le disque persisté.

Corrigé dans `src/erp-core/storage.ts` (`ensurePrivateDirectory()` : mkdir puis
réparation idempotente du mode, `chmod` dans un `try/catch` pour ne jamais faire échouer
une requête à cause du système de fichiers), et le writer de fixtures de
`tests/erp-core-foundation.test.ts` utilise le même mode. Preuve de réparation : après
avoir remis `0755` à la main, un seul passage du test laisse
`data/private/documents` et `data/private/documents/invoices` en `drwx------`.

---

## 7. Fichiers de la porte de clôture

| Fichier | Type | ± | Rôle |
|---|---|---|---|
| `tests/public-upload-policy.test.ts` | nouveau | +222 | contrat de politique de fichiers, autonome |
| `tests/admin-read-gates.test.ts` | nouveau | +238 | gates de lecture : autoriser / refuser / auditer / en données |
| `src/admin/permissions.ts` | modifié | +24/−4 | 3 droits nommés, `ALL_ADMIN_PERMISSIONS` comme source unique |
| `src/erp-core/permissions.ts` | modifié | +11/−4 | map legacy, `ai` dans les ressources, seed dérivé |
| `src/admin/routes.ts` | modifié | +19/−5 | `GET /users` via le moteur, `readPermission` générique, `approve` sous `ai:write` |
| `src/erp-core/storage.ts` | modifié | +23/−5 | mode des répertoires privés réparé |
| `client/src/admin/AdminApp.tsx` | modifié | +3/−3 | union de permissions du client, bouton IA, nav IA |
| `tests/erp-core-foundation.test.ts` | modifié | +7/−2 | comptage legacy 12→15, mode des fixtures |

---

## 8. Inconnus (UNKNOWN), assumés plutôt que devinés

1. **État réel de la base de production** : `UNKNOWN`. Cet environnement n'a pas accès
   au volume Render ; les comptages (139 grants, 1 employé) sont mesurés sur une base
   `:memory:` fraîchement seedée. Le chemin de correction sur une base existante est le
   endpoint `POST /api/admin/core/permissions/seed` (idempotent, origines préservées).
2. **Rôle qui devrait réellement pouvoir lire la liste des comptes** : `UNKNOWN` — c'est
   une décision produit. Le code permet maintenant de l'exprimer ; je ne l'ai pas prise.
3. **Utilisateur système servant `/data` sur l'hôte de prod** : `UNKNOWN` (pas de accès
   à la configuration Render depuis ici), d'où la recommandation non exécutée du §5.

---

## 9. Ce qui est prêt pour P2, et arrêt

- une écriture d'audit unique, avec diffs par champ et journalisation des accès fichiers ;
- un registre de modules qui répond à « ce module existe-t-il, est-il activé » ;
- l'identité employé (`EMP-*`) liée 1:1 au compte de connexion, sans jamais la remplacer ;
- **le modèle `module:action:resource:scope` devenu testable et modifiable en données**,
  avec les deux gates legacy enfin cohérents — c'était la dernière pièce manquante ;
- événements, notifications et séquences partagées.

**STOP.** P2 (Catalogue / Stock / Achats / Comptabilité / Ventes / Expéditions / Workflow /
IA applicative / Automatisation) n'est pas commencé et ne le sera pas sans validation de
ce rapport.
