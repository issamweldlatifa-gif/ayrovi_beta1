# AYROVI — UI/UX AUDIT REPORT (Design System v1.0 — Phase 1)

**Date:** 2026-09-18 · **Scope:** storefront publique (site, Lens, panier, checkout, compte, assistant, stories) + coquille Admin (en lecture seule).
**Méthode:** inspection du code réel (29 862 lignes client), mesures par balayage (hex, classes, z-index, tailles), analyse de la base (seeds CMS), lecture des chartes existantes (P3, P4/T1, P4/T2) et des verrous de test (`tests/design-zalando.test.ts`, `tests/design-tokens.test.ts`).

---

## 0. Verdict en trois lignes

1. **L'identité de marque est cassée au runtime.** Le logo AYROVI est noir + orange `#FF6900` (mesuré sur le fichier). Mais depuis l'commit `b96f027` (« no orange (creative, not hasty) »), `App.tsx` ré-écrit **à l'exécution** `--ayrovi-color-brand-orange: #0A0A0A` : tout l'orange de la plateforme devient noir, alors que les tests et la charte P4/T1 verrouillent l'orange comme CTA canonique. Le site ne ressemble plus à sa propre marque.
2. **Deux échelles grises coexistent sur la même page** (le P0 de P4/T2 n'a jamais été appliqué) : l'échelle canonique `#111111/#666666/#f8f9fa/#eaeaea` (portée par les primitives `zalando-ui.css`) et l'échelle slate héritée `#111318/#1d2130/#6b7280/#f8f9fe/#e2e8f0/#5b6472` (portée par les seeds CMS injectés au runtime sur TOUT le UI). Résultat mesuré : **314 valeurs hexadécimales distinctes** dans le client public, dont **~10 nuances de « noir »** et 5 de « blanc ».
3. **Le système s'arrête aux tokens** : il existe 6 jetons canoniques verrouillés + une feuille de primitives, mais **aucune bibliothèque de composants publique** (l'Admin en a 25, la vitrine 2), et 4 familles de boutons parallèles. L'application du système aux pages s'est faite par classes ad hoc, avec 197 tailles de police hors échelle et une z-indexation anarchique.

---

## 1. Ce qui a été inspecté

| Surface | Fichiers principaux | État |
|---|---|---|
| Tokens | `client/src/design/tokens.css` (493 l.) | Couche vitrine + couche Admin + 211 « tones » verbatims |
| Feuilles système | `index.css` (1 407 l.), `typography.css`, `zalando-ui.css`, `ayrovix-theme.css`, `checkout-flow.css`, `interface-runtime.css`, `journey.css` | Fragmentées ; `!important` en chaîne |
| Shell public | `App.tsx`, `Navbar.tsx`, `TopAnnouncementBar.tsx`, `BottomNavBar.tsx`, `Footer.tsx`, `MenuDrawer.tsx` | Injection runtime des tokens CMS dans `App.tsx` |
| Homepage | `EvergreenHero.tsx`, `LensFeature.tsx` (`.lens2`), `StoriesShowcase.tsx`, `HeroSlider.tsx`, `PublicCmsSections.tsx`, `DiscoveryHub.tsx` | Hero CMS-driven (bon), sections mortes |
| Commerce | `ProductDrawer.tsx`, `CartDrawer.tsx`, `CheckoutModal.tsx`, `OrderSuccessModal.tsx` | Flux fonctionnels, visuels ad hoc |
| Compte / Auth | `CustomerAccountPage.tsx` (865 l.) | 37 `rounded-2xl` + 9 `rounded-3xl` + 7 `rounded-xl` dans un seul fichier |
| Ayrovix Lens | `ayrovix/components/*` (LensLauncher 941 l., LiveCamera, InteractiveLensResults, ProductResult) | Thème sombre propre (`ayrovix-theme.css`), littéraux restants |
| Assistant SONIM | `assistant/*` (11 fichiers) | 67 + 18 + 9 hex littéraux ; « identité violette » résiduelle |
| Config CMS | `config/interfaceConfig.ts`, seeds `src/db/database.ts` | Valeurs par défaut = échelle slate (le vecteur de la dualité) |
| Verrous | `tests/design-zalando.test.ts`, `tests/design-tokens.test.ts`, `verify/zalando-audit.mjs` | Solsides ; couvrent l'orange, pas l'échelle grise ni la typo |

