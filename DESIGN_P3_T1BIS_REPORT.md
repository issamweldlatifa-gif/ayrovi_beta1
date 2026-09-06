# AYROVI — P3 / T1-bis : noms sémantiques, feuille d'application unique, absorption de palette

**Date :** 2026-09-06 · **Branche :** `main` · **Suite de :** `DESIGN_P3_T1_REPORT.md` (tokenisation 1:1)
**Commis de la phase :** `e7906c3` (a) → `3cf36a2` (b) → `10b0cff` (c) → `3b813a7` (d) → le présent commit (e).

**Note de numérotation, à lire avant tout le reste.** J'ai d'abord intitulé ce travail « P3/T2 », puis j'ai
écrit par-dessus la ligne T2 du plan. C'était une erreur de rattachement : dans `PLAN_EVOLUTION_AYROVI_P2_P5.md`
§5, **T2 est le pas des composants primitifs** (~18 éléments que le moteur réexporte) — il n'est **pas entamé**.
Le travail décrit ici prolonge **T1** (lequel prévoyait déjà « une famille de noirs », « un seul orange » et des
noms sémantiques) : il est donc renommé **T1-bis**, la ligne T2 du plan a été restaurée mot pour mot, et le
rapport garde ce titre. Les identifiants de commit ci-dessus ne changent pas.

Ce que T1 refusait de faire — changer une couleur — est fait ici, avec accord explicite, et **uniquement** là
où la mesure le justifie. Tout le reste (aliasing, conversion, fusion) est prouvé sans changement de rendu.

---

## 1) Les cinq sous-pas, dans l'ordre où ils ont été commités

| # | Contenu | Rendu | Preuve |
|---|---|---|---|
| **a** | correction des deux défauts mesurés en T1 : `--admin-danger` enfin définie (alias de `--ayrovi-danger`), et `NavIcon` qui rend un glyphe au lieu d'un carré CSS muet | **1 changement consenti** (le motif de refus passe en rouge) | 3 tests de contrat + garde élargi aux styles en ligne |
| **b** | 8 variables héritées mal nommées (`--admin-purple` = un noir, `--admin-yellow` = un pêche) → noms canoniques ; anciens noms conservés en alias | inchangé | 3472 comparaisons, 0 écart |
| **c** | `arrival-ingestion.css` (135 littéraux, gelée depuis P2.0) convertie aux tokens ; 10 indirections mortes effacées ; `--admin-text` (jamais défini) aliasé sur l'encre | inchangé, **sauf** 1 écart consenti (`.arrival-store-empty strong` qui héritait d'une couleur) | 4403 comparaisons, 1 écart consenti |
| **d** | les 4 feuilles de règles fondues dans `admin.css` (11 → 8 fichiers CSS ; la couche admin = `tokens.css` + `admin.css`) | inchangé | isomorphisme 4005 → 4005 déclarations, 0 perdue, 0 ajoutée |
| **e** | absorption de la longue traîne : 59 teintes quasi-dupliquées rapprochées de leur voisine (Δ ≤ 2/255) | **72 déclarations** changent de valeur, auditées une par une | table complète dans `explorations/P3_T1BIS_PALETTE_SNAP.md` |

## 2) Pas a — les deux défauts, et la correction d'une de mes affirmations

**F‑1 (`--admin-danger`)** : `AdminApp.tsx:326` peignait le motif de refus d'une preuve `color: var(--admin-danger)`, variable déclarée nulle part → la couleur héritait. Correction : `--admin-danger: var(--ayrovi-danger);` dans `tokens.css` (alias, aucune valeur nouvelle). Le rouge voulu apparaît. Le garde couvre désormais **les styles en ligne de tout `client/src/admin/**`** (allowlist réduite à la règle `--bo-icon`), et une mutation (retirer l'alias) fait échouer le test en nommant le fichier fautif.

