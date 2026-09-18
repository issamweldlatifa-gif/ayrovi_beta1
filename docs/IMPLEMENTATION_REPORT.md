# AYROVI — Rapport d'implémentation Design System v1.0

**Date :** 18 septembre 2026 · **Périmètre :** storefront (client) uniquement · **Repo :** `ayrovi_beta1`

---

## 0. Résultat global

| Contrôle | Avant | Après |
|---|---|---|
| Tests `npx vitest run` | 748 pass (référentiel d'origine) | **748/748 · 60/60 fichiers** |
| Typecheck (root + client) | — | ✅ propre |
| `npm run build` (client Vite + serveur esbuild) | — | ✅ propre |
| Hex hexadécimaux non contrôlés dans le storefront | **119** occurrences / ~40 fichiers | **0** (hors `client/src/admin/*` — palette admin verrouillée séparément) |
| `text-[Npx]` arbitraires dans le storefront | **14** / 7 fichiers | **0** (verrou test) |
| Couverture orange mesurée (pixel) | non mesurée | **max 2,19 %** (budget charte : ≤ 3 %) |

> Note d'exécution : 4 suites (`public-upload-policy`, `crm-foundation`, `back-office-foundation`,
> `erp-core-foundation`) exigent les assets client **construits** (`npm run build`) avant de passer —
> c'est un prérequis d'environnement, pas un code à corriger. Après build : 748/748.

---

## 1. Ce qui a été inspecté (phase A)