---

## 2. Problèmes identifiés (mesurés)

### 2.1 Couleur — P0

| # | Problème | Localisation | Impact UX |
|---|---|---|---|
| C-1 | **Override runtime orange→noir** : `--ayrovi-color-brand-orange: #0A0A0A`, `--ayrovi-cta: #0A0A0A`, `--ayrovi-orange: #0A0A0A` injectés après `getCommerceConfig()` ; `--ayrovi-cta-dark: #d95a00` reste → le hover du CTA « orange » rend de l'orange | `App.tsx:160-163` | La marque perd son accent ; le logo et le site ne collent plus ; comportement incohérent (bouton noir qui vire à l'orange au survol) |
| C-2 | **Double échelle grise** : canonique vs slate, injectées l'une sur l'autre (CMS → `--ayrovi-neutral-900/500/50/200`) | `tokens.css:113-124`, `interfaceConfig.ts`, seeds `database.ts:2290-2307`, injection `App.tsx:157-172` | Deux gris « presque identiques » (≤ 5/255) sur la même page → hiérarchie floue, impression de « pas fini » |
| C-3 | **314 hex distincts** dans le client public (hors tokens) ; noirs : `#111111`×51, `#111318`×23, `#17181c`×13, `#111217`×8, `#0A0A0A`×7, `#171717`×6, `#050505`×6, `#17151f`, `#15201f`, `#23242c` | 15 fichiers (top : `AssistantVoiceModeScreen` 67, `index.css` 48, `interfaceConfig` 41) | Aucune cohérence de surface ; le « noir » varie d'une page à l'autre |
| C-4 | **Contraste CTA** : blanc sur `#FF6900` = **2.89:1** (AA exigé 4.5:1) ; appliqué dans `.ay-btn-cta`, `.ay-runtime-button` (`color:#fff!important`), hero CTA | `interface-runtime.css`, `zalando-ui.css`, `EvergreenHero.tsx` | Faille WCAG sur le bouton le plus important du site ; noir sur orange = 6.54:1 ✓ |
| C-5 | `--ayrovi-warning: #b77900` : 0 usage réel UI, mais présent dans tokens + config + injection | `tokens.css:126`, `interfaceConfig.ts:186` | Proche concurrent de l'orange sur la roue chromatique ; noise potentiel |
| C-6 | « Identité violette » résiduelle de l'assistant : `--ayrovi-purple` (alias du noir — nom mensonger), `.hostinger-purple-card`, commentaires « purple light effect », `outline: 2px solid var(--ayrovi-purple)` (focus ring) | `index.css:53,121,267,673`, `AssistantBrandMark.tsx` | Nomenclature trompeuse ; le focus ring utilise un nom de couleur qui n'existe plus |

### 2.2 Typographie — P1

| # | Problème | Mesure | Impact |
|---|---|---|---|
| T-1 | **197 tailles hors échelle** en classes arbitraires : `text-[11px]`×92, `text-[10px]`×66, `text-[9px]`×13, `text-[12px]`×11, `text-[12.5px]`, `text-[10.5px]`, `text-[26px]`×6… | `grep` sur components/ayrovix/social | Échelle de lecture inexistante ; les tailles « .5px » ne sont même pas alignables ; illisible sur certains écrans (9-10px) |
| T-2 | Tailles brutes en CSS : 9.5 / 10 / 10.5 / 11.5 / 12.5 / 13 / 13.5 / 14.5 / 15 px | `index.css` (`.lens2*`, `.lens-phone*`, `.brands-*`) | Même problème côté CSS |
| T-3 | Utilitaires `.ay-edit-26/30/32/36` avec `!important` hors échelle | `index.css:963-969` | Contournent l'échelle `--text-h*` de `typography.css` |
| T-4 | Trois voix typographiques : tokens `--text-body*` (`.ay-text-*`), Tailwind `text-*`, arbitraires `text-[…]` | partout | Le même rôle (ex. « label meta ») est rendu à 3 tailles différentes selon la page |

