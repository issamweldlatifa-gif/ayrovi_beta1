# AYROVI DESIGN SYSTEM v1.1

**Charte : « Monochrome Premium × Orange d'action »**
Date : 2026-09-18 · Statut : appliquée à la vitrine, verrouillée par tests.
Documents liés : `docs/DESIGN_AUDIT_2026-09-18.md` (audit) · `tests/design-zalando.test.ts` + `tests/design-tokens.test.ts` (verrous) · `verify/zalando-audit.mjs` (audit pixel).

---

## 1. Identité

AYROVI achète le monde pour la Tunisie, en dinars. La marque se lit comme :

- **confiance** → canvas clair, encre nette, hiérarchie évidente ;
- **action** → l'orange de la marque, rare et mémorisable, pointe le bouton à presser ;
- **technicité** → Lens : coquille sombre immersive, mais le même système.

Le logo (mesuré) est noir + orange `#FF6900`. Le design system existe pour que
**le site ressemble toujours au logo**, sur n'importe quel écran, par n'importe quel
développeur, pour toujours.

### Les 6 principes

| # | Principe | Règle |
|---|---|---|
| 1 | Une seule échelle neutre | `#FFF / #F8F9FA / #EAEAEA / #111111 / #666666` + surfaces sombres `#0A0A0A / #3F3F46`. Aucune dixième nuance de gris, jamais. |
| 2 | L'orange n'est jamais décoratif | CTA principal, état actif, point actif, filet 3px. **≤ 3 % de la surface d'un écran** (audit pixel). Texte sur orange : `#111111` (6.54:1, AAA). |
| 3 | Une voix typographique | Inter + Noto Sans Arabic, échelle de tokens, rôles nommés. |
| 4 | Trois rayons, quatre ombres | 12 px contrôle · 16 px carte · 999 px chip. xs / card / overlay (+card-dark). |
| 5 | Mouvement discret | 140 / 200 / 320 ms, `cubic-bezier(.22,1,.36,1)`, `prefers-reduced-motion` respecté. |
| 6 | Calques documentés | 8 niveaux z, pas de `z-[N]` arbitraire. |

---

## 2. Tokens (source unique : `client/src/design/tokens.css`)

### 2.1 Couleurs

**Canonique (verrouillée caractère par caractère par `tests/design-zalando.test.ts`) :**

| Token | Valeur | Rôle |
|---|---|---|
| `--ayrovi-bg-main` | `#ffffff` | Canvas (≈ 95 % de la surface) |
| `--ayrovi-bg-surface` | `#f8f9fa` | Cartes, listes, champs, maquettes de comparaison |
| `--ayrovi-border-soft` | `#eaeaea` | Filets 1 px, séparateurs |
| `--ayrovi-text-primary` | `#111111` | Encre : titres, prix, texte, texte sur orange |
| `--ayrovi-text-secondary` | `#666666` | Légendes, méta, prix secondaires |
| `--ayrovi-color-brand-orange` | `#ff6900` | La marque. Un seul porteur de la valeur. |

**Surfaces sombres premium (la seule famille de noir) :**

| Token | Valeur | Rôle |
|---|---|---|
| `--ayrovi-ink-deep` | `#0a0a0a` | Hero, announcement bar, coquille Lens, rails, carte « dark feature » |
| `--ayrovi-ink-soft` | `#3f3f46` | Éléments doux sur sombre (liserés, icônes au repos, dégradés) |

**Chaîne CTA (une source, dérivations incluses) :**