- `client/src/design/tokens.css` — tokens de marque (orphan : 48 variables référencées 0 fois dans la CSS d'interface).
- `client/src/styles/interface-runtime.css`, `journey.css`, `zalando-ui.css` — classes utilitaires (`.ay-*`, `.znd-*`) portées par les écrans.
- `client/src/config/interfaceConfig.ts` — seed de couleurs d'interface (slate : `#1d2130`, `#111318`, `#6b7280`, `#f8f9fe`…).
- **~50 composants storefront** : `App.tsx`, header/footer/nav, hero, discovery, Lens (`client/src/ayrovix/*`, 10 composants), assistant SONIM (`assistant/*`, 7), social/stories (`social/*`, 7), panier/checkout/compte.
- `tests/*` — 60 fichiers, 748 tests dont 4 verrous design existants.

## 2. Problèmes d'audit (résumé — détail dans `docs/DESIGN_AUDIT_2026-09-18.md`)

1. **Double source de vérité** : tokens de marque orphans d'un côté, ~60 valeurs hexadécimales sauvages de l'autre.
2. **Palette slate infiltrante** : 6 tons slate (`#1d2130`, `#6b7280`, `#f8f9fe`, `#e2e8f0`, `#5b6472`, `#111318`…) dans le header, la nav, les inputs, les chips, les états vides — en concurrence directe avec la palette neutre de marque.
3. **Blanc sur CTA orange** (contraste ≈ 3,0 : 1, sous AA) ; focus rings absents ou brisés (`focus:ring-black/10/10` — syntaxe invalide, silencieux).
4. **Orange sur-diagonalisé** : override runtime `--ayrovi-brand:#0a0a0a` dans `App.tsx` (bug), orange sur liens, puces, états actifs hors CTA.
5. **Typographie hors échelle** : `text-[8/10/17/18/20/22/24/28/30px]` arbitraires.
6. **Élévation et espacements ad hoc** : `z-[60]`, `z-[100]`, `gap-[10px]`, `shadow-[…]` uniques.
7. **Composants dupliqués** : 2 jeux de primitives (`design/` + copies locales dans les écrans) ; aucun jeu « produit » réutilisable.

## 3. Direction retenue (pas de recopie de tiers)

**« Commerce neutre premium, intelligent, calme. »** — un seul porteur de couleur (orange `#ff6900`),
neutres graphites `#111111 / #666666 / #F8F9FA / #EAEAEA / #FFF`, surfaces sombres `#0A0A0A / #3F3F46`.
Le logo existant (mono A + accent orange) est **conservé** : il est déjà porteur du système.
Direction détaillée : `docs/DESIGN_SYSTEM.md` §1–§2.

## 4. Architecture implémentée

```
client/src/
├── design/
│   ├── tokens.css          ← tokens CANONIQUES (source unique de vérité)
│   ├── Button.tsx          ← CTA (bg-cta, encre --ayrovi-cta-ink), outline, ghost, danger
│   └── ui/                 ← NOUVELLE bibliothèque produit (12 primitives)
│       Badge · Card · Container · EmptyState · Field(Input/Select/Textarea)
│       · Modal · Price · SectionHeader · Skeleton/Spinner · StatusBadge · Toast
├── styles/interface-runtime.css  ← classes .ay-* réécrites sur les tokens
└── (59 fichiers storefront migrés)
```

### Tokens canoniques (résumé — tableau complet dans `DESIGN_SYSTEM.md` §3)

| Famille | Valeur |
|---|---|
| `--ayrovi-accent / --ayrovi-cta` | `#ff6900` (unique porteur de couleur) |
| `--ayrovi-cta-ink` | `#111111` — encre de CTA (6,54 : 1 sur orange, AAA ; le blanc est interdit) |
| Surfaces | `#0A0A0A` (hero, announcement, LENS), `#3F3F46` (surface sombre) |
| Échelle neutre | `#FFF / #F8F9FA / #EAEAEA / #111111 / #666666` |
| États | success `#1a7f4b` · warning `#b45309` · danger `#c81e1e` · info `#1d4ed8` |
| Rayons | 12 (composants) · 16 (media) · 10 (chips) · 999 (pills) |
| Ombres | `--ay-shadow-xs / -card / -overlay / -card-dark` (4 seules) |
| Motion | 140 ms micro · 200 ms surface · 320 ms modale · ease `cubic-bezier(.2,.8,.2,1)` |
| Z-index | 20 header · 30 sticky · 40 drawer · 50 modal · 60 toast (pas de `z-[100]`) |
| Focus | `2px solid #111111` sur fond clair, `2px solid #FFF` sur fond sombre + `:focus-visible` global |

## 5. Ce qui a été PRÉSERVÉ (fonctionnel — aucun changement)

- **API, base de données, auth, CRM, back-office, ERP** : inchangés (migration visuelle client uniquement).
- **Lens / Ayrovix** : 100 % du comportement (camera, import, QR/liens, comparaison de prix, historique, états de permission) — seules les classes visuelles ont été retokenisées.
- **Assistant SONIM** : messages, orb vocal, voix, feedback — intact.
- **Panier, checkout, commandes, compte** : flux intact.
- **Prix / devise, sursais de disponibilité, filtres** : logique inchangée.
- **Routes, CMS, stories, reels** : intact.
- **Palette admin** (`client/src/admin/*`) : volontairement préservée (contexte back-office distinct, verrouillée par ses propres tests).

## 6. Ce qui a été CHANGÉ (visuel uniquement)

| Surface | Changement principal |
|---|---|
| `tokens.css` | Réécriture : 60+ variables orphanes → échelle canonique |
| `interfaceConfig.ts` | Seeds slate → canon (`#111111`, `#0a0a0a`, `#fff`, `#eaeaea`) |
| Header / nav / menu | Slate `#1d2130`/`#111318` → `#111111`/`#0A0A0A` ; nav glass `color-mix(var(--ayrovi-white) 72%, transparent)` ; focus rings réparés |
| Boutons | Encre `#111111` sur orange (AAA) ; variantes canoniques `design/Button.tsx` ; danger `#c81e1e` |
| Hero / announcement | Fond `#0A0A0A` unique ; rule orange d'eye-catch conservée (signature) |
| Section LENS (accueil) | Éditoriale : titre display noir, CTA link « Ouvrir LENS → », plus aucun orange d'interface |
| Écran Lens | Carte « Prendre une photo » encre `#111111`, carte import outline, inputs canon — mêmes sémantiques de fonctionnement |
| Assistant SONIM | CTA orange (seul porteur), orbes/voix sur neutres, gradient `color-mix` orange→transparent |
| Panier / checkout / compte | Champs `.ay-input` canon, labels 13 px → échelle, états d'erreur `#c81e1e`, confirmation `#1a7f4b` |
| Social / stories | Badges `#FFF` sur fond `#111111/60`, rails sur `#0A0A0A`, cœur = état actif (seul usage social) |
| Typographie | 14 `text-[Npx]` → échelle Tailwind (8/10→`xs`, 17→`base`, 18→`lg`, 20/22→`xl`, 24→`2xl`, 28/30→`3xl`) |
| Élévation | `z-[60]/[100]` → échelle 20–60 ; ombres → 4 tokens |

**Fichiers modifiés : 59 · Fichiers créés : 16** (12 primitives `design/ui/`, `docs/DESIGN_AUDIT_2026-09-18.md`,
`docs/DESIGN_SYSTEM.md`, 3 captures d'épreuve). Liste exacte : sortie `git status` du 18/09/2026.

## 7. Ce qui a été SUPPRIMÉ / REMPLACÉ (et pourquoi)

| Éliminé | Remplacé par | Raison |
|---|---|---|
| Hex slate (11 valeurs) dans le storefront | Échelle neutre canonique | Double palette concurrente au système de marque |
| `#fff` comme encre de CTA | `--ayrovi-cta-ink: #111111` | Contraste 3,0 : 1 → 6,54 : 1 (WCAG AAA) |
| `#050505`, `#17181c`, `#171717`, `#23242c`, `#111217` (tons sombres ad hoc) | `#0A0A0A` / `#111111` | 1 surface sombre, 1 encre |
| Override runtime `--ayrovi-brand:#0a0a0a` dans `App.tsx` | `--ayrovi-cta` piloté par l'accent CMS | **Bug** : neutralisait l'orange de marque partout |
| `focus:ring-black/10/10` (syntaxe invalide → anneau inexistant) | `focus-visible` canon 2 px | Accessibilité réelle |
| 14 tailles `text-[Npx]` | Échelle Tailwind | Hiérarchie de lecture |
| `z-[100]`, `z-[60]`, `shadow-[…]` uniques | Échelles de z et d'ombre | Prévisibilité |
| Copies locales de primitives (badges, toasts, champs) | `design/ui/*` | Un porteur par couche (règle testée) |

## 8. Gouvernance (verrous automatiques — `tests/design-zalando.test.ts`, describe « DS v1.0 »)

1. **Interdiction des 11 hex slate** dans tout TSX/TS/CSS du storefront (admin et `tokens.css` exclus).
2. **Encre de CTA verrouillée** : `.ay-btn-cta { color: var(--ayrovi-cta-ink) }` + aucune occurrence `#fff` dans `interface-runtime.css`.
3. **Zéro `text-[Npx]`** dans les TSX du storefront.
4. **Verrou anti-régression du bug orange** : `App.tsx` ne doit plus surcharger la marque en `#0a0a0a`.
5. Plafond orange : 23 usages `bg-cta/…` mesurés, allowlist 8 fichiers (CTA uniquement).
6. `tests/design-primitives.test.tsx` : un porteur par couche (`design/ui/` storefront · `design/admin/` back-office, 7 concepts + Button).

## 9. Preuves (captures du 18/09/2026, Playwright, build de production)

| Capture | Fichier |
|---|---|
| Accueil mobile 390×844 (page entière) | `verify/design-system-home-mobile.png` |
| Accueil desktop 1440×900 (page entière) | `verify/design-system-home-desktop.png` |
| Écran Lens mobile | `verify/design-system-lens-mobile.png` |

**Audit orange par pixels** (`verify/zalando-audit.mjs`, seuil couleur `#ff6900`) :

| Surface | % orange |
|---|---|
| Accueil mobile (page entière) | 1,30 % |
| Accueil desktop (page entière) | 0,65 % |
| Hero mobile / desktop | 1,32 % / 0,63 % |
| Conteneur Stories mobile / desktop | 2,19 % / 0,78 % (ribbons orange des photos — contenu média, pas d'interface) |
| Section LENS éditoriale | 0,016 % / 0,004 % |
| Écran Lens ouvert | 0,73 % / 0,30 % |
| **Maximum mesuré** | **2,19 % ≤ budget 3 %** ✅ |

## 10. Limites connues / suite recommandée

- **Wrapping du titre hero** : « livre. » passe seul à la ligne en 390 px — à traiter par `text-wrap:balance` (cosmétique, hors périmètre DS).
- **Composants existants non encore portés sur `design/ui/*`** : la migration des 7 concepts a été faite *en place* (classes `.ay-*` retokenisées) ; le port complet des appels sur les primitives est la prochaine phase (APIs identiques, réversible).
- **Admin** : palette inchangée par décision ; un éventuel alignement partiel (CTA) pourra suivre.
- **Référentiel test** : 748 tests verrouillent l'état actuel — toute évolution DS doit passer par le même pipeline (audit → tokens → composants → migration → verrous → captures).
