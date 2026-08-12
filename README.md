# AYROVI — Shopping international et Admin CMS

AYROVI est une plateforme Express, React et SQLite de shopping international en dinars tunisiens. Le site public, Lens, le panier, le checkout, l’Assistant et l’espace Admin utilisent le même backend et la même base de données.

## Fonctions principales

- Site public responsive avec Hero administrable, marques partenaires et une navigation textuelle simple sous le Hero pour Arrivages, Promotions, Stories et Actualités.
- Chaque libellé CMS ouvre une page plein écran dédiée avec l’en-tête AYROVI, une fermeture explicite et uniquement le contenu backend de la catégorie choisie.
- Lens pour extraire un prix depuis une image ou un lien, avec prévisualisation tarifaire calculée côté serveur.
- Connexion client séparée de l’Admin par SMS OTP ou Google, avec activation immédiate après vérification.
- Espace « Mon compte » complet : profil, adresses, historique détaillé, favoris, panier sauvegardé et notifications.
- Panier et checkout authentifié pour les 24 gouvernorats tunisiens, avec téléphone vérifié, COD, D17 et Flouci selon la configuration active.
- Rattachement sécurisé des anciennes commandes après vérification du numéro correspondant.
- Moteur tarifaire centralisé EUR, USD, GBP, JPY et TND incluant douane, transport, service et supplément Express.
- Snapshot tarifaire immuable enregistré avec chaque commande.
- OMS persistant pour clients, commandes, articles, paiements, livraisons et historique des statuts.
- Admin CMS complet avec authentification, sessions HttpOnly, protection CSRF, RBAC et journal d’audit.
- Base de connaissances administrable pour l’Assistant, sans faits commerciaux inventés dans le frontend.

## Installation locale

```bash
npm install
cp .env.example .env
npm run build
npm start
```

L’application utilise `http://localhost:3000` par défaut. L’Admin est disponible sur `/admin`.

En développement, si `ADMIN_PASSWORD` n’est pas défini, un compte local `admin@ayrovi.tn` est créé avec le mot de passe de démonstration `AyroviBeta2026!`. En production, `ADMIN_EMAIL` et un `ADMIN_PASSWORD` unique d’au moins 12 caractères doivent être définis.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

La suite automatisée couvre notamment l’authentification, CSRF, RBAC, le CMS, l’OMS, les snapshots tarifaires, les paiements configurés, les 24 gouvernorats, les quantités, les dates, le CORS et les API publiques.

## Configuration

Consultez [`.env.example`](./.env.example). Les origines CORS externes sont une liste séparée par des virgules dans `CORS_ORIGINS`; aucune origine externe n’est autorisée par défaut. Les requêtes same-origin restent disponibles.

Les tarifs, moyens de paiement, gouvernorats et délais affichés publiquement proviennent de SQLite et se gèrent dans l’Admin. Ils ne doivent pas être dupliqués dans le frontend.

## Architecture

- `src/db/database.ts` : schéma SQLite, migrations, seeds et transactions.
- `src/services/pricing.ts` : source tarifaire centralisée.
- `src/api/routes.ts` : Lens, panier et checkout.
- `src/public/routes.ts` : contenu CMS et configuration publique assainie.
- `src/customer/` : sessions client, CSRF, OTP adaptable, Google OAuth et API du compte.
- `src/admin/` : authentification, permissions et API Admin, isolées de l’authentification client.
- `client/src/admin/` : interface Admin responsive.
- `client/src/components/` : site public, Lens, panier, checkout et Assistant.
- `tests/ayrovi.test.ts` : tests d’intégration backend.

La description complète des fichiers, rôles, données et routes se trouve dans [`ADMIN_CMS.md`](./ADMIN_CMS.md).

## Déploiement

Le projet inclut un Blueprint `render.yaml` prêt pour Render avec Node.js, healthcheck, plan Starter et disque persistant partagé par SQLite et les médias Admin. Consultez [`RENDER_DEPLOY.md`](./RENDER_DEPLOY.md) pour la procédure complète.

Variables de base obligatoires en production : `NODE_ENV=production`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATABASE_PATH`, `CUSTOMER_AUTH_SECRET` et `PUBLIC_BASE_URL`. Google nécessite `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `GOOGLE_CALLBACK_URL`; l’OTP SMS nécessite les trois variables `CUSTOMER_OTP_*` décrites dans [`RENDER_DEPLOY.md`](./RENDER_DEPLOY.md). Aucun secret ne doit être exposé au frontend.

Pour un autre hébergeur Node.js :

- Build : `npm ci --include=dev && npm run build`
- Start : `npm start`
- Stockage : montez un volume persistant sur le dossier `data` afin de conserver SQLite et `data/uploads`
