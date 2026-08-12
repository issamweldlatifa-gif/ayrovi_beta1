# AYROVI Admin CMS — architecture et API

## Vue d’ensemble

L’Admin AYROVI est une application React servie par le serveur Express existant à `/admin`. Il n’existe pas de second backend : le site public, Lens, le panier, le checkout et l’Admin partagent la même instance SQLite et les mêmes services.

Toutes les réponses JSON utilisent la forme générale `{ "success": true, "data": ... }`. Les erreurs utilisent `{ "success": false, "error": "..." }` avec un statut HTTP approprié.

## Sécurité et rôles

L’authentification Admin utilise une session opaque stockée en SQLite et un cookie `HttpOnly`, `SameSite=Strict` et `Secure` en production. Toutes les mutations Admin après connexion exigent le jeton CSRF courant dans l’en-tête `x-csrf-token`.

| Rôle | Capacités principales |
|---|---|
| `SUPER_ADMIN` | Accès complet, utilisateurs et audit inclus |
| `ADMIN` | Contenu, commandes, prix, paiements, paramètres et audit |
| `CONTENT_MANAGER` | Tableau de bord et gestion du contenu |
| `ORDER_MANAGER` | Tableau de bord, commandes, paiements et données commerce |

Permissions internes : `dashboard:read`, `content:read`, `content:write`, `commerce:read`, `orders:write`, `pricing:write`, `payments:write`, `settings:write`, `users:write`, `audit:read`.

## Modèle persistant

SQLite contient 23 tables :

- Accès : `admin_users`, `admin_sessions`, `audit_logs`.
- CMS : `arrivals`, `products`, `promotions`, `stories`, `news_items`, `brands`, `hero_slides`, `ai_knowledge`.
- Relations : `product_arrivals`, `promotion_arrivals`, `promotion_products`.
- Commerce : `cart_items`, `customers`, `orders`, `order_items`, `order_status_history`, `payments`, `deliveries`.
- Configuration : `pricing_config`, `settings`.

Une commande conserve son snapshot tarifaire et ses lignes historiques. L’archivage d’un contenu est logique : les relations nécessaires à l’historique ne sont pas supprimées.

## API publique et commerce

Préfixe : `/api`.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/health` | État du service et de SQLite |
| `POST` | `/api/extract-image` | Extraction Lens depuis une image multipart |
| `POST` | `/api/scrape` | Extraction Lens depuis une URL produit |
| `POST` | `/api/cart/items` | Ajout d’une ligne au panier avec tarification backend |
| `GET` | `/api/cart/items?sessionId=...` | Panier et totaux recalculés côté serveur |
| `PATCH` | `/api/cart/items/:id` | Modification de quantité |
| `DELETE` | `/api/cart/items/:id` | Suppression d’une ligne |
| `POST` | `/api/checkout` | Checkout transactionnel, client, commande, paiement et livraison |

Préfixe CMS public : `/api/public`.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/public/commerce-config` | Prix courants assainis, gouvernorats, paiements, délai et heure serveur |
| `POST` | `/api/public/pricing/preview` | Calcul tarifaire centralisé par devise, quantité et mode Express |
| `GET` | `/api/public/hero-slides` | Slides Hero actives |
| `GET` | `/api/public/brands` | Marques actives ordonnées |
| `GET` | `/api/public/arrivals` | Arrivages publics avec dates backend |
| `GET` | `/api/public/products?arrivalId=...` | Produits publics, filtrables par arrivage |
| `GET` | `/api/public/promotions` | Promotions actuellement visibles |
| `GET` | `/api/public/stories` | Stories actuellement publiées |
| `GET` | `/api/public/news?limit=...` | Actualités publiées |
| `GET` | `/api/public/home` | Agrégat de contenu pour la page d’accueil |
| `GET` | `/api/public/assistant-context` | Contexte commercial structuré et connaissances actives |

Les routes publiques ne renvoient ni compte Admin, ni session, ni secret, ni configuration interne sensible.

## API Admin

Préfixe : `/api/admin`.

### Authentification

| Méthode | Route | Permission | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Publique | Connexion limitée en fréquence, identité, permissions et CSRF |
| `GET` | `/auth/me` | Session | Identité et rotation du jeton CSRF |
| `POST` | `/auth/logout` | Session + CSRF | Invalidation de session |
| `POST` | `/auth/change-password` | Session + CSRF | Changement de mot de passe et invalidation des autres sessions |

### Tableau de bord

| Méthode | Route | Permission | Description |
|---|---|---|---|
| `GET` | `/dashboard?days=30` | `dashboard:read` | Commandes, revenu, clients, panier moyen, arrivages, statuts, tendances et sources |

### Ressources CMS génériques