| Token | Valeur | Rôle |
|---|---|---|
| `--ayrovi-cta` / `--ayrovi-orange` / `--ayrovi-accent` | alias → orange | Un seul porteur réel |
| `--ayrovi-cta-ink` | `#111111` | **Texte sur orange** (6.54:1 AAA — le blanc ne passe qu'à 2.89:1, interdit) |
| `--ayrovi-cta-hover` | `color-mix(orange 87 % + encre)` | Survol (≈ `#e05e00`) |
| `--ayrovi-cta-active` | `color-mix(orange 72 % + encre)` | Pressé (≈ `#c75200`) |
| `--ayrovi-cta-dark` | alias → hover | Compat historique |

**États :** `--ayrovi-success #15803d` (+`-soft #e6f5ec`) · `--ayrovi-danger #dc2626` (+`-soft #fdecec`).
Plus de kهرماني : `--ayrovi-warning` est supprimé (0 usage UI) ; un avertissement se
signale en gris + icône.

**Alias sans valeur propre** (compat, en voie de retrait) : `--ayrovi-primary(-dark/-light)`,
`--ayrovi-neutral-50/200/500/900/950`, `--ayrovi-black`, `--ayrovi-ink/-muted/-surface/-border`.
La vieille échelle slate (`#111318/#1d2130/#6b7280/#f8f9fe/#e2e8f0/#5b6472/#050505`) est
**absorbée** : tout littéral slate dans la vitrine casse les tests.

**Focus :** `--ayrovi-focus-ring` (encre) / `--ayrovi-focus-ring-inverse` (blanc, sur surfaces sombres).

### 2.2 Typographie

Police : `Inter` + `Noto Sans Arabic` (poids 400–700). Rôles :

| Rôle | Mobile | ≥ 768 px | Usage |
|---|---|---|---|
| `--text-display` | 36 px / 40 | 48 px / 52 | Hero, titres de section phare |
| `--text-h1` | 30 / 36 | 36 / 45 | Titre de page |
| `--text-h2` | 24 / 30 | 28 / 35 | Titre de section |
| `--text-h3` | 20 / 26 | 22 / 28 | Sous-section, titre de carte forte |
| `--text-body-lg` | 18 / 27 | idem | Lead |
| `--text-body` | 16 / 24 | idem | Corps |
| `--text-body-md` | 15 / 22 | idem | Corps compact |
| `--text-small` | 14 / 20 | idem | Corps dense, labels de liste |
| `--text-caption` | 12 / 16 | idem | Badge, méta, eyebrow (avec `tracking 0.18–0.24em`) |
| `--text-button` / `--text-nav` | 15 / 14 | idem | Boutons, navigation |
| `--text-price` | 18 (semibold) | idem | Montants TND (tabulaires) |

**Interdit dans la vitrine** : `text-[Npx]` (ratchet test à zéro). Les tailles hors
échelle existaient par centaines (92 × 11 px, 66 × 10 px, 9.5 px, 12.5 px…) : tout est
réaligné sur l'échelle. Exception documentée : la maquette téléphone de Lens simule un
appareil — tailles d'affichage, jamais dans le UI réel.

### 2.3 Espacement & layout

| Token | Valeur | Rôle |
|---|---|---|
| `--ayrovi-gutter` / `-md` / `-lg` | 16 / 24 / 32 px | Gouttières (mobile / tablette / desktop) |
| `--ayrovi-container` / `-narrow` | 1200 / 896 px | Largeurs de contenu |
| `--ayrovi-section-y-mobile` / `-desktop` | 48 / 72 px | Respiration verticale des sections |
| grille de base | pas de 4 px | Toute padding/gap/margin (1, 2, 3, 4, 6, 8, 12, 16, 24…) |

### 2.4 Forme, élévation, mouvement, calques

| Famille | Jetons | Valeurs |
|---|---|---|
| Rayons | `--ayrovi-radius-control` / `-card` / `-chip` / `-icon` | 12 px / 16 px / 999 px / 10 px — **rien d'autre** |
| Ombres | `--ayrovi-shadow-xs` / `-card` / `-overlay` / `-card-dark` | 4 niveaux, c'est tout |
| Mouvement | `--ayrovi-motion-fast` / `-base` / `-slow` | 140 / 200 / 320 ms |
| Courbes | `--ayrovi-ease-out` / `-in-out` | `.22,1,.36,1` / `.45,0,.55,1` |
| Calques | `--ayrovi-z-header…-toast` | 20 / 25 / 30 / 40 / 45 / 50 / 60 (header, fab, bottom-nav, drawer, lens, modale, toast) |

`prefers-reduced-motion` : toutes les animations décoratives s'arrêtent (les transitions
de 1 ms restent).

---

## 3. Composants (vitrine : `client/src/design/ui/`)

Point d'import unique :

```tsx
import { Button, Badge, Card, Price, Field, Input, Select, Textarea,
         Modal, Toast, Skeleton, Spinner, EmptyState, StatusBadge,
         Container, SectionHeader } from '../design/ui';
```

| Composant | Variantes / règles clés |
|---|---|
| `Button` | `cta` (orange, texte **encre**, unique par écran) · `primary` (noir) · `secondary` (blanc + filet) · `ghost` · sizes sm/md/icon. Focus ring encre. |
| `Badge` | `neutral / subtle / dark / success / danger / onDark`. Jamais une pastille orange pleine. |
| `Card` | Surface + filet 16 px ; `accent` = filet d'identité 3 px orange (bord amont). |
| `Price` | Montant TND tabulaire + prix barré secondaire. |
| `Field/Input/Select/Textarea` | Label encre secondaire, fond surface, **focus visible** (filet + ring encre), erreur = danger. Le `focus:outline-none` sans substitut est interdit. |
| `Modal` | Calque 50, rayon carte, Escape + clic calque, focus initial, scroll lock. |
| `Toast` | `success / danger / info`, calque 60. |
| `Skeleton` / `Spinner` | Chargement : surface pulsée / anneau encre. |
| `EmptyState` | Icône dans pastille + titre + texte + action (action secondaire, jamais orange hors CTA). |
| `StatusBadge` | PAID/COMPLETED → vert · FAILED/CANCELLED → rouge · PENDING → gris · CONFIRMED → encre. Pas d'orange (l'orange = action). |
| `Container` / `SectionHeader` | Rythme de section standard (eyebrow + titre + sous-titre). |