**F‑2 (`--bo-icon`)** — *mon rapport T1 sur-estimait l'impact, je le corrige* : la mesure montre que les 43 entrées de navigation déclarent 27 noms d'icône et que **tous** figurent dans la carte `ICONS` ; aucune icône n'était donc cassée à l'écran. Le défaut était **latent** : un nom non couvert aurait produit un carré de 19 px (masque `-webkit-mask: var(--bo-icon)` sur une variable jamais définie, classes `.bo-nav-icon--*` absentes du dépôt). Corrigé par `ICONS[name] ?? Grid` et verrouillé par trois tests de contrat (registre → carte → sprite) : la classe CSS reste en place (rien n'est supprimé) mais n'est plus atteignable.

## 3) Pas b et c — noms canoniques, et la feuille ex-gelée

`tokens.css` déclare maintenant les rôles sous des noms vrais — `--admin-ink-strong` `#111318`, `--admin-ink-black` `#050505`, `--admin-warm-accent` `#ffb070`, `--admin-ink-muted` `#71717f`, `--admin-surface-page` `#f6f6f9`, `--admin-surface-card` `#fff`, `--admin-rail` — et les sept noms hérités subsistent comme `var(--canonique)` (la cascade reste ouverte pour tout consommateur que la phase ne réécrit pas). 196 références réécrites.

`arrival-ingestion.css` : 135 littéraux traités par `scripts/design-token-extend.cjs` (rejouable sur un dépôt déjà balayé) → 48 sur un token admin/public existant, 30 sur un ton déjà créé, 47 tons nouveaux. Les 10 `var(--border, …)`, `var(--muted, …)`, `var(--surface…)` étaient des indirections mortes : la variable n'existait pas, le fallback gagnait toujours ; elles sont remplacées par le token du fallback, pixel pour pixel.

## 4) Pas d — une seule feuille d'application, et pourquoi c'était sûr

La fusion n'est légitime que si l'ordre de cascade ne bouge pas. Mesure préalable : **0 couple (sélecteur, propriété) partagé** entre les quatre feuilles (et 0 sélecteur commun) — donc aucun gagnant de cascade à déplacer. Le script assemble dans l'ordre réellement chargé dans le chunk construit (admin → arrival-ingestion → interface-studio → back-office), écrit une bannière de provenance par section, et refuse d'écrire si le multi-ensemble des déclarations n'est pas identique : **4005 avant = 4005 après**. Les trois fichiers absorbés sont supprimés du disque et de leurs imports ; leur contenu intégral est dans `admin.css` (1253 lignes, **0 littéral**) et l'historique git conserve les feuilles d'origine.

## 5) Pas e — l'absorption de palette, chiffrée

Curseur unique : `--max-delta` (écart maximal **par canal RVB**, sur 255). Choix retenu : **2**. Au-delà, le script refuse de tourner — ce serait du re-design, pas du nettoyage.

- teintes absorbées : **59** (32 à Δ=1, 27 à Δ=2) ; somme des trois canaux : min 1, **max 6**, médiane 3 — soit ≤ 2,4 % par canal, invisible sur les aplats de l'admin ;
- déclarations dont la valeur change : **72**, chacune présente dans la table d'absorption ;
- tons restants : 219 (164 hexadécimaux + 55 `rgba()/hsla()` d'ombres et de voiles, non consolidés — leurs valeurs portent de l'alpha et sont presque toutes uniques) ;
- doublons de valeur dans la couche admin : **2 → 0** (`--admin-rail` et `--admin-on-dark` aliasent désormais `--admin-ink` et `--admin-surface-card` : le rôle garde son nom, la valeur n'a plus qu'un porteur) ;
- plafond du ratchet : refs de tons **362 → 334**, écrit dans le garde. Le relever est un acte explicite.

Exemples de la table (la liste complète est dans `explorations/P3_T1BIS_PALETTE_SNAP.md`) : `#777280` → `--admin-text-soft` (`#77727f`, Δ1) ; `#111217` → `--admin-ink-strong` (`#111318`, Δ1) ; `#faf9fb` → `--admin-surface-sunken` (Δ1) ; `#82778d`/`#82788d` → `#81778b` (Δ2).

**Ce qui est refusé et pourquoi** : le reste de la traîne a un plus proche voisin à Δ ≥ 3 (mesuré sur les 223 tons avant passe : 39 à Δ=2, 22 à Δ=3, 18 à Δ=4, 18 à Δ=5…). Absorber ces paliers nécessiterait de choisir une échelle de gris arbitraire (6 paliers ? 10 ?) et de réaffecter ~164 teintes par rôle — une décision de design. Elle est à prendre **avec** le mode sombre (T3), pas à la place : T3 redéfinira les tokens de rôle, et c'est là que l'échelle se justifie.

## 6) Audit des écarts de rendu

`scripts/design-token-equivalence.py` compare le commit demandé (`--rev 3b813a7`, ou `98d83c6` pour T1) à l'arbre de travail, en résolvant les `var()` avec les définitions de chaque état, et ne tolère qu'un écart **déjà écrit quelque part** : une paire (avant, après) dans la table d'absorption, ou une entrée de l'allowlist `CONSENTED` (les deux corrections de défauts). Résultat :

```
propriétés publiques et admin conservées à la même valeur : 8387
écarts consentis (défauts corrigés sur accord) : 72
aucun écart non consenti : chaque déclaration résout exactement la valeur quelle résolvait avant.
```

Toute autre dérive — un renommage qui change une valeur, une fusion qui perd une règle, un ton absorbé vers la mauvaise cible — fait échouer la preuve.

## 7) Gates

| Gate | Commande | Résultat |
|---|---|---|
| Build client + serveur | `npm run build` | ✓ 756 ms |
| Types serveur | `npx tsc --noEmit` | ✓ 0 |
| Types client (vrai gate client) | `npx tsc -p tsconfig.client.json --noEmit` | ✓ 0 |
| Suite | `npm test` | ✓ **48 fichiers / 562 tests** (545 avant P3, 555 après T1 ; +14 gardes de tokens, +3 contrats d'icônes) |

## 8) Où en est le critère du plan

- **couleurs littérales hors `tokens.css`** : 449 → **0** (T1) ; `arrival-ingestion.css` 135 → **0** (pas c) ; reste la couche **publique** hors périmètre D‑02 : `index.css` 114, `interface-runtime.css` 18, `ayrovix-theme.css` 1, et les 40 styles en ligne de `AdminApp.tsx` (la T3/T4 du plan, pas oubliées : listées).
- **12 → 3 feuilles CSS du système** : mesuré 11 avant P3 → **8** aujourd'hui ; la couche admin est à **2** fichiers (`tokens.css` + `admin.css`) ; les 6 restants appartiennent à la vitrine.
- **un seul orange** : `--ayrovi-cta` `#fe7003`, consommé en `var()` par le rail, la coquille et la fiche agent ✓ ; le garde l'interdit d'ailleurs.
- **famille de noirs unique** : `--admin-ink` / `--admin-ink-strong` / `--admin-ink-black` (3 porteurs, valeurs distinctes assumées) ; les 5 « noirs » du plan d'origine sont réduits à 3 + 1 alias de valeur dupliquée supprimée.

## 9) Restant (et ce qui n'est pas fini, à dire)

1. **T2 du plan — composants primitifs** (~18 : Button, Field, Select, Modal, cellule de table, Tabs, Toast,
   Empty state, Badge, Skeleton, Tooltip, Switch, Avatar…), le moteur réexportant depuis cette couche plutôt que de
   copier. C'est le prochain pas, et il n'est pas entamé : rien ici ne l'a préparé ni annoncé.
2. **T3 — mode sombre Midnight** : désormais rentable (redéfinir les tokens de rôle dans un sélecteur `[data-theme=dark]`, plus 449 littéraux à reprendre). Le socle est prêt ; il reste à décider la palette sombre, point que le plan note comme « 2 → 18 éléments primitifs » pour T4.
3. **Échelle de gris complète** : refusée ici faute de décision de design argumentée (§5). À traiter avec T3.
4. **Travail fonctionnel en attente, inchangé depuis P2.3** : `UNKNOWN-002`, `UNKNOWN-006`, `UNKNOWN-013` (transferts de preuves), `UNKNOWN-014` (stock bloquant au checkout ?), `UNKNOWN-015` (politique de coût : saisi vs CMP vs FIFO, et son propriétaire), `UNKNOWN-016` (emplacements autorisés à la réception contraints par une liste d'entrepôts ?). Rien n'a été tranché à la place du produit.
5. Les 164 tons hexadécimaux restants et les 55 tons alpha : leur sort se décide avec l'échelle (point 2), pas avant.
