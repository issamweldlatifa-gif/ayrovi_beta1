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
   - `CUSTOMER_OTP_PROVIDER` : `twilio_verify` (déjà fixé par le Blueprint).
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` et `TWILIO_VERIFY_SERVICE_SID` : identifiants serveur Twilio Verify.
   - `ANTHROPIC_API_KEY` : clé serveur Claude pour l’identification, le prix visible et le fallback Web.
   - `SERPAPI_KEY` : clé serveur SerpApi pour les correspondances produit Google Lens.
   - `GROQ_API_KEY` : clé serveur Groq pour la transcription vocale de l’Assistant (optionnel mais recommandé).
5. Lancez le déploiement.

Les identifiants Google, le secret client et le jeton SMS restent exclusivement dans les variables Render. Ils ne doivent jamais être préfixés par `VITE_` ni ajoutés au code frontend.

Le build exécute `npm ci --include=dev && npm run build`, puis le service démarre avec `npm start`. L’option `--include=dev` est nécessaire pendant le build Render afin d’installer Vite, TypeScript et les autres outils de compilation, même lorsque `NODE_ENV=production`. Le Blueprint fixe Node.js 22. L’extraction de liens utilise un fetch HTML borné et sécurisé (JSON-LD/Open Graph), sans navigateur Chromium. Lens utilise Claude Haiku pour la compréhension et le prix visible, SerpApi Google Lens pour les correspondances visuelles avec images, puis Claude Web Search comme fallback texte. Les appels Claude Vision et Google Lens d'une photo sont parallélisés.

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

## Sauvegarde SQLite

Le projet fournit une sauvegarde cohérente via l’API native SQLite de `better-sqlite3` :

```bash
npm run backup
```

Par défaut, la copie vérifiée par `PRAGMA quick_check` est écrite dans `data/backups` et les copies locales de plus de 14 jours sont supprimées. Variables optionnelles : `BACKUP_DIR` et `BACKUP_RETENTION_DAYS`.

**Important :** une copie sur le même disque Render ne protège pas contre la perte du disque. Planifiez une tâche quotidienne qui exécute ce script puis transfère la copie vers un stockage externe chiffré (S3/R2/B2). Testez une restauration au moins une fois par mois.

## Connexion client : Google et SMS OTP

Dans Google Cloud, créez un client **Application Web**, ajoutez le domaine AYROVI aux origines autorisées et recopiez `GOOGLE_CALLBACK_URL` comme URI de redirection autorisée, caractère pour caractère.

### Twilio Verify

1. Dans Twilio Console, créez un **Verify Service** et laissez le code à 6 chiffres.
2. Vérifiez que l’envoi SMS vers la Tunisie est autorisé par les réglages Geo permissions du compte.
3. Dans Render, configurez `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` et le SID du service `TWILIO_VERIFY_SERVICE_SID` (préfixe `VA`).
4. Conservez `CUSTOMER_OTP_PROVIDER=twilio_verify`.
5. Redéployez puis vérifiez que `/api/customer/auth/config` renvoie `phoneOtp.enabled=true`.

AYROVI demande alors à Twilio d’envoyer le code et vérifie le code directement via Twilio Verify. Aucun code OTP ni secret Twilio n’est exposé au navigateur. Les limites AYROVI par téléphone/IP et la limite de cinq tentatives restent actives en plus des protections Twilio.

L’ancien adaptateur HTTPS reste disponible en alternative : définissez `CUSTOMER_OTP_PROVIDER=webhook`, `CUSTOMER_OTP_WEBHOOK_URL` et `CUSTOMER_OTP_WEBHOOK_TOKEN`. En développement seulement, `console` affiche et renvoie le code de test; ce mode est interdit en production.

Le cookie client `ayrovi_customer_session` est séparé du cookie Admin. La confirmation de commande exige une session client active, un jeton CSRF valide et un numéro tunisien de livraison valide à 8 chiffres. La vérification SMS du téléphone du profil est optionnelle; elle sert à la connexion OTP et au rattachement sécurisé des anciennes commandes.

## Vérification après déploiement

- Site public : `https://VOTRE-SERVICE.onrender.com/`
- Admin : `https://VOTRE-SERVICE.onrender.com/admin`
- Liveness : `https://VOTRE-SERVICE.onrender.com/api/health`
- Readiness (utilisé par Render) : `https://VOTRE-SERVICE.onrender.com/api/ready`

La route de liveness doit répondre avec `"status":"ok"`; la readiness vérifie en plus que SQLite est lisible et expose uniquement l’état configuré/non configuré des capacités externes. Connectez-vous ensuite à `/admin` avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

## Domaine personnalisé

Les appels du site et de l’Admin utilisent le même domaine. Aucun `CORS_ORIGINS` n’est nécessaire dans ce cas. Ajoutez cette variable uniquement si un client externe doit appeler l’API, sous forme d’une liste d’origines HTTPS séparées par des virgules.

## Sécurité

- Ne placez aucun mot de passe, token ou clé API dans les fichiers frontend.
- Activez HTTPS, fourni automatiquement par Render.
- Sauvegardez régulièrement le disque persistant.
- Changez immédiatement tout secret qui aurait été exposé.

Consultez `README.md` pour l’installation générale et `ADMIN_CMS.md` pour les routes, permissions et invariants de données.