Les ressources sont `arrivals`, `products`, `promotions`, `stories`, `news`, `brands`, `hero-slides` et `ai-knowledge`.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/:resource` | Liste paginée avec recherche, tri et filtres autorisés |
| `GET` | `/:resource/:id` | Détail avec relations |
| `POST` | `/:resource` | Création validée et journalisée |
| `PUT` | `/:resource/:id` | Mise à jour partielle validée et journalisée |
| `DELETE` | `/:resource/:id` | Archivage logique et journalisé |

Les mutations demandent `content:write`, sauf `ai-knowledge` qui demande `settings:write`. Les timestamps doivent être des dates-heures ISO 8601 réelles; les intervalles départ/arrivée, début/fin et publication/expiration sont contrôlés, y compris lors d’une mise à jour partielle.

### Commandes, clients et paiements

| Méthode | Route | Permission | Description |
|---|---|---|---|
| `GET` | `/orders` | `commerce:read` | Commandes paginées, recherchables et filtrables |
| `GET` | `/orders/:id` | `commerce:read` | Commande, client, lignes, snapshot, paiement, livraison et historique |
| `PUT` | `/orders/:id/status` | `orders:write` | Nouveau statut et historique atomique |
| `PUT` | `/orders/:id/payment` | `payments:write` | Confirmation/échec/remboursement/annulation manuelle |
| `PUT` | `/orders/:id/delivery` | `orders:write` | Transporteur, suivi, état et dates de livraison |
| `GET` | `/customers` | `commerce:read` | Clients persistants et agrégats de commandes |
| `GET` | `/customers/:id` | `commerce:read` | Détail client et commandes associées |
| `GET` | `/reports/orders.csv` | `commerce:read` | Export CSV des commandes |

### Tarification et paramètres

| Méthode | Route | Permission | Description |
|---|---|---|---|
| `GET` | `/pricing` | `commerce:read` | Version et règles tarifaires courantes |
| `PUT` | `/pricing` | `pricing:write` | Mise à jour versionnée et repricing transactionnel des produits gérés |
| `POST` | `/pricing/preview` | `commerce:read` | Prévisualisation par le moteur centralisé |
| `GET` | `/settings` | `content:read` | Paramètres GENERAL, COMMERCE, DELIVERY et PAYMENT |
| `PUT` | `/settings/:id` | `settings:write` | Mise à jour typée et validée |

### Utilisateurs, audit et médias

| Méthode | Route | Permission | Description |
|---|---|---|---|
| `GET` | `/users` | `users:write` | Comptes Admin sans hash de mot de passe |
| `POST` | `/users` | `users:write` | Création d’un compte et attribution d’un rôle |
| `PUT` | `/users/:id` | `users:write` | Nom, rôle, activation ou mot de passe |
| `GET` | `/audit-logs` | `audit:read` | Journal paginé avec acteur, cible, ancien et nouveau contenu |
| `POST` | `/uploads` | `content:write` | Image PNG/JPEG/WEBP/GIF en data URL JSON, 4 Mo maximum, stockée dans `data/uploads` |

## Fichiers créés

- `src/services/pricing.ts` : règles, versions, snapshots et calculs centralisés.
- `src/admin/permissions.ts` : rôles et permissions.
- `src/admin/auth.ts` : mots de passe, sessions, cookies, CSRF et gardes.
- `src/admin/routes.ts` : API Admin complète.
- `src/public/routes.ts` : API CMS publique et contexte Assistant.
- `client/src/admin/api.ts` : client API Admin et gestion CSRF.
- `client/src/admin/components.tsx` : DataTable, Modal, Form, ImageUploader, StatusBadge, DatePicker, ConfirmDialog, Pagination, Search et Filters.
- `client/src/admin/AdminApp.tsx` : shell Admin et toutes les pages métier.
- `client/src/admin/admin.css` : design responsive desktop/mobile.
- `client/src/components/PublicCmsSections.tsx` : navigation CMS en libellés texte sous le Hero et pages plein écran dédiées; contenu backend, états vides et countdowns basés sur l’heure serveur.
- `client/public/media/` : médias locaux stables pour le Hero et les marques.

## Fichiers principaux modifiés

- `src/db/database.ts` : migrations, 23 tables, seeds, requêtes et checkout atomique.
- `src/api/routes.ts` : panier et checkout connectés au moteur tarifaire et à la configuration.
- `src/server.ts` : montage des routeurs, CORS allowlist, sécurité et chemin SQLite configurable.
- `client/src/main.tsx` : routage public/Admin.
- `client/src/App.tsx` et `client/src/types.ts` : composition CMS et modèles de totaux.
- `client/src/components/HeroSlider.tsx`, `PartnerBrandsSlider.tsx`, `ProductDrawer.tsx`, `CartDrawer.tsx`, `CheckoutModal.tsx`, `Footer.tsx` et `assistant/AiAssistantDrawer.tsx` : intégrations backend publiques.
- `client/index.html` : métadonnées et ressources locales compatibles CSP.
- `tests/ayrovi.test.ts` : tests d’intégration et de sécurité.
- `.env.example` et `README.md` : configuration et exploitation.
- `public/` : build de production généré, incluant les médias CMS.

## Invariants métier

1. Le backend est la seule source de vérité tarifaire.
2. Chaque commande conserve exactement le snapshot et les montants utilisés au checkout.
3. Une quantité applique les frais fixes au calcul centralisé prévu, sans formule concurrente dans le frontend.
4. Les countdowns publics utilisent les dates Admin et `serverTime`, jamais une valeur codée en dur.
5. Les moyens de paiement et gouvernorats non configurés sont refusés au checkout.
6. Les suppressions CMS sont des archivages logiques et ne cassent pas les commandes historiques.
7. Les faits commerciaux critiques de l’Assistant proviennent du backend.
8. Aucun secret ni clé privée n’est inclus dans le bundle frontend.
