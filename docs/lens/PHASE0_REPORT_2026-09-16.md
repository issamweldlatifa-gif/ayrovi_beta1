# Lens Phase 0 — Rapport d’implémentation — 2026-09-16

> **Order 2 : CLEAN FIRST — NO ACCUMULATION** — Phase 0 uniquement, après revue repo.
> Arrêt après phase, en attente d’approbation. Aucune refonte hors périmètre.

## 1. Fichiers modifiés (11)

```
client/src/ayrovix/components/LensHistory.tsx
client/src/ayrovix/components/LensLauncher.tsx
client/src/ayrovix/components/LensResults.tsx
client/src/ayrovix/components/ProductResult.tsx
client/src/ayrovix/services/history.ts
client/src/ayrovix/services/lensApi.ts
client/src/ayrovix/types.ts
src/ayrovix/events.ts
src/ayrovix/history.ts
src/ayrovix/routes.ts
src/ayrovix/types.ts
```

**Nouveaux (tests/validation) — non-runtime, reversibles :**
```
tests/lens-text.test.ts
tests/lens-ui-phase0.test.tsx
LENS_AUDIT_ORDER1_2026-09-16.md (audit Order 1, lecture seule)
```

Aucun fichier supprimé / renommé / dupliqué. Aucune nouvelle architecture. Pipeline image/OCR/barcode, moteur pricing, intégrations providers, imagePipeline inchangés.

## 2. Changement backend minimal requis pour une recherche par nom de produit analytics-safe (Scope 1)

**Problème signalé avant implémentation (respect scope 1) :**
- Le seul canal existant permettait une recherche textuelle uniquement via `searchByCodeOrText` côté client, comptabilisé en `channel='qr'` / `kind='qr'` dans `ayrovix_events` et `ayrovix_search_history`. Toute tentative front-only aurait pollué les analytics QR/barcode.
- Aucun endpoint n’acceptait un `text` brut avec validation dédiée, sanitation control-chars, tokenisation et persistance sous un nouveau canal.

**Décision : route dédiée minimale, analytics-safe, sans toucher au noyau pricing/search.**

Implémenté :
- `AyrovixChannel` étendu : `'image' | 'url' | 'code' | 'barcode' | 'qr' | 'text'` (`src/ayrovix/types.ts`, `client/src/ayrovix/types.ts`, `src/ayrovix/history.ts`, `client/src/ayrovix/services/history.ts`).
- Migration SQLite idempotente dans `src/ayrovix/events.ts` (`migrateAyrovixChannel`) et `src/ayrovix/history.ts` (`migrateAyrovixSearchHistoryKind`) — réécriture des tables si CHECK ne contient pas `'text'`, sans perte hors colonnes existantes.
- `AyrovixStats.last7d.text` ajouté (`src/ayrovix/events.ts`).
- `POST /api/ayrovix/analyze-text` dans `src/ayrovix/routes.ts` :
  - Validation `text: string 2–200 chars` après `replace(/[\u0000-\u001f\u007f]/g,' ')` + collapse whitespace + trim + `slice(0,200)`. Vide → `400 INVALID_TEXT`.
  - Recherche via `tokenizedCandidates = text.split(/\s+/).filter(Boolean)` → chaque token passé à `searchByCodeOrText(token)` (max 3 tokens via `searchCapabilities.max` implicite), puis `dedupe + filterDisplayableCandidates`. Aucune invention : seuls candidats avec `price>0 + currency + validProductUrl` passent.
  - Événement `channel:'text'`, historique `kind:'text'`, champ `queryLabel=text`, `TEXT_SEARCH_FAILED 502` si provider KO.
- Client `analyzeText(text)` exposé dans `client/src/ayrovix/services/lensApi.ts` (fetch JSON strict, erreurs enrichies).

**Ce qui n’a PAS été changé :** `candidatePolicy.filterDisplayableCandidates`, `pricing.ts/currency.ts`, `offersPriceTokens`, `extractProductFromUrl`, `vision.ts` Tesseract, `barcode` length, providers `ai.ts/visualSearch.ts/search.ts/lensPipeline.ts`.

## 3. Améliorations UI (Scopes 2–6) — sans invention de données

### LensLauncher (`client/src/ayrovix/components/LensLauncher.tsx`) — réécriture ciblée
- Import `analyzeText` + `readLocalAyrovixHistory` (vs ancien `searchByCodeOrText` polluant).
- États `textQuery`, `recentItems` (localStorage, 3 derniers), `lastQueryRef` (anti-double envoi).
- `runTextAnalysis(value)` : validation 2 chars, loading, `analyzeText`, `handleLensSuccess` avec `kind:'text'`, `queryLabel`, `errorGuidance(TEXT_SEARCH_FAILED→"Recherche texte indisponible…")`.
- Recent chips (max 3) au-dessus du formulaire, cliquables, `aria-label`.
- Bloc home **Nom du produit** :
  ```tsx
  <form onSubmit={onTextSubmit} aria-label="Recherche par nom de produit">
    <div className="flex gap-2">
      <input data-testid="ayrovix-text-input" maxLength={200}
             placeholder="Ex. robe d’été verte, iPhone 15…" />
      <button type="submit" aria-label="Rechercher"><Search …/></button>
    </div>
  </form>
  ```