### 2.3 Espacement / layout / forme / élévation — P1

| # | Problème | Mesure | Impact |
|---|---|---|---|
| L-1 | Rayons mixtes au sein d'une même famille : `CustomerAccountPage` 37×`rounded-2xl` + 9×`rounded-3xl` + 7×`rounded-xl` + 9×`rounded-full` ; `ProductDrawer` 13×`rounded-xl` + 6×`rounded-2xl` + 2×`rounded-3xl` ; `rounded-lg` (8px) hors échelle | 5 fichiers | Les cartes « respirent » différemment selon la page ; pas de signature |
| L-2 | Dimensions arbitraires : `h-[46px]`, `h-[54px]`, `h-[44px]`, `w-[78px]`, `w-[62px]`, `pt-[96px]`, `gap-[10px]` | 20+ occurrences | Hauteurs de boutons inégales entre écrans (44/46/54) |
| L-3 | **Z-index anarchique** : `z-10`×31, `z-20`×8, `z-30`×8, `z-40`×7, puis `z-[1]…z-[16]`, `z-[65]…z-[130]` (12 valeurs arbitraires) | 30 fichiers | Collision de calques aléatoire (lens vs modale vs toast) ; inmaintenable |
| L-4 | 3-4 systèmes d'ombre : `shadow-card`, `shadow-overlay`, `shadow-xs`, `rgba()` en dur (glass nav, hero CTA) | `interface-runtime.css`, `EvergreenHero.tsx` | Élévation incohérente |
| L-5 | Le `.managed-public-section-inner.is-contained` impose `overflow:hidden` + `border-radius` → contenu coupé en bords de section (signaling « éléments coupés » signalée par le client) | `interface-runtime.css` | Sections visuellement coupées |

### 2.4 Composants — P1

