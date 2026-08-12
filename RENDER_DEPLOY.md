# Déployer AYROVI sur Render

Cette archive contient la plateforme complète : site public, interface Admin, backend Express, schéma SQLite, migrations, données initiales et build de production.

## Déploiement recommandé

1. Créez un dépôt privé avec le contenu de l’archive.
2. Dans Render, choisissez **New > Blueprint** et sélectionnez ce dépôt.
3. Render détecte `render.yaml` et crée le service `ayrovi` en région Frankfurt.
4. Saisissez les variables secrètes demandées :
   - `ADMIN_EMAIL` : l’adresse du premier Super Admin.
   - `ADMIN_PASSWORD` : un mot de passe unique d’au moins 12 caractères.
5. Lancez le déploiement.

Le build exécute `npm ci && npm run build`, puis le service démarre avec `npm start`. Le Blueprint fixe Node.js 22 et conserve le navigateur Puppeteer dans `node_modules/.cache/puppeteer` afin que l’extraction de liens reste disponible à l’exécution.

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
