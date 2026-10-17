# ZAYROVI — Feuille de route de l'application mobile

> **Date du document** : 2026-10-17
> **Branche** : `arena/fe023a83-ayrovi-beta1`
> **Stratégie** : l'application mobile (`apps/mobile/`) est le produit principal.
> L'interface web publique (`client/`) reste dans le dépôt pour mémoire mais
> n'est plus la cible de développement.

## 1) État de l'application (`apps/mobile/`)

| Élément | Statut | Source |
|---|---|---|
| Plateforme | React Native 0.86.3 + Expo SDK 57 | `package.json` |
| Router | Expo Router (file-based) | `app/_layout.tsx` |
| Écrans | **30 écrans** (Tabs, Account, Catalog, Checkout, Lens, News, Orders, Product, Reels, Sign-in, Stories, Legal) | `app/**` |
| API client | 25 modules (account, assistant, cart, catalog, checkout, lens, payments, public, …) | `src/api/` |
| i18n | FR + AR (Zustand + TanStack Query) | `src/i18n/` |
| Phase P0 | **terminée** (coque, i18n, BUILD_STAMP) | `PLAN.md` §11 |
| Phase P1 | **terminée** (accueil, hero, navigation, hors-ligne) | `PLAN.md` §11 |
| Phase P2 | **prochaine** (Compte : OTP, email, Google/Facebook/Apple) | `PLAN.md` §11 |
| Phases P3-P7 | À planifier | `PLAN.md` §11 |

## 2) Ce que l'application consomme du backend

L'application mobile lit et écrit sur les endpoints suivants (extraits de
`apps/mobile/src/api/`). Le backend est la source unique de vérité.

### Authentification client
- `POST /api/customer/auth/otp/request` · `POST /api/customer/auth/otp/verify`
- `POST /api/customer/auth/email/login` · `POST /api/customer/auth/email/register`
- `POST /api/customer/auth/email-code/request` · `POST /api/customer/auth/email-code/verify`
- `GET /api/customer/auth/me` · `POST /api/customer/auth/logout`
- `GET /api/customer/auth/config`
- `POST /api/customer/auth/google/native` · `POST /api/customer/auth/native/claim`

### Compte client
- `GET/PUT /api/customer/account/overview` · `/profile` · `/preferences` · `/security`
- `POST /api/customer/account/security/password`
- `GET/PUT /api/customer/account/addresses`
- `GET/POST/DELETE /api/customer/account/favorites`
- `GET/POST /api/customer/account/notifications` · `POST /api/customer/account/notifications/read`
- `GET /api/customer/account/devices` · `POST /api/customer/account/avatar`
- `GET /api/customer/account/orders`

### Catalogue et panier
- `GET /api/cart/catalog` · `GET/POST/DELETE /api/cart/items`
- `GET /api/catalog` · `GET /api/linked-product`
- `GET /api/pricing` · `GET /api/payments`
- `POST /api/checkout`

### Lens et assistants
- `POST /api/ayrovix/analyze-image` · `/analyze-text` · `/analyze-url` · `/analyze-barcode` · `/analyze-code`
- `GET /api/ayrovix/live-events` (SSE)
- `POST /api/assistant/chat` · `GET /api/assistant/status`
- `POST /api/assistant/transcribe` · `POST /api/assistant/voice/tts`
- `POST /api/ocerex`

### Contenu public
- `GET /api/public/hero-content` · `/hero-slides` · `/hero/active` · `/hero/:id`
- `GET /api/public/navigation` · `/arrivals` · `/announcement-messages`
- `GET /api/public/commerce-config`
- `GET /api/sections` · `GET /api/footer`
- `GET /api/labels` · `GET /api/social`

## 3) Le serveur (`src/`) — ce qui sert l'application

