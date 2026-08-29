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
   - `FACEBOOK_APP_ID` et `FACEBOOK_APP_SECRET` : identifiants de l’application AYROVI dans Meta Developers.
   - `FACEBOOK_CALLBACK_URL` : exactement `https://VOTRE-DOMAINE/api/customer/auth/facebook/callback`.
   - `CUSTOMER_OTP_PROVIDER` : `webhook` pour le fournisseur SMS tunisien.
   - `CUSTOMER_OTP_WEBHOOK_URL` et `CUSTOMER_OTP_WEBHOOK_TOKEN` : endpoint HTTPS et secret de l’adaptateur SMS.
   - `ANTHROPIC_API_KEY` : clé serveur Claude pour l’identification, le prix visible et le fallback Web.
   - `SERPAPI_KEY` : clé serveur SerpApi pour les correspondances produit Google Lens.
   - `GROQ_API_KEY` : clé serveur Groq pour la transcription vocale de l’Assistant (STT).
   - `GEMINI_API_KEY` : clé serveur Gemini pour restituer les réponses en voix (TTS). Sans elle, le navigateur tente sa voix système locale.
   - Conservez `GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview`; le serveur convertit le PCM 24 kHz renvoyé par Gemini en WAV avant lecture.
5. Lancez le déploiement.

Les identifiants Google/Meta, les secrets OAuth et le jeton SMS restent exclusivement dans les variables Render. Ils ne doivent jamais être préfixés par `VITE_` ni ajoutés au code frontend.

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

Par défaut, la copie vérifiée par `PRAGMA quick_check` est écrite dans `data/backups` et les copies locales de plus de 14 jours sont supprimées. `BACKUP_INTERVAL_HOURS=24` active l’exécution quotidienne dans le processus Render afin que la tâche accède au même disque persistant.

Le script sait maintenant envoyer directement la copie vers AWS S3, Cloudflare R2 ou Backblaze B2 via l’API S3 signée côté serveur. Configurez :

- `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`.
- `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`.
- `BACKUP_S3_PREFIX` (par défaut `ayrovi/sqlite`).
- Après un premier test réussi, `BACKUP_REQUIRE_EXTERNAL=true` afin qu’un échec d’upload fasse échouer et signaler le job.

Une copie locale seule ne protège pas contre la perte du disque. Activez une politique Lifecycle/Retention sur le bucket externe et testez une restauration au moins une fois par mois.

## Connexion client : Google, Facebook et SMS OTP

Dans Google Cloud, créez un client **Application Web**, ajoutez le domaine AYROVI aux origines autorisées et recopiez `GOOGLE_CALLBACK_URL` comme URI de redirection autorisée, caractère pour caractère.

Dans Meta Developers, créez l’application AYROVI avec le cas d’usage **Authentication and account creation / Facebook Login**, puis ajoutez exactement `FACEBOOK_CALLBACK_URL` aux **Valid OAuth Redirect URIs**. Le flux utilise Graph API `v26.0`, les permissions minimales `public_profile,email`, un état anti-CSRF lié au navigateur, une validation serveur du jeton et l’identifiant Facebook app-scoped. Le jeton utilisateur n’est pas stocké. Avant de passer l’application Meta en Live, publiez les pages `/privacy.html` et `/data-deletion.html`, complétez l’identité juridique et rendez l’adresse de contact opérationnelle.

### Fournisseur SMS tunisien

1. Demandez une API OTP et un test à Orange Tunisie Messaging Pro et TunisieSMS.
2. Vérifiez la livraison vers Orange, Ooredoo et Tunisie Telecom, le Sender ID et les Delivery Reports.
3. Configurez un adaptateur HTTPS qui reçoit la requête AYROVI et appelle le fournisseur retenu.
4. Dans Render, gardez `CUSTOMER_OTP_PROVIDER=webhook`, puis saisissez `CUSTOMER_OTP_WEBHOOK_URL` et `CUSTOMER_OTP_WEBHOOK_TOKEN`.
5. Redéployez et vérifiez que `/api/customer/auth/config` renvoie `phoneOtp.enabled=true`.

L’adaptateur Twilio Verify reste dans le code uniquement pour compatibilité éventuelle; il n’est plus le choix par défaut pour la Tunisie. En développement seulement, `console` affiche et renvoie le code de test; ce mode est interdit en production.

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
