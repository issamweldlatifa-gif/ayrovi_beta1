# Mémo de décisions — les six `UNKNOWN` ouverts, traités jusqu'à la preuve

**Date :** 2026-09-06 · **Méthode :** chaque ligne part d'un fait mesuré dans ce dépôt (fichier:ligne), pas d'une
intention supposée. Rien ici n'est implémenté : ce document rend chaque arbitrage **décidable en une réponse**.
Commandes de contrôle notées sous chaque point pour re-vérifier après toute évolution.

---

## UNKNOWN-002 — « les deux gardes legacy défectueux » → **clore : déjà résolu**

**Preuve (2026-09-06).**
- `src/admin/routes.ts:1892` — commentaire de la clôture P1 : *« la liste des comptes est une LECTURE : elle
  exigeait `users:write` »* ; la route est aujourd'hui
  `router.get('/users', requireErpPermission(db, { module: 'users', action: 'read', resourceType: 'admin_user', permissive: false }), …)` (`:1898`),
  et `POST`/`PUT /users/:id` gardent `users:write` (`:1902`, `:1917`).
- `src/admin/routes.ts:150-156` — base de connaissances de l'assistant : `permission: 'ai:write'`,
  `readPermission: 'ai:read'` (avant P1, lecture et écriture étaient toutes deux `settings:write`).
- Vérification : `grep -n "users:write" src/admin/routes.ts` ne renvoie que `POST`/`PUT` ;
  `grep -rn "settings:write" src/admin/routes.ts | grep "router.get"` est vide.

**Ce qui restait à faire : rien.** Les rapports P2.0, P2.1 et P2.2 traînaient cette ligne comme ouverte —
c'est une erreur de mes rapports, pas du code. Elle est corrigée ici ; les rapports passés ne sont pas réécrits
pour garder la trace de ce qui était vrai au moment où ils ont été écrits.

---

## UNKNOWN-006 — `crm_stores` : marketplace ou fournisseur ? → **décision produit, une phrase suffit**

**Preuve.** L'extraction IA traite les deux comme des libellés distincts et libres :
`src/arrival-ingestion/storeExtractionStrategy.ts:12` demande `orderMeta` contenant *à la fois* `supplier` **et**
`store`, et `:28` exige qu'ils soient « copied verbatim from the document ». Aucune table de rattachement n'existe
entre `crm_stores` et `parties`/`party_roles` (`src/purchasing/suppliers.ts` vit de son côté, `parties` n'est
jamais écrit par ce chemin).