**Boutons — hiérarchie figée** : un seul `cta` par écran. Tout bouton concurrent devient
`secondary`. Les 4 familles historiques de boutons (`ay-btn-*`, `ay-runtime-button--*`,
`Button.tsx`, CTA ad hoc) convergent vers ces 4 variantes alimentées par les mêmes tokens.

**Couche admin** : `client/src/design/admin/` (25 composants) conserve sa charte
propre verrouillée par `tests/design-tokens.test.ts`. Les 7 concepts partagés
(Badge, EmptyState, Field, Modal, Select, StatusBadge, Toast) + Button existent
**une fois par couche** — jamais un troisième porteur (test).

---

## 4. Surfaces

### 4.1 Homepage
- **Hero** : image full-bleed, overlay auto par luminance, texte encre inversée sur
  `#0A0A0A`, CTA = variante `cta` du système (orange, texte encre), filet orange 1 px
  en fond de section.
- **Section Lens** (`.lens-feature`) : canvas blanc, titre display, media plein écran
  sur mobile, lien éditorial avec flèche orange (unique point orangé de la section).
- **Stories** : rail de cartes, icônes encre, état actif orange.
- **Bottom nav** : verre 72 % blanc, icônes encre secondaire, **état actif orange**
  (icône + libellé + pastille), rayon 16 px.

### 4.2 Commerce
- **Product drawer** : galerie pleine largeur, prix via `Price`, CTA « Ajouter » = `cta`
  unique ; cartes « autres offres » = `Card` ou carte dark (`ay-dark-feature-card`).
- **Panier** : lignes séparées par filets 1 px, quantités en contrôles 12 px, total en
  `Price lg`, CTA checkout = `cta`.
- **Checkout** : champs `Field/Input/Select/Textarea`, étapes via step-tracker
  (actif orange), récapitulatif en `Card`.
- **Succès** : pastille verte `success`, numéro de commande, actions secondaires.

### 4.3 Compte / auth
Une seule grille de champs (`inputClass` → tokens), statuts via `StatusBadge`,
onglets en pills 999 px, états vides via `EmptyState`.

### 4.4 Ayrovix Lens
Caractère distinct assumé (immersion caméra) **dans le même système** :
- canvas `#0A0A0A` (`--ayrovix-theme-scope`), panneaux `color-mix` des encres ;
- même rayons, même CTA orange (texte encre), même step-tracker, même motion ;
- l'orbe vocal ne porte que : orange (écoute) · encre (traitement) · danger (erreur).
  Le bleu et le vert « parlant » sont retirés.
- Le viseur reste neutre (blanc sur photo, façon Google Lens) — pas de viseur orange.

### 4.5 Assistant (SONIM)
Surface conversationnelle : bulles surface/encre, orbe + composer sur la même échelle,
bouton d'envoi = `cta` (écran = une seule action). L'ancienne « identité violette »
(aliases `--ayrovi-purple`, `.hostinger-purple-card`) est retirée du vocabulaire.

---

## 5. Règles de gouvernance (contrôlées par CI)

1. **Pas de couleur hors tokens** dans la vitrine — les 13 hex tolérés dans les TSX sont
   tous des porteurs canoniques (orange, encres, chaîne CTA, danger) + 1 marque sociale
   (Facebook `#1877F2`) + 1 donnée d'image (dominante du hero par défaut).
2. **Pas de slate** (`#111318/#1d2130/#6b7280/#f8f9fe/#e2e8f0/#5b6472/#050505/#17181c/
   #111217/#171717/#23242c`) — test.
3. **Pas de `text-[Npx]`** dans la vitrine — ratchet à zéro.
4. **CTA = texte encre** — test (6.54:1).
5. **Orange ≤ 3 % de la surface** — `npm run audit:design` (compte les pixels).
6. **Un porteur par valeur, une primitive par couche** — tests.
7. **Le CMS (Interface Studio) ajuste, ne réinvente pas** : ses valeurs par défaut sont
   la canonique ; l'override runtime « orange → noir » (bug `b96f027`) est corrigé et
   verrouillé par test.