| # | Problème | Localisation |
|---|---|---|
| K-1 | **4 familles de boutons parallèles** : `Button.tsx` (variants) · `.ay-btn-primary/secondary/cta` (zalando-ui) · `.ay-runtime-button--*` (interface-runtime, `!important`) · CTA hero « fait main » (`rounded-full px-7 py-3.5`) | 4 fichiers |
| K-2 | `Button.tsx` référence des jetons morts : `border-line-dark`, `bg-ink-dark` (inexistants dans `@theme`) → le hover du bouton primaire ne fonctionne pas | `design/Button.tsx:9` |
| K-3 | **Pas de bibliothèque publique** : `design/` ne contient que `Button` + `AppHeader` (Admin : 25 composants) ; pas de Badge, Card, Price, Input, Modal, Drawer, Toast, Skeleton, EmptyState, ErrorState côté vitrine | `client/src/design/` |
| K-4 | États (vide / chargement / erreur / succès) improvisés par flux (ex. `OrderSuccessModal` construit son propre succès ; le panier vide n'a pas de shared EmptyState) | `components/*` |
| K-5 | **UI morte** : `Footer.tsx` est filtré hors de la page d'accueil (jamais rendu) ; `.brands-*`, `.brands-section`, `.lens-hero` (v1), `AboutSection`/`PartnerBrandsSlider` en retrait mais CSS intact (200+ lignes) | `App.tsx:571`, `index.css:793-960` |
| K-6 | Fragmentation CSS : 7 feuilles + `index.css` 1 407 lignes ; `interface-runtime.css` réécrit les boutons/headers avec `!important` par-dessus les tokens (deux sources d'autorité en conflit) | `styles/*` |

### 2.5 Responsive / accessibilité — P2

| # | Problème | Impact |
|---|---|---|
| R-1 | Glass bottom-nav en dur : `rgba(255,255,255,.72)`, `#111318`, `#5b6472`, `border rgba(17,19,24,.1)` | Couleur du rail hors système ; cassure si un thème CMS modifie les encres |
| R-2 | Header sur hero : fond `color-mix(#fff 78%)` en dur + bordure `#111318 8%` en dur | Même problème |
| R-3 | Focus ring = `--ayrovi-purple` (nom trompeur) ; pas de focus ring inverse pour les surfaces sombres (Lens, hero) | Accessibilité + confusion |
| R-4 | Boutons de 9-11px de texte (labels bottom-nav, chips) — sous le seuil de confort mobile | Lisibilité |

### 2.6 Gouvernance — P1

| # | Problème |
|---|---|
| G-1 | Le CMS « Interface Studio » peut réécrire **toutes** les couleurs/typos/layouts au runtime : ses **défauts sont l'échelle slate** (le vecteur de C-2) et sa chaîne `!important` court-circuite les verrous de design |
| G-2 | L'audit pixel orange (`verify/zalando-audit.mjs`) existe mais n'est pas dans le CI ; aucun ratchet sur l'échelle grise, la typo hors échelle ou les rayons |
| G-3 | Les verrous `design-zalando` ne protègent que l'orange ; le P0 de P4/T2 (unification grise) a été documenté mais jamais exécuté |

---

## 3. Ce qui est PRESERVÉ (fonctionnel et bon)

1. **Architecture de navigation** : pile `NavigationHistory`, drawers plein écran, Back natif — excellente base, ne pas toucher.
2. **Flux Lens** : caméra/galerie/lien/QR, `liveVisionRuntime`, résultats comparés — comportement intact (seule la couche visuelle est alignée).
3. **Hero CMS-driven** : focal point, overlay auto par luminance, accent configurable, srcset responsive — conservé, aligné sur les tokens.
4. **Système d'icônes** : catalogue unique monoline 1.5 sur grille 24 + `QatafoIcons` (compat) — bon, conservé.
5. **Couche Admin** : tokens `--admin-*`, 25 composants, verrous `design-tokens` — **hors périmètre**, non modifiée.
6. **Verrous existants** : `design-zalando.test.ts`, `design-tokens.test.ts`, `zalando-audit.mjs` — conservés et **étendus** (pas réécrits).
7. **Toute la logique business** : panier, checkout, OMS, pricing, auth, CMS, CRM — intouchée.

## 4. À refactoriser / remplacer / supprimer

| Statut | Élément |
|---|---|
| **Refactoriser** | `App.tsx` (injection runtime), `interfaceConfig.ts` + seeds (défauts), `index.css` (`.lens2*`, focus, `.ay-edit-*`), `interface-runtime.css` (boutons, header, glass nav), `zalando-ui.css` (CTA ink), `EvergreenHero`, `BottomNavBar`, `TopAnnouncementBar`, `ProductDrawer`, `CartDrawer`, `CheckoutModal`, `CustomerAccountPage`, `MenuDrawer`, `OrderSuccessModal`, `StoriesShowcase`, assistant (noms violets), Lens chrome |
| **Remplacer** | Les 4 familles de boutons → 1 composant `Button` + primitives CSS ; les tailles arbitraires → échelle de tokens ; les `rounded-*` → 3 rayons système ; z-index arbitraires → 8 niveaux documentés |
| **Supprimer** | Override orange→noir (`App.tsx`), `.ay-edit-26/30/32/36`, blocs CSS morts (`.brands-*` v1, `.lens-hero` v1 — après vérification d'usage), jeton `--ayrovi-warning` (0 usage UI), noms `--ayrovi-purple/yellow/black` (remplacer par `--ayrovi-ink-deep` etc.), `.hostinger-purple-card` |
| **Créer** | Bibliothèque publique `client/src/design/ui/` (15 composants), `DESIGN_SYSTEM.md`, ratchets de test (gris, typo, rayons) |

---

## 5. Direction de design proposée — « AYROVI v1.0 : Monochrome Premium × Orange d'action »

**Analyse (pas de préférence imposée) :**
- Le **logo** (mesuré) = monogramme noir + accent orange → l'identité de marque est déjà « noir + orange sur clair ».
- La **constitution P4/T1** (testée) = canvas monochrome, orange `#FF6900` = déclencheur d'action unique, budget ≤ 3 % de la surface.
- Le produit (shopping international premium, TND, IA) demande : confiance (monochrome épuré), action (orange rare donc mémorisable), technicité (Lens sombre immersif).
- L'option « tout noir » (commit `b96r027`) contredit le logo et dilue la marque : un e-commerce 100 % noir/blanc est générique. **Recommandation : restaurer l'orange comme accent de marque (dans sa règle d'origine : action seulement), et faire du noir `#0A0A0A` l'encre premium des surfaces** (hero, announcement, Lens, headers sombres).

**Les 6 principes :**
1. **Une seule échelle neutre** : `#FFFFFF` canvas · `#F8F9FA` surface · `#EAEAEA` filet · `#111111` encre texte · `#666666` encre secondaire · `#0A0A0A` surface sombre · `#3F3F46` élément doux sur sombre. (Toute la slate est absorbée — P0 P4/T2 enfin exécuté.)
2. **L'orange n'est jamais décoratif** : CTA principal, étape active, point actif, filet 3px d'identité — ≤ 3 % de la surface (audit pixel existant). Texte **sur** orange = `#111111` (6.54:1, WCAG AAA).
3. **Une seule voix typographique** : Inter + Noto Sans Arabic, échelle 10→48 px, roles nommés (display/h1/h2/h3/body/small/caption/eyebrow/price).
4. **Trois rayons** : contrôle 12 px · carte 16 px · chip/pill 999 px. **Cinq ombres max** : xs/card/overlay (+ 2 variantes dark).
5. **Cinq pas d'espacement** : 4 / 8 / 12 / 16 / 24 px en base, 48 / 72 px pour le rythme de section (mobile/desktop). Conteneur 1200 px, gouttière 16 / 24 / 32 px.
6. **Mouvement discret** : 140 / 200 / 320 ms, easing `cubic-bezier(.22,1,.36,1)`, `prefers-reduced-motion` respecté partout.

**Ayrovix Lens** : conserve son caractère immersif sombre (canvas `#0A0A0A`), mais parle le même système — mêmes tokens d'encre, même CTA orange, mêmes rayons, mêmes micro-animations. Un seul produit.

## 6. Plan d'exécution

| Étape | Contenu | Risque |
|---|---|---|
| A | Tokens : unification de l'échelle + rôles nouveaux (ink-deep, cta-hover/active/ink, focus, espace, rayons, ombres, motion) | Verrous `design-zalando` respectés (6 jetons canoniques inchangés) |
| B | Runtime : fix de l'override orange, défauts CMS → échelle canonique, seed DB + migration `rebrand_neutral_scale_v1` | Tests migration/existing |
| C | Feuilles système : `index.css` (`.lens2*`, focus, mort), `interface-runtime.css`, `zalando-ui.css`, `typography.css` | Rendu des sections CMS |
| D | Bibliothèque `design/ui/` (15 composants) | — |
| E | Migration pages : shell + homepage → commerce (drawer/panier/checkout/succès) → compte/auth → assistant → Lens → stories | Régressions visuelles |
| F | Verrous : extension `design-zalando.test.ts` (ratchet gris, typo, rayons, z-index, CTA ink) | — |
| G | Validation : typecheck, 678+ tests, build, serveur + captures Playwright (mobile/desktop), audit pixel orange, contraste | — |
| H | Documentation : `DESIGN_SYSTEM.md`, rapport d'implémentation, listes (modifié / préservé / supprimé) | — |

**Séparation stricte :** aucun changement de logique business (API, DB schema, auth, pricing, OMS). Seuls les seeds de **thème** du CMS sont migrés (données de présentation), avec une migration idempotente documentée.
