# Déployer AYROVI sur Render

Cette archive contient la plateforme complète : site public, interface Admin, backend Express, schéma SQLite, migrations, données initiales et build de production.

## Déploiement recommandé

1. Créez un dépôt privé avec le contenu de l’archive.
2. Dans Render, choisissez **New > Blueprint** et sélectionnez ce dépôt.
3. Render détecte `render.yaml` et crée le service `ayrovi` en région Frankfurt.
4. Saisissez les variables demandées par le Blueprint :
   - `ADMIN_EMAIL` : l’adresse du premier Super Admin.
   - `ADMIN_PASSWORD` : un mot de passe unique d’au moins 12 caractères.
   - `CUSTOMER_AUTH_SECRET` : un secret aléatoire d’au moins 32 octets (`openssl rand -hex 32`).
   - `PUBLIC_BASE_URL` : l’URL HTTPS publique finale, sans barre oblique terminale.
   - `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` : identifiants OAuth Web créés dans Google Cloud.
   - `GOOGLE_CALLBACK_URL` : exactement `https://VOTRE-DOMAINE/api/customer/auth/google/callback`.
   - `CUSTOMER_OTP_PROVIDER` : `webhook` en production.
   - `CUSTOMER_OTP_WEBHOOK_URL` et `CUSTOMER_OTP_WEBHOOK_TOKEN` : URL HTTPS et jeton Bearer de l’adaptateur SMS.
   - `ANTHROPIC_API_KEY` : clé serveur Claude pour l’identification Vision et la recherche Web officielle AYROVIX.
5. Lancez le déploiement.

Les identifiants Google, le secret client et le jeton SMS restent exclusivement dans les variables Render. Ils ne doivent jamais être préfixés par `VITE_` ni ajoutés au code frontend.

Le build exécute `npm ci --include=dev && npm run build`, puis le service démarre avec `npm start`. L’option `--include=dev` est nécessaire pendant le build Render afin d’installer Vite, TypeScript et les autres outils de compilation, même lorsque `NODE_ENV=production`. Le Blueprint fixe Node.js 22. L’extraction de liens utilise un fetch HTML borné et sécurisé (JSON-LD/Open Graph), sans navigateur Chromium. Lens utilise exclusivement Claude Haiku pour Vision et Claude Web Search pour la découverte externe, avec une recherche maximum par requête et aucun moteur de recherche de repli.

## SQLite et fichiers persistants

Le Blueprint utilise le plan Render **Starter**, car SQLite et les médias Admin doivent être conservés sur un disque persistant. Le disque `ayrovi-data` est monté sur :

```text
/opt/render/project/src/data
```

La base est créée automatiquement ici :

```text
/opt/render/project/src/data/qatafo.sqlite
```

Les uploads Admin sont conservés dans le sous-dossier `data/uploads`. Le schéma, les migrations et les données initiales sont appliqués automatiquement au premier démarrage.

Ne passez pas au plan Free sans migrer SQLite vers un stockage persistant externe : un redémarrage pourrait alors supprimer les données.

## Connexion client : Google et SMS OTP

Dans Google Cloud, créez un client **Application Web**, ajoutez le domaine AYROVI aux origines autorisées et recopiez `GOOGLE_CALLBACK_URL` comme URI de redirection autorisée, caractère pour caractère.

L’envoi SMS est volontairement indépendant du fournisseur. AYROVI appelle `CUSTOMER_OTP_WEBHOOK_URL` en `POST` avec `Authorization: Bearer <CUSTOMER_OTP_WEBHOOK_TOKEN>` et ce JSON :

```json
{
  "to": "+21698123456",
  "code": "123456",
  "message": "Votre code AYROVI est 123456. Il expire dans 5 minutes.",
  "purpose": "customer_login"
}
```

L’adaptateur doit répondre avec un statut HTTP `2xx`. Il pourra ensuite traduire cette requête vers Twilio, Vonage ou un fournisseur tunisien sans modifier AYROVI. En développement seulement, l’absence de configuration active le fournisseur `console`; il affiche et renvoie le code de test. Ce mode est désactivé en production.

Le cookie client `ayrovi_customer_session` est séparé du cookie Admin. La confirmation de commande exige une session client active, un jeton CSRF valide et un téléphone vérifié.

## Vérification après déploiement

- Site public : `https://VOTRE-SERVICE.onrender.com/`
- Admin : `https://VOTRE-SERVICE.onrender.com/admin`
- Santé : `https://VOTRE-SERVICE.onrender.com/api/health`

La route de santé doit répondre avec `"status":"ok"`. Connectez-vous ensuite à `/admin` avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

## Domaine personnalisé

Les appels du site et de l’Admin utilisent le même domaine. Aucun `CORS_ORIGINS` n’est nécessaire dans ce cas. Ajoutez cette variable uniquement si un client externe doit appeler l’API, sous forme d’une liste d’origines HTTPS séparées par des virgules.

## Sécurité

- Ne placez aucun mot de passe, token ou clé API dans les fichiers frontend.
- Activez HTTPS, fourni automatiquement par Render.
- Sauvegardez régulièrement le disque persistant.
- Changez immédiatement tout secret qui aurait été exposé.

Consultez `README.md` pour l’installation générale et `ADMIN_CMS.md` pour les routes, permissions et invariants de données.