**Options.**
- **A.** `crm_stores` = **point de vente/marketplace** uniquement ; le fournisseur d'achat devient
  `parties + party_roles(supplier)` (c'est ce que P2.3 a construit). Conséquence : l'extraction remplit `store`,
  et un rapprochement *explicite* (bouton, pas une déduction) relie une arrivée à un fournisseur.
- **B.** `crm_stores` = fournisseur aussi → doublon de masters, ce que le plan interdit (un seul master par domaine).

**Recommandation : A.** Elle respecte la règle « un master par domaine » déjà appliquée en P2.1/P2.3, et ne
demande aucune migration : `crm_stores` garde son rôle actuel, `suppliers` garde les achats.
**Propriétaire :** produit (une ligne de décision). **Ce que ça débloque :** P4.1 CRM (qui est « le client », qui
est « le vendeur ») et le three-way match bon ↔ facture fournisseur (`src/purchasing` → Finance).

---

## UNKNOWN-013 — périmètre des transferts → **trois questions, pas un module**

**Preuve.** `src/inventory/types.ts:48` : `'TRANSFER_IN', 'TRANSFER_OUT'` existent comme **motifs** de mouvement,
et rien d'autre — `grep -rn "transfer" src/inventory/*.ts` ne trouve aucun endpoint, aucune table de transfert.
En P2.2, « déplacer » = une sortie + une entrée, écrites séparément, donc une moitié peut réussir et l'autre
échouer. Les preuves de transfert client, elles, vivent dans un autre domaine (le champ `proof.transfer_reference`, affiché dans
`client/src/admin/AdminApp.tsx:326`).

**À trancher (une réponse par ligne) :**
1. Un transfert inter-emplacements est-il **atomique** (une écriture, deux mouvements, dans la même
   transaction `runImmediate`) ? — ma recommandation : **oui**, et c'est le seul moyen de ne pas inventer un
   second journal.
2. Qui approuve : le rôle qui a `inventory:transfer` (à créer), ou un superviseur avec
   `purchasing:approve` ? — recommandation : **grant propre au module Stock**, monté sur le modèle de P2.3,
   parce qu'un transfert ne concerne pas les achats.
3. Un transfert ouvre-t-il un **litige** si l'entrée manque (stock en route) ? — recommandation : **oui**,
   avec un état `IN_TRANSIT` dérivé des mouvements, jamais stocké (même discipline que les totaux P2.3).

**Propriétaire :** produit + exploitation (qui manipule les emplacements). **Ce que ça débloque :** l'opération
« déplacer », et l'option webhook `IN_TRANSIT → AT_WAREHOUSE` du plan (§P3.4).

---

## UNKNOWN-014 — le stock doit-il bloquer le checkout ? → **le code ne tranche pas : il ignore**

**Preuve.** `src/db/database.ts:2503` (`createOrderFromCart`) ne lit aucune table de stock : dans tout
`src/db/database.ts`, `grep -c "inventory_balances\|inventory_movements"` = **0**. La commande est créée depuis le
panier, le stock n'est ni vérifié ni mouvementé. Autrement dit : aujourd'hui, une vente peut dépasser le stock
disponible sans aucun signal.

**Options.** (1) bloquer au checkout (refuser la ligne) ; (2) accepter + réserver (commande = mouvement
`ALLOCATED`, décrémentation à l'expédition) ; (3) accepter + avertir l'opérateur (bandeau, pas de refus).

**Recommandation : (2) puis (3) en douceur** — la réservation est la seule option qui garde le stock **juste**
sans faire perdre de ventes à un petit e-commerce ; mais elle exige que `recordMovement` (seule voie de mouvement,
P2.2/P2.3) reçoive les motifs `ALLOCATE`/`DEALLOCATE` aujourd'hui absents de `src/inventory/types.ts:48`.
**Propriétaire :** produit. **Ce que ça débloque :** brancher ventes → mouvements, donc l'inventaire permanent,
donc le réappro (P2.4 du plan).

---

## UNKNOWN-015 — politique de valorisation du stock → **aucune n'existe, celle du coût saisi est par défaut**

**Preuve.** Le seul coût connu du dépôt est celui **saisi à la réception** :
`src/purchasing/validation.ts:50` `unitCostField(...)`, écrit dans la ligne de bon ; `grep -rin "fifo\|weighted.average\|cout moyen\|cmp"`
dans tout `src/` = **0 résultat**. Les totaux valorisés ne sont donc pas calculés, et c'est cohérent avec la règle
de P2.3 (« les totaux ne sont jamais stockés ») — mais cela veut dire qu'aujourd'hui **la valeur du stock n'existe
nulle part** : le coût est sur la ligne du bon, pas sur l'emplacement.

**Options.** (a) coût saisi à la réception = vérité, jamais recalculé ; (b) CMP (coût moyen pondéré) recalculé à
chaque entrée ; (c) FIFO par lots (exige un suivi par lot → nouvelle table, et donc une décision de périmètre) ;
(d) coût dernier-connu par variante, avec historique.

**Recommandation : (a) + (d) en lecture.** (a) parce qu'aucune réécriture de l'historique n'est acceptable sans
accord comptable ; (d) parce qu'un champ « valeur du stock » se dérive (`dernier coût reçu connu`) sans rien stocker.
Le CMP/FIFO (b/c) demandent un avis **comptable** : en Tunisie comme ailleurs, le choix de méthode impacte la
compta et la TVA ; je ne le tranche pas.
**Propriétaire :** comptabilité/expert-comptable, validé par produit. **Ce que ça débloque :** three-way match,
marge produit, réappro visionné (`BACK_OFFICE_P2_3_REPORT.md` §8).

---

## UNKNOWN-016 — les emplacements autorisés à la réception → **libre aujourd'hui, et c'est un choix**

**Preuve.** `src/purchasing/validation.ts:125` : `receiptLocationField` délègue à `locationLabelField(..., 'MAIN')`
— un **libellé libre**, avec valeur par défaut `'MAIN'`. Aucune liste d'entrepôts n'existe : `grep -rn "warehouses" src/purchasing/*.ts`
est vide, et P2.3 a justement évité de contraindre (`BACK_OFFICE_P2_3_REPORT.md` §5).

**Conséquence mesurée.** Une réception peut inventer un emplacement ; deux orthographes du même dépôt produisent
deux lignes de stock distinctes. C'est acceptable tant qu'il n'y a qu'un dépôt (cas actuel), intenable dès que
l'exploitation en a plusieurs.

**Options.** (1) laisser libre (statu quo) ; (2) liste fermée de `locations` créées au préalable (une table, un
endpoint de lecture, et la réception refuse un inconnu) ; (3) liste fermée + libre « en attendant », avec un champ
`pending_location` visible dans l'audit.
**Recommandation : (2)**, bornée au module Stock, avec la même grammaire d'erreur que P2.3 (`VALIDATION`, jamais un
`500`). Elle ne casse rien : `MAIN` devient l'emplacement unique par défaut, donc les données existantes restent
valides.
**Propriétaire :** exploitation. **Ce que ça débloque :** UNKNOWN-013 (un transfert entre deux membres d'une liste
a un sens ; entre deux libellés libres, non).

---

## Ce que ce mémo ne fait pas

Aucune ligne de production n'a été modifiée par ce document, aucune migration lancée, aucune contrainte ajoutée.
Chaque « recommandation » attend une réponse, et les réponses 013/014/015 engagent des tables et des endpoints :
elles se feront dans leur phase, avec leurs tests, pas dans une annexe.