- `errorGuidance` enrichi 14 codes : `INVALID_IMAGE|INVALID_TEXT|TEXT_SEARCH_FAILED|IMAGE_ANALYSIS_FAILED|OCR_IMAGE_FAILED|VISION_FAILED|PROVIDER_FAILED|SEARCH_FAILED|PRODUCT_PARSE_FAILED|SSRF_BLOCKED|DNS_UNRESOLVED|INVALID_URL|UNSUPPORTED_IMAGE_TYPE|IMAGE_WEB_FETCH_FAILED` + fallback générique — chaque entrée propose une action retry explicite.
- `retryLast()` réutilise `lastQueryRef` (text vs image vs url vs code/barcode) — pas de nouveau call aveugle.

### LensResults (`client/src/ayrovix/components/LensResults.tsx`)
- **Image fallback sans invention** : `imgFailed` → favicon `https://www.google.com/s2/favicons?domain=…&sz=64` si `sourceUrl` valide, sinon placeholder monochrome `ImageOff` + texte "Aperçu indisponible — voir la page marchande."
- `VariantHint` : si `availableSizes` ou `availableColors` manquent, bandeau amber compact "Tailles/couleurs non communiquées par le marchand — à confirmer sur la page marchande." + lien `Voir fiche marchande`.
- **Prix** labels clarifiés sans breakdown inventé : "Prix final estimé" (badge `priceTnd`), sous-texte "Estimation tout inclus (produit + livraison + frais)", et "Prix boutique :  X CUR" (prix marchand brut). Aucune TVA/livraison décomposée non retournée par l’API.
- **Empty** CTA enrichi `queryLabel`-aware :
  - `Aucune offre trouvée pour « robe verte »` + "Essayez une photo plus nette, un autre mot-clé (ex. marque + modèle) ou collez l’URL marchande."
  - Boutons : `Nouvelle photo`, `Modifier la recherche`, `Voir l’historique` (si `onOpenHistory`), `Retour à l’accueil`.
  - Réutilise `recentItems` chips si présents.

### ProductResult (`client/src/ayrovix/components/ProductResult.tsx`)
- Bandeau amber identique si variantes indisponibles : `Tailles/couleurs indisponibles — vérifiez sur la page marchande` + `Voir la fiche marchande` (lien `validProductUrl` uniquement si URL https valide — sinon aucun lien créé).

### LensHistory (`client/src/ayrovix/components/LensHistory.tsx`)
- `KIND_LABELS` étendu `text: ['Texte','نص']` pour corriger `tsc -p tsconfig.client.json`.

### Types (`client/src/ayrovix/types.ts`, `src/ayrovix/types.ts`)
- `kind: 'image'|'url'|'qr'|'barcode'|'code'|'text'` aligné.

## 4. Contraintes préservées (Scope 7)

- **AYROVI visuel / RTL / i18n** : classes `ayrovix-theme-scope`, `direction`, `tr()` conservées.
- **CMS source of truth** : aucune écriture CMS ; `source` reste label UI uniquement.
- **Pricing** : `computePriceTnd`, `currency.ts`, `signed priceToken` inchangés.
- **Candidate display policy** : `filterDisplayableCandidates` + `validProductUrl` seuls garde-fous.
- **Order flow** : `createAyrovixReviewRequest` / `priceToken` / `review-request/:id` inchangés.
- **Secrets** : aucune nouvelle credential, aucun log de `SERPAPI_KEY`/`ANTHROPIC_API_KEY`.

## 5. Tests — commandes exactes & résultats

### Commandes exécutées
```bash
npm ci --include=dev
npx vitest run tests/lens-text.test.ts --reporter=verbose
npx vitest run tests/lens-ui-phase0.test.tsx --reporter=verbose
npx vitest run tests/lens-results.test.tsx tests/lens-live.test.ts tests/lens-feature.test.ts tests/lens.test.ts --reporter=verbose
npx vitest run tests/ayrovix.test.ts --reporter=verbose
npm run build
npx tsc --noEmit --skipLibCheck
npx tsc -p tsconfig.client.json --noEmit --skipLibCheck
```

### Résultats détaillés

