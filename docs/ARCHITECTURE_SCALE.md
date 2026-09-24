# Socle d'échelle AYROVI — architecture des ajouts (24/09/2026)

Ce document décrit les cinq couches ajoutées pour la **stabilité, la sécurité, la vitesse, la fiabilité et la transparence** du pipeline produit. Tout est **gratuit à l'exécution** (aucun API payant requis) et **dégrade silencieusement** : chaque couche absente laisse le comportement historique intact.

```
                ┌──────────────────────────────────────────────────────────┐
                │                    ARRIVÉE PRODUIT                        │
                │  (Lens photo · lien · QR · code-barres · recherche texte) │
                └───────────────────────────┬──────────────────────────────┘
                                            │
                     ┌──────────────────────▼───────────────────────┐
                     │   PROFILS PRODUITS (SQLite product_profiles)  │
                     │   URL hashé → fiche complète en cache 6 h     │
                     │   1er crawl paie, tous les suivants instant.  │
                     └──────────────────────┬───────────────────────┘
                                            │ images marchand (URLs)
                     ┌──────────────────────▼───────────────────────┐
                     │   CHAUFFE (warmIsolation, fond de tâche)      │
                     │   isolé + WebP prêts AVANT le 1er visiteur    │
                     └──────────────────────┬───────────────────────┘
                                            │
              ┌─────────────────────────────▼──────────────────────────────┐
              │                ISOLATION À 3 COUCHES                        │
              │  1. chroma-key CONNECTÉ (fonds uniformes, anti-fantôme)     │
              │  2. segmentation u2netp LOCALE (fonds complexes) [option]   │
              │  3. original intact (multiply) — jamais d'image cassée      │
              └─────────────────────────────┬──────────────────────────────┘
                                            │
                     ┌──────────────────────▼───────────────────────┐
                     │   DIFFUSION                                   │
                     │  /media/isolated (PNG transparent)            │
                     │  /media/img?w=… (WebP redimensionné, cache)   │
                     │  chaîne client : isolé → proxy → original     │
                     └───────────────────────────────────────────────┘

  VEILLE PRIX (à côté) : price_watchers + scheduler horaire → notification
  client sur baisse RÉELLE relue chez le marchand ; mort après 8 échecs.

  TRANSPARENCE : GET /api/admin/lens-performance → p50/p95 vivantes
  (backend, SerpAPI, rendu client, chargement images, taux de cache).
```

## 1. Profils produits (`product_profiles`)
- Table SQLite (hash URL unique, payload JSON complet, compteur d'images, fanion description ≥ 40 caractères, date de collecte).
- TTL 6 h côté service (`extractProductFromUrl`) ; ligne réécrite à chaque crawl réussi.
- Bénéfice direct : **description complète + toutes les photos + disponibilité** servis à TOUS les visiteurs dès qu'un scan a réussi — y compris l'enrichissement automatique depuis la grille Lens.

## 2. Segmentation locale (`src/services/segmentation.ts`)
- Modèle **u2netp** (saliency, 4,6 Mo) **commis dans le dépôt** `assets/models/u2netp.onnx`, empreinte SHA-256 épinglée dans le code — toute divergence désactive la couche.
- Runtime **onnxruntime-web (WASM)** : aucun binaire natif (fonctionne sur Render Starter), `numThreads=1`, chargement paresseux une fois par processus.
- Post-traitement **pur et testé** : normalisation, seuil/feather, suppression des petits îlots (composantes connexes), garde de couverture 3–97 %, alpha toujours multiplié (jamais opacifié).
- Déclencheur : uniquement quand la couche heuristique renvoie « fond complexe » ; `AYROVI_SEGMENTATION=false` coupe tout.

## 3. Proxy images (`/api/public/media/img`)
- Largeurs autorisées : 156, 320, 480, 760, 1000 (400 sinon) — WebP qualité 78, `rotate()` EXIF, cache disque par (URL, largeur) dans `AYROVI_PROXY_CACHE_DIR`.
- But : finir le hotlink fragile, diviser les octets, servir depuis notre domaine avec un cache long.
- La chaîne côté client (`withIsolation`) devient : **isolé → proxy → original** — trois filets, jamais d'image cassée.

## 4. Chauffe (`warmIsolation`)
- Appelée dans `/api/ayrovix` à l'arrivée des candidats (image + URL : 8 URLs) et dans `/analyze-url` (galerie produit + alternates : 10 URLs).
- Fire-and-forget, erreurs avalées — le premier visiteur trouve l'isolé et le WebP **déjà en cache disque**.

## 5. Veille prix (`price_watchers`)
- API compte requis : `POST /watch`, `GET /watch`, `DELETE /watch/:id`.
- Scheduler (même gabarit que FX) : tick horaire, watcher relu au mieux toutes les 6 h (`AYROVI_PRICE_WATCH_INTERVAL_MS`), 8 watchers max par tick.
- Notification **uniquement sur baisse réellement relue** (jamais d'estimation) ; `failure_count ≥ 8` → statut `DEAD` + notification « Produit introuvable ».

## 6. Transparence (`/api/admin/lens-performance`)
- Agrégats sur l'échantillon vivant (500 dernières traces, en mémoire) : p50/p95 du backend, de SerpAPI, du rendu client, du chargement images, taux de hits du cache pipeline.
- Aucune donnée personnelle — c'est la continuation de `lensPerformanceTrace`.

## Sécurité — rappels structurants
- Le proxy et l'isolation réutilisent `isPublicHttpUrl`/`fetchRemoteImage` (garde SSRF, taille max, timeout) — **aucune nouvelle surface réseau ouverte**.
- Les deux nouvelles tables sont **additives** (CREATE TABLE IF NOT EXISTS, contraintes CHECK, index) dans le bloc DDL idempotent existant.
- Limites assumées : les marchands qui **bloquent le scraping** (ex. Zalando) nécessitent un fournisseur de rendu (`SCRAPERAPI_KEY`, `SCRAPINGBEE_API_KEY` ou `BRIGHTDATA_*` déjà supportés) pour servir le profil complet — sans clé, le repli SerpAPI s'affiche honnêtement.

## Reste recommandé (hors périmètre de ce lot)
- **Protection de branche GitHub** (`main` : CI verte obligatoire + 1 review) — 2 minutes dans Settings → Branches ; l'API a besoin d'un token admin dédié.
- Rate limiting des points de crawl — **volontairement différé** par le propriétaire (phase de tests).
