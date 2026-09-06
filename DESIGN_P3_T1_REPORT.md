# AYROVI — P3 / T1 : توحيد الرموز (couche back-office)

**Date :** 2026-09-06 · **Branche :** `main` · **Périmètre décidé :** `/admin` uniquement (décision D‑02 de la session P3) · **Garantie maîtresse :** aucun changement de rendu, pixel pour pixel.

Rapport de phase T1 du plan `PLAN_EVOLUTION_AYROVI_P2_P5.md` §5. Ce que T1 **ne fait pas** : consolider les teintes, renommer les variables héritées, toucher la vitrine, ni installer le mode sombre — tout cela est explicitement reporté en T2/T3 parce que cela changerait le rendu et demande un consentement.

---

## 1) Le contrat de ce pas, et pourquoi il est plus petit que prévu

Le plan écrivait que T1 « aligne le back-office sur Console clair » en faisant passer les couleurs littérales de **392 à 0**. Deux choses étaient fausses dans cette phrase, mesurées depuis :

- le chiffre réel, sur les trois feuilles système du back-office, est **449 occurrences** (et non 392 — l'estimation du plan datait d'un comptage plus large) ;
- « aligner sur Console clair » **implique un changement visuel** (nouveaux contrastes, une famille de noirs unique, un seul orange). Or l'autre exigence du même plan est « la version claire doit être identique bit à bit au rendu actuel ». Les deux ne sont pas satisfaisables ensemble sans arbitrage.

L'arbitrage retenu, et c'est celui qui rend la phase réversible : **T1 = tokenisation 1:1 strictement identique**. Toute valeur est déplacée vers `tokens.css` *sans être ajustée*. La consolidation (l'« alignement Console » à proprement parler) devient T2, avec écart mesuré et accord explicite. Un garde bloque toute dérive dans les deux sens.

## 2) Mesures avant / après (même définition de comptage, script identique)

Un littéral = `#hex` (3/4/6/8, avec garde de frontière) ou `rgb()/rgba()/hsl()/hsla()`, hors commentaires.

| Fichier | HEAD (avant T1) | Après T1 | Nature |
|---|---:|---:|---|
| `client/src/admin/admin.css` | 382 | **0** | feuille système |
| `client/src/admin/back-office/back-office.css` | 46 | **0** | feuille système |
| `client/src/admin/interface-studio.css` | 21 | **0** | feuille système |
| `client/src/design/tokens.css` | 23 | 274 | **seul lieu des valeurs** |
| `client/src/admin/arrival-ingestion.css` | 135 | 135 | gelée depuis P2.0 — plafond enregistré |
| `client/src/index.css` | 114 | 114 | vitrine, hors périmètre |
| `client/src/styles/interface-runtime.css` | 18 | 18 | runtime hors périmètre T1 |
| `client/src/styles/ayrovix-theme.css` | 1 | 1 | hors périmètre |
| `client/src/admin/AdminApp.tsx` (styles en ligne) | 40 | 40 | couche React → T3/T4 |
| **Total (11 CSS + `AdminApp.tsx`)** | **780** | **582** | −198, dont −449 sur les feuilles système |

Le solde n'est pas un échec : ce sont les deux dettes explicitement listées plus bas (feuille gelée, couche publique) et le plan les garde visiblement comptées.

## 3) Ce qui a été écrit

**`client/src/design/tokens.css`** (+269 lignes ajoutées, 0 supprimée) — un bloc `:root` de couche d'application, ajouté **hors** de `@theme inline` pour que les tons ne deviennent pas des utilitaires Tailwind :

- les **9 variables `--admin-*` déplacées mot pour mot** depuis le `:root` d'`admin.css` (mêmes noms, mêmes valeurs) ;
- **11 tokens sémantiques** créés pour les valeurs à rôle évident et fréquentes : `--admin-surface-sunken` `#faf9fc`, `--admin-surface-tint` `#faf8ff`, `--admin-surface-soft` `#fbfbfe`, `--admin-line-soft` `#e5e7eb`, `--admin-line-firm` `#f0eef7`, `--admin-text-soft` `#77727f`, `--admin-on-dark` `#ffffff`, `--admin-danger-strong` `#c9362b`, `--admin-danger-text` `#b42318`, `--admin-danger-ink` `#b6251c`, `--admin-violet` `#673de6` ;
- **231 « tons verbatims » `--admin-tone-<valeur>`** pour la longue traîne, chacun portant exactement la valeur qu'il remplace, et **36 usages** rebasculés sur des tokens préexistants à valeur strictement égale (`#17151f`→`--admin-ink`, `#111318`→`--admin-purple`, `#fe7003`→`--ayrovi-cta`, `#6b7280`→`--ayrovi-neutral-500`, `#fff`→`--admin-card` en fond / `--admin-on-dark` en encre, etc.).

Règle non négociable appliquée partout : **égalité de caractères, jamais similarité**. `#6b7280` n'a pas été mappé sur `--admin-muted` (`#71717f`) « puisque c'est pareil à l'œil » : les deux valeurs restent distinctes et nommées.

**Les trois feuilles système** — 435 remplacements par `scripts/design-token-sweep.cjs`, plus trois réécritures à la main :

- suppression du bloc `:root` d'`admin.css` (déplacé, pas supprimé) ;
- `.mag-agent { --mag-ink/--mag-purple/--mag-deep/--mag-yellow }` redéfinis **en alias de tokens** (`var(--admin-purple)`, `var(--admin-purple-dark)`, `var(--ayrovi-cta)`) ;
- `.bo-shell { --bo-accent: #fe7003 }` → `var(--ayrovi-cta)`.

Et **3 indirections mortes effacées** : `var(--line, #e5e7ef)` (et consorts) — `--line` n'est défini nulle part, le fallback s'appliquait toujours. La valeur est devenue un token explicite ; le calcul reste identique.

Le sweep est rejouable et non destructif : `node scripts/design-token-sweep.cjs --check` n'écrit rien et ne sort que le rapport de comptage ; l'exécution finale valide l'équilibre des accolades de chaque fichier touché avant de rendre la main (c'est ce garde qui a attrapé, en direct, un `:root {` ouvert sans être refermé par ma première version du générateur — build Tailwind en échec, corrigé, revalidé).

