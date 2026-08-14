# AYROVI — Audit Lens / Vision & Intelligence Layer (2026-08-14)

## 1. Trace complet (avant → après)

```
Customer → Image Upload (multipart, 6 Mo, MIME + magic-bytes) → normalizeUploadedImage (sharp : rotate/resize, original conservé)
→ Chat (SSE) → détection d'intention (image jointe ⇒ lens_search forcé, round 1)
→ Lens pipeline : Vision Claude (schema structuré) ‖ OCR Tesseract (entière + enhanced + segments) ‖ ZXing  SerpApi Google Lens
→ OCR price classifier (rôles : sale/original/shipping/total, remise, devise) → fusion + confiance + warnings
→ Calculator (calculate_price réutilise lensResult.pricing sans re-saisie) → réponse chat + cartes + actions suggérées
```

## 2. Ce qui marchait déjà

- Upload + normalisation sécurisées ; QR/barcode ZXing ; Google Lens (SerpApi) avec cache.
- Vision Claude structurée (identification + prix visible) ; tool calling déterministe ; règles anti-hallucination.
- Signed price tokens ; assistant feedback ; tickets support ; audit logs.

## 3. Points de défaillance constatés

| # | Problème | Correction |
|---|----------|-----------|
| 1 | OCR (tesseract) existait mais **n'était pas câblé** dans le chat/Lens | `runLensPipeline` l'intègre comme deuxième opinion |
| 2 | Un seul prix (`detected_price`) — pas de sale/original/shipping/total/discount | Schema Vision étendu + classifier OCR `analyzeOcrText` |
| 3 | Pas de gestion petit texte / captures longues | `imagePrep.ts` : enhance (normalize/contrast/sharpen/upscale) + segmentation ≤3 |
| 4 | Pas de système de confiance normé | Règles §14 : HIGH ≥0.90 / MEDIUM 0.70–0.89 / LOW <0.70 + warnings |
| 5 | Pas de second avis | Accord Vision↔OCR monte la confiance ; désaccord → warning + tie-break segments |
| 6 | Pas de cache d'analyse | `lens_analysis_cache` (hash SHA-256, TTL 24 h) |
| 7 | Chat redemandait le prix après Lens | Instruction tool + règle prompt 16 : calculate_price réutilise lensResult.pricing |
| 8 | Pas de Test Lab / dataset d'erreurs / découverte | `/admin → Lens Test Lab` + `AI Discovery` + `lens_evaluations` + `ai_learning_events` |
| 9 | Pas d'apprentissage observé | Événements CHAT_TURN/FEEDBACK/CORRECTION/HUMAN_INTERVENTION/ORDER_CONVERSION/TOOL_FAILURE/LENS_RESULT ; corrections clients classées (taxonomie) |

## 4. Architecture (abstraction provider)

```
AYROVI Chat → assistant tools (lens_search) → lensPipeline (orchestration)
   → Vision Provider (Claude) | OCR Provider (Tesseract) | Codes (ZXing) | Visual (SerpApi)
   → résultat standard LensStandardResult (image_id, products, pricing, seller, url, confidence, verified, warnings)
```
Changer de modèle Vision = toucher `ai.ts` uniquement ; le chat consomme le schema standard.

## 5. Sécurité & apprentissage

- Aucune conversation brute exposée : agrégats anonymisés (hash salé côté serveur), pas de cross-client.
- Aucun prompt/modèle modifié automatiquement : le Discovery dashboard alimente l'évaluation humaine (Admin).
- Clés AI uniquement côté serveur (jamais `VITE_*`).

## 6. Regression tests

`tests/lens.test.ts` : 19 tests couvrant les 10 scénarios obligatoires (prix unique, sale+original, produit+livraison, multi-produits, petit prix, devises, total≠produit, remise, % sans promo, rien à lire) + fusion confiance + taxonomie des erreurs. À exécuter après tout changement de prompt/modèle/OCR (`npm test`).