8. Toute exception (ex. maquette téléphone de Lens, marque Facebook) est **documentée ici**.

---

## 6. Ce qui n'a PAS changé (protection du business)

Backend, API, OMS, pricing (EUR/USD/GBP/JPY/TND), auth client/admin, CMS, CRM,
Lens (flux caméra/galerie/lien/QR), panier/checkout, notifications, Android :
**aucune logique modifiée**. Seules les **données de présentation** du CMS (seeds de
thème) ont été migrées par `rebrand_neutral_scale_v1` (one-shot, idempotent), dans le
même pattern que les migrations de palette existantes.

## 7. Pile

```
tokens.css (valeur) → @theme inline (classes Tailwind) → composants (design/ui)
        ↑ CMS Interface Studio (ajustement runtime, valeurs par défaut canoniques)
tests/design-*.test.ts (verrous) + verify/zalando-audit.mjs (pixels)
```

## 8. Roadmap

- [ ] Dark mode global (le système est prêt : 4 définitions suffisent)
- [ ] `verify/contrast.mjs` : matrice de contraste générée depuis les tokens
- [ ] Audit pixel dans le CI (exige un serveur de build)
- [ ] Retrait progressif des alias morts (`--ayrovi-purple*`, `--hostinger-*`)


## 12. Écrans client — mobile first (2026-09-19)

### Portée et référence

La nouvelle direction validée par les références utilisateur est appliquée **uniquement
à la connexion et à l’inscription**, pas au compte connecté, à la vitrine ou à l’Admin.
Les deux références montrent une tête colorée et une carte blanche arrondie. Elles ne
sont pas copiées à l’identique : labels persistants, français/arabe, vrais moyens de
connexion configurés et CTA correct (« Se connecter » sur la connexion).

**Exception explicite à la règle orange ≤3 % et aux rayons génériques :** `.ay-auth`
peut avoir un en-tête orange de marque, une sheet 32px et des contrôles pill (alias du
token chip). Le texte sur orange reste noir pour le contraste. Ce n’est pas une
modification des règles de la vitrine et ne justifie pas de recolorer les autres pages.

### Contrat à réutiliser écran par écran

- Palette existante, aucune nouvelle couleur brute. Pas de dégradé lourd ou de fond photo.
- Inter / Noto Sans Arabic existants, labels 14px, champs **16px minimum**, titre auth 28px.
- Échelle d’espacement : 4, 8, 12, 16, 20, 24, 32px (`--ayrovi-space-*`).
- Champs et CTA : 48px minimum ; cible icône/lien d’action : 44px minimum.
- Marge latérale 24px (16px sous 360px) ; largeur formulaire max 460px.
- Mobile plein écran avec défilement naturel. Ne jamais centrer verticalement un
  formulaire trop haut : le clavier et les petits écrans doivent pouvoir défiler.
- Zones sûres `env(safe-area-inset-*)`, direction RTL et propriétés logiques CSS.
- Un CTA principal noir, alternatives blanches bordées, lien explicite de changement
  de mode. Ombre xs uniquement sur le CTA.
- Composants canoniques : `design/Button.tsx`, `design/ui/Field.tsx` (`Field`, `Input`).
- Labels reliés aux IDs ; contrôle afficher/masquer nommé selon son état ; erreurs
  `role=alert`, chargement `role=status`, soumission bloquée pendant le traitement.
- Réduction du mouvement respectée. Ne pas empêcher le gestionnaire de mots de passe.
- Les identifiants ne viennent jamais de données démo, du profil précédent ou du
  stockage local. Nettoyage à la fermeture et au changement de session ; mot de passe
  masqué et vidé au changement de mode.
- Les boutons OAuth/SMS n’existent que si l’API auth les annonce disponibles.
- Aucune fausse promesse fonctionnelle : « Mot de passe oublié ? » montre actuellement
  un vrai formulaire de récupération lorsque le mailer est configuré. Sans configuration,
  l’interface explique l’indisponibilité et ne simule aucun envoi. Voir `AUTH_EMAIL_SETUP_AR.md`.

### Validation avant passage à l’écran suivant

1. Vérifier le diff : aucune modification imprévue des autres écrans.
2. `npm run typecheck`, `npm test`, `npm run build`.
3. Serveur démarré : `node verify/customer-auth-mobile.mjs` (Chromium + Firefox).
4. Vérifier 320, 360, 390, 430 et 1280px, français/arabe, clavier, erreurs et état vide.
5. Présenter les captures et attendre l’approbation utilisateur.

Voir `docs/AUTH_MOBILE_IMPLEMENTATION_AR.md` pour le bilan et les limites.