## 4) La preuve d'équivalence (pas un avis : une exécution)

`scripts/design-token-equivalence.py` compare HEAD à l'arbre de travail **après résolution des variables**, chacun avec ses propres définitions (tokens.css + feuilles locales du bundle admin, dernier fichier gagnant, comme la cascade) :

- parse des règles avec profondeur d'accolades (`@media`/`@keyframes` suivis), comparaison **`(sélecteur, propriété) → valeur calculée`** ;
- normalisation uniquement sémantiquement neutre : `#fff`≡`#ffffff`, espaces dans `rgb(1 2 3 / 4%)`, alpha `ff` implicite ;
- la seule différence de structure tolérée est le bloc `:root` déplacé, et ses neuf définitions sont contrôlées séparément, mot pour mot ;
- toutes les variables de la cascade admin (avant) sont revérifiées à l'identique après.

Résultat : **3 229 comparaisons, 0 écart.** Le script prend `--rev <commit>` pour rejouer la comparaison contre le commit d'avant le sweep : `python3 scripts/design-token-equivalence.py --rev 98d83c6` → même résultat (depuis `400fa83`, un run sans `--rev` compare l'arbre à lui‑même sur 3 471 comparaisons et reste à 0 écart).

```
propriétés publiques et admin conservées à la même valeur : 3229
aucun écart : chaque déclaration résout exactement la valeur quelle résolvait avant.
```

Dernier contrôle, côté artefact construit : le chunk `AdminApp-*.css` contient **274** usages `var(--admin-tone-*)` pour **275** dans la source, et `index-*.css` **231** définitions. L'écart de 1 est un merge du minifieur (deux règles `.admin-bell-list>button.is-unread` et `:hover` à la valeur identique, lignes 310‑311, fusionnées en une liste de sélecteurs) — pas une perte de valeur.

## 5) Les gardes (`tests/design-tokens.test.ts`, 10 tests)

1. zéro littéral de couleur dans les trois feuilles système ;
2. `tokens.css` seul lieu des valeurs de la couche admin ;
3. les neuf noms hérités vivent toujours, à leur valeur d'origine, et ne sont redéfinis nulle part ailleurs (la feuille gelée en dépend) ;
4. chaque `--admin-tone-X` porte la valeur `#X` inscrite dans son nom — une dérive sémantique est mécaniquement refusée ;
5. un ton n'est jamais déclaré deux fois avec deux valeurs ;
6. ratchet : ≤ **275** références aux tons (nombre d'aujourd'hui, vérifié non vide à >200) ;
7. ratchet : `arrival-ingestion.css` ≤ **135** littéraux, et > 0 — la dette reste visible, pas masquée ;
8. aucun `var(--x)` non résolu dans les feuilles système, hors allowlist fermée (une entrée, documentée) ;
9. équilibre des accolades de chaque feuille touchée ;
10. un seul orange : `--ayrovi-cta` = `#fe7003`, et `.mag-agent`/`.bo-shell` y sont branchés en `var()`.

Deux mutations ont été injectées pour vérifier que le garde mord vraiment : une couleur littérale ajoutée dans `interface-studio.css` → test 1 en échec ; la valeur d'un ton changée de `#047857` à `#047850` → test 4 en échec. Fichiers restaurés ensuite.

## 6) Gates, sur l'arbre de travail complet

| Gate | Commande | Résultat |
|---|---|---|
| Build client + serveur | `npm run build` | ✓ (client en 977 ms) |
| Types serveur | `npx tsc --noEmit` | ✓ 0 erreur |
| Types client (le vrai gate client) | `npx tsc -p tsconfig.client.json --noEmit` | ✓ 0 erreur |
| Suite | `npm test` | ✓ **48 fichiers / 555 tests** (base 545 + 10 nouveaux, aucune régression) |

## 7) Défauts trouvés en mesurant, volontairement **non corrigés** ici

