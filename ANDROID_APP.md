# AYROVI — Application Android native (Capacitor)

Le site **est** l'app : même code, même UI (Lens inclus), embarquée dans une coque native.
Aucun chemin dupliqué — `isNativeApp()` garde les ponts natifs hors du web.

## Ce qui est déjà en place (dans ce dépôt)

| Élément | Fichier |
|---|---|
| Config Capacitor (appId `app.ayrovi.mobile`, bundle `public/`, back système mappé sur `history.back()` → « retour » dans Lens) | `capacitor.config.ts` |
| Projet Android complet (Gradle, MainActivity, ressources, icônes adaptatives, splash) | `android/` |
| Permissions : `INTERNET` + `CAMERA` (Lens) — caméra `required:false` (l'app reste utilisable sans) | `android/app/src/main/AndroidManifest.xml` |
| Pont natif unique (barre système par surface, lazy-import, no-op sur le web) | `client/src/services/nativeShell.ts` |
| Génération icône + splash depuis le logo | `npm run android:assets` |
| Sync build web → assets APK | `npm run android:sync` |
| Signature release **uniquement** via variables d'env CI + `versionCode` injectable | `android/app/build.gradle` |
| CI : debug APK à chaque push utile, AAB signé si secrets présents | `.github/workflows/android-apk.yml` |
| Contrat testé (config, permissions, pont, gradle) | `tests/android-shell.test.ts` |

## Mode de chargement : coque vivante (décision verrouillée par test)

L'app charge **le site en direct** depuis `https://eta1-1.onrender.com` (page et API même origine →
**aucune config CORS requise**, et chaque push sur main est dans l'app sans rebuild).
Le client appelle l'API en chemins relatifs (`fetch('/api/…', credentials:'same-origin')`) — c'est
pourquoi un bundle local seul afficherait une page vide : ne pas retirer `server.url` sans ajouter
avant un `apiBase` absolu côté client (palier offline éventuel, voir plus bas).

À l'ouverture hors connexion : l'app affiche l'écran de chargement du réseau — comportement voulu pour une beta.

## Build local (Android Studio)

```bash
npm ci
npm run android:sync        # vite build + cap sync android
npx cap open android        # Android Studio → Build > Build APK(s)
```

Test direct sur téléphone : `npm run android:sync && cd android && ./gradlew assembleDebug`
→ installer `android/app/build/outputs/apk/debug/app-debug.apk` (activer « sources inconnues »).

Debug USB complet : Chrome → `chrome://inspect` (WebView `webview/localhost:80`).

## Build via GitHub Actions (sans Android Studio)

1. Push sur `main` → workflow **Android APK/AAB** → artefact `AYROVI-debug.apk`.
2. AAB signé (Play Store) : créer le keystore une fois, puis stocker dans les secrets GitHub :

```bash
keytool -genkeypair -v -keystore ayrovi-release.keystore -alias ayrovi \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 ayrovi-release.keystore   # → secret AYROVI_KEYSTORE_BASE64
```

| Secret GitHub | Valeur |
|---|---|
| `AYROVI_KEYSTORE_BASE64` | base64 du `.keystore` |
| `AYROVI_KEYSTORE_PASSWORD` | mot de passe keystore |
| `AYROVI_KEY_ALIAS` | `ayrovi` |
| `AYROVI_KEY_PASSWORD` | mot de passe clé |

`workflow_dispatch` accepte `versionCode` (incrémenter à chaque upload Play).

## Play Store — checklist

- [ ] Compte développeur Google Play (25 $ une fois)
- [ ] `app.ayrovi.mobile` : si déjà pris, changer `appId` dans `capacitor.config.ts` puis `npx cap sync android`
- [ ] Fiche : captures prises **dans l'app** (le store les vérifie — Lens doit y être filmable, caméra OK)
- [ ] Politique de confidentialité : `https://<domaine>/privacy.html` (existe)
- [ ] Formulaire sécurité des données : « collectées : non » si rien ne sort de l'app → sinon déclarer les flux API
- [ ] Page suppression de compte : `https://<domaine>/data-deletion.html` (existe)
- [ ] AAB release signé via la CI ci-dessus, `targetSdk` 35 (déjà la valeur Capacitor 7)

## Mise à jour de l'app

- Changer l'UI web : `npm run android:sync` commit → CI → `versionCode +1` → AAB.
- Le bundle étant embarqué (pas de `server.url`), le store garde une app **autonome offline** ; l'API reste sur Render.

## Volontairement non fait (prochain palier, si demandé)

- `@capacitor/camera` natif à la place de `getUserMedia` (gagnant qualité photo, mais = deux surfaces Lens → interdit par la règle « une seule voie » tant que la WebView gère `getUserMedia`, ce qu'elle fait avec `CAMERA` accordée).
- Push notifications (`@capacitor/push-notifications` + FCM), partages natifs, facturation Google.