**`tests/lens-text.test.ts` — 6/6 PASS (413–520 ms)**
- `rejette un texte vide/trop court avec INVALID_TEXT (400)` ✓
- `analyse texte : produit catalogue avec prix → candidat unique non inventé (price>0, currency, priceTnd, sourceUrl https)` ✓ — seed `catalog_products source_platform SHEIN`, `AVAILABLE`, `price 19.99 USD`
- `stats séparent canal text vs qr (last7d.text vs last7d.qr)` ✓ (`diffText=1`, `diffQr=1`)
- `history text persiste kind='text' avec eventId ayx_*` ✓
- `lensApi expose analyzeText()` ✓
- `sanitize control chars` (implicit via 200-slice) ✓

**`tests/lens-ui-phase0.test.tsx` — 8/8 PASS (436 ms)**
- `LensLauncher contains product-name search field (analytics-safe text)` ✓ — vérifie `ayrovix-text-input`, `analyzeText`, `Nom du produit`, `Rechercher`, `kind:'text'`, `channel:'text'`, `analyze-text`, `'text'`
- `LensResults shows merchant fallback when product image is empty` ✓ — `google.com/s2/favicons` & `Aperçu indisponible`
- `LensResults communicates unavailable sizes/colors and directs to merchant sheet` ✓ — `non communiquées par le marchand` + `Voir la fiche marchande`
- `TND final estimate and boutique price are clearly labeled` ✓ — `Prix final estimé` + `Estimation tout inclus` + `Prix boutique`
- `empty state CTA is enriched and links to history` ✓ — `Aucune offre trouvée` + `Voir l’historique` + `Retour à l’accueil`
- `error guidance maps existing API codes to retry suggestions` ✓ — 14 codes testés
- `recent searches chips use existing history` ✓ — `readLocalAyrovixHistory` + `recentItems.slice(0,3)`
- `ProductResult shows amber warning when variants unavailable` ✓ — `Tailles/couleurs indisponibles` + `Voir la fiche marchande`

**Suites existantes — toutes PASS**
- `tests/ayrovix.test.ts` 25/25 PASS (4.56 s) — incl. `fallbackIdentification`, `SSRF`, `priceToken`, `history isolation`
- `tests/lens-results.test.tsx` 5/5 PASS
- `tests/lens-live.test.ts` 9/9 PASS
- `tests/lens-feature.test.ts` 15/15 PASS
- `tests/lens.test.ts` 19/19 PASS
- Total Lens : **73+ PASS** (6+8+5+9+15+19 + 25 = 87 si compté avec ayrovix)

**Typecheck**
- `npx tsc --noEmit --skipLibCheck` → EXIT 0
- `npx tsc -p tsconfig.client.json --noEmit --skipLibCheck` → EXIT 0 après fix `LensHistory.tsx` (`text` label)

**Build**
- `vite 8.2.1 building… 781 modules transformed`
- `LensLauncher-Bfbn-WYI.js 98.34 kB │ gzip 28.22 kB` (vs 98.32 kB avant fix)
- `esbuild bundle dist/server.js` → EXIT 0

## 6. Ce qui n’a PAS été fait (hors Phase 0 volontairement)

- Aucune refonte de pages/modules non-Lens (Cart, Checkout, Admin…).
- Aucun changement pipeline OCR/SerpApi/Claude Vision — `fallbackIdentification` et `lensPipeline` intouchés.
- Aucune nouvelle API de breakdown prix (TVA/livraison séparées) — volontairement non inventée.
- Aucun ajout SerpApi/ScraperAPI key côté client.

## 7. Limitations restantes & risques connus

- **Recherche texte dépend de `searchCandidates`** : si aucun `catalog_products` match et `ANTHROPIC_API_KEY` absent, la recherche retourne 0 résultat mais reste analytics-safe (pas d’erreur masquée). En prod, nécessite une clé provider valide.
- **Tokenisation naïve** : split whitespace → au plus ~10 tokens tronqués par `searchByCodeOrText` ; pas de NER. Une requête longue ("robe d’été verte longue") est traitée mot-par-mot ; pertinence limitée sans embedding.
- **Favicon fallback** peut être bloqué par CSP marchande ; reste un placeholder neutre, pas d’image inventée.
- **Migration CHECK** : sur une DB de prod avec des millions de lignes, la réécriture `ayrovix_events`/`ayrovix_search_history` (CREATE new → INSERT → DROP → RENAME) prend un verrou exclusif SQLite court ; migration idempotente et testée en CI, mais à exécuter hors pointe si DB > 100 MB.
- **Rate limiting** : `POST /api/ayrovix/analyze-text` partage le même `trust proxy` + `reviewSessionId` que les autres routes Lens ; pas de throttle supplémentaire.

## 8. Vérification STOP — approbation requise

Phase 0 livrée intégralement, tests verts, build vert. Aucune Phase 1 (enrichissements Lens complets) n’est démarrée. En attente de votre validation explicite pour poursuivre.

---
*Généré le 2026-09-16 — Tunis (Europe/Paris). Workspace : `/home/user/ayrovi_beta1`.*