| Module | Sert l'application ? | Notes |
|---|---|---|
| `src/db/` | ✅ vital | Schéma SQLite, migrations, seeds (101 tables) |
| `src/services/` | ✅ vital | Pricing, orderNotification, mailer, invoice, public config |
| `src/customer/` | ✅ vital | Auth client, sessions, OAuth Google/Facebook, OTP |
| `src/ayrovix/` | ✅ vital | Lens (Vision AI + SerpApi + OCR + scraper) |
| `src/ai-core/` | ✅ vital | Adaptateurs Claude, OpenAI, Gemini (transcribe, TTS) |
| `src/scraper/` | ✅ vital | Amazon, SHEIN, Temu (kraschir des prix) |
| `src/public/` | ✅ vital | Endpoints publics (hero, navigation, arrivals) |
| `src/cart/` + `src/checkout/` | ✅ vital | Panier + checkout (séparés ou fusionnés) |
| `src/admin/` | ⚠️ indirect | Sert le panneau admin (équipe) qui alimente la base de données |
| `src/crm/` | ⚠️ indirect | Sert l'admin — pas lu directement par l'application |
| `src/erp-core/` | ⚠️ indirect | Idem — alimente le stock consulté par l'application |
| `src/inventory/` | ⚠️ indirect | Idem |
| `src/purchasing/` | ⚠️ indirect | Idem |
| `src/back-office/` | ⚠️ indirect | Idem |
| `src/magazine/` | ⚠️ indirect | Idem (peut être coupé sans casser l'application) |
| `src/arrival-ingestion/` | ⚠️ indirect | Idem |
| `src/assistant/` | ✅ vital | Endpoint assistant (mobile l'appelle) |

## 4) CI/CD (`/.github/workflows/`)

| Workflow | Cible | Paths | Statut |
|---|---|---|---|
| `ci.yml` | Backend (Node/Express) | `src/**`, `tests/**`, `package.json` | ✅ actif |
| `mobile.yml` | Typecheck + tests `apps/mobile/` | `apps/mobile/**` | ✅ actif |
| `mobile-android.yml` | Build APK démo | `apps/mobile/**`, workflow lui-même | ✅ actif |
| `mobile-release-aab.yml` | Build AAB signé (Play Store) | manuel (`workflow_dispatch`) | ✅ actif |
| `aywebs-latency.yml` | Sonde latence (manuel) | manuel | ⚠️ moins prioritaire |

> Tous les workflows de production pointent vers `apps/mobile/` et `src/`.
> Le `client/` (interface web) n'est plus une cible de CI bloquante.

## 5) Feuille de route des phases de l'application

| Phase | Titre | Statut | Effort estimé | Bloque ? |
|---|---|---|---|---|
| P0 | Coque, i18n, BUILD_STAMP | ✅ terminé | — | — |
| P1 | Accueil, hero, navigation, hors-ligne | ✅ terminé | — | — |
| P2 | Compte (OTP, email, OAuth) | 🟡 prochaine | 2-3 semaines | Auth |
| P3 | Catalogue + Home (lecture CMS) | ⏳ | 2 semaines | P2 |
| P4 | Panier + Checkout + Paiements | ⏳ | 3-4 semaines | P2, P3 |
| P5 | Lens (caméra, Vision, OCR) | ⏳ | 3 semaines | P3 |
| P6 | Commandes + livraison + notifications | ⏳ | 2 semaines | P4 |
| P7 | Découverte + recherche + social (Reels, Stories) | ⏳ | 4 semaines | P3 |

## 6) Décisions de scope prises en 2026-10-17

1. **L'application mobile est le produit principal.** Toute nouvelle
   fonctionnalité est d'abord livrée dans `apps/mobile/`.
2. **L'interface web publique (`client/`) reste dans le dépôt pour mémoire**
   mais n'est plus une cible de développement actif. Aucune suppression n'est
   faite à ce stade.
3. **Le serveur reste partagé** (même SQLite, même Express). Le panneau
   `client/src/admin/` continue d'alimenter la base — l'application lit les
   mêmes données via l'API.
4. **Le déploiement reste un seul service Render** :
   `https://zayrovi-beta1-moo8.onrender.com`.
5. **Le domain de marque (`zayrovi.tn`)** n'est pas encore acquis. Les
   fichiers pointent vers le placeholder `your-zayrovi-domain.example` en
   attendant.

## 7) Points à clarifier avant P2

- Choix de l'OTP SMS tunisien (webhook déjà câblé, fournisseur à confirmer).
- OAuth Google natif (`@react-native-google-signin/google-signin` déjà
  installé, configuration Google Cloud Console à finaliser).
- Stratégie de cache offline pour l'écran Account.
- Gestion des versions de l'application (EAS Update vs store release).

## 8) Liens utiles

- Plan détaillé : `apps/mobile/PLAN.md`
- Tests Playwright device-acceptance : `apps/mobile/DEVICE_ACCEPTANCE_AR.md`
- Architecture du backend : `docs/ARCHITECTURE_SCALE.md`
- Déploiement Render : `docs/RENDER_DEPLOY.md`