Ils changeraient le rendu : hors du contrat « identique au pixel près ». Ils sont là pour être tranchés en T2.

**F‑1 — un texte d'erreur pointe une variable qui n'existe pas**
- **WHERE** : `client/src/admin/AdminApp.tsx:326` — `<small className="admin-block-small" style={{color:'var(--admin-danger)'}}>Motif : {proof.rejection_reason}</small>`. `--admin-danger` n'est défini dans aucune feuille du bundle (seuls `--admin-danger-text/strong/ink` existent, créés en T1).
- **WHY** : la famille « danger » du back-office n'a jamais été déclarée en variables ; le style en ligne a copié un nom plausible sans jamais le définir.
- **IMPACT** : la raison de refus d'une preuve de transfert hérite de la couleur du parent au lieu du rouge prévu. Léger, mais c'est un écart entre l'intention et le rendu, dans l'écran où un agent explique un refus à un client.
- **DEPENDENCIES** : `AdminApp.tsx`, aucune migration de données.
- **RECOMMENDED SOLUTION** : définir `--admin-danger: #dc2626` dans `tokens.css` (valeur attendue par le lecteur de code) **ou** écrire `var(--admin-danger-text)` ; le premier choix change le rendu visible → à faire accepter en T2, test à ajouter dans `tests/design-tokens.test.ts` pour interdire toute var en ligne non définie.
- **PRIORITY** : P3 (basse, cosmétique, mais le garde la rendrait impossible à reproduire).

**F‑2 — les icônes de la barre latérale ne sont pas masquées**
- **WHERE** : `client/src/admin/back-office/back-office.css:20` (`.bo-nav-icon { -webkit-mask: var(--bo-icon) … }`) et `client/src/admin/back-office/BackOfficeShell.tsx:49` qui rend `bo-nav-icon bo-nav-icon--<nom>`.
- **WHY** : aucune règle `.bo-nav-icon--*` n'existe dans le dépôt, et `--bo-icon` n'est défini ni en CSS ni par un `setProperty` : le masque tombe, seul le `background: currentColor` reste.
- **IMPACT** : chaque entrée de navigation affiche un carré de 19 px à 75 % d'opacité à la place d'un glyphe. Le composant est rendu pour chaque entrée de navigation de la coquille (`NavIcon` dans `BackOfficeShell.tsx`), donc sur tous les écrans admin.
- **DEPENDENCIES** : la `carte ICONS` de `BackOfficeShell.tsx` (allowlist d'icônes déjà testée dans `back-office-foundation.test.ts`) ; un jeu de SVG data‑URI à brancher ; aucun changement de données.
- **RECOMMENDED SOLUTION** : en T2, définir les masques par modificateur depuis le même registre d'icônes (une source, pas une copie par écran), avec capture avant/après dans le rapport de phase.
- **PRIORITY** : P2 (le seul des deux qui dégrade visuellement tous les écrans admin).

## 8) Ce que T2 devra demander avant de faire

1. **Consolider les 231 tons** en une échelle : les familles mesurées sont faites de quasi‑doublons (`#ddd8ec`, `#ddd7ec`, `#dcd4ed`, `#ddd9e5`…) — chaque absorption déplace des pixels, donc diff visuel chiffré + accord.
2. **Renommer `--admin-purple`/`--admin-purple-dark`** (des noirs qui s'appellent « purple ») — bloqué tant que `arrival-ingestion.css` est gelée : elle référence ces noms.
3. **Convertir `arrival-ingestion.css`** (135 littéraux, 333 lignes) aux primitives partagées, puis **fusionner les feuilles** pour le critère « 12 → 3 fichiers » (11 fichiers CSS dans `client/src`, mesuré — le plan disait 12).
4. Corriger F‑1 et F‑2 avec les captures.
5. Et seulement là, T3 (mode sombre Midnight) devient rentable : il consistera à redéfinir les tokens sémantiques, pas à reprendre 449 littéraux.

**UNKNOWN hérités de P2.3, toujours ouverts et sans effet sur ce pas :** `UNKNOWN-002`, `UNKNOWN-006`, `UNKNOWN-013` (transferts — zone de F‑1), `UNKNOWN-014` (stock bloquant au checkout ?), `UNKNOWN-015` (politique de coût : saisi vs CMP vs FIFO, et son propriétaire), `UNKNOWN-016` (les emplacements autorisés à la réception doivent‑ils être contraints par une liste d'entrepôts).

## 9) Ce qui n'a pas été touché

Aucune route, aucun endpoint, aucune table, aucune colonne, aucun permissionnement, aucun composant React de rendu. Aucun fichier supprimé ni renommé. Les 11 feuilles CSS du client sont toutes à leur chemin d'origine. `git diff --numstat` sur ce pas : 4 fichiers modifiés (`tokens.css`, `admin.css`, `back-office.css`, `interface-studio.css`), 2 ajoutés (`scripts/design-token-sweep.cjs`, `scripts/design-token-equivalence.py`), 1 test ajouté (`tests/design-tokens.test.ts`), plus ce rapport et la mise à jour du plan.
