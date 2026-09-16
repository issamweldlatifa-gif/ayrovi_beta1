# AYROVI LENS — AUDIT ORDER 1 — 2026-09-16
### CLEAN FIRST — NO ACCUMULATION | Audit only, no file modifications

**Repository:** `issamweldlatifa-gif/ayrovi_beta1` @ `aaac4f2` (main)  
**Date:** 2026-09-16 (Europe/Paris) — audited against live workspace `/home/user/ayrovi_beta1`  
**Scope:** Lens UI, search inputs (image, product name, URL, barcode), search flow, SerpApi integration, backend endpoints, product data mapping, pricing display in TND, product images, variants/sizes/colors, loading/error/empty states, current tests.  
**Rule:** No assumptions — every claim inspected in code. No modifications made.

---

## 1. Current Lens Architecture & File Paths

### 1.1 Overview
Lens is **not a single component** but a vertical slice across 3 layers:

```
Client (React)  →  Express API  →  AI Core / SerpApi / Scraper / SQLite
LensLauncher    →  /api/ayrovix/* →  Vision, Visual Search, Web Search, OCR, Calculator
```

* **AI Core is the sole gateway for AI.** No frontend ever sees `ANTHROPIC_API_KEY`, `SERPAPI_KEY`, `OPENAI_*`. All provider wire details are isolated behind `src/ai-core/` (adapters: `AnthropicAdapter.ts`, `OpenAIResponsesAdapter.ts`). Confirmed: `client/src` contains zero `VITE_*` AI keys, zero direct `fetch` to Anthropic/SerpApi.
* **Two parallel Lens pipelines coexist** — a critical architectural divergence:
  * **Pipeline A (used by `/api/ayrovix/analyze-image`):** `src/ayrovix/routes.ts` → `src/ayrovix/services/ai.ts` (`identifyProduct`) + `src/ayrovix/services/visualSearch.ts` (`serpApiVisualSearch`) in `Promise.allSettled`. **No OCR, no imagePrep, no ZXing, no `lensPipeline.ts`.** 
  * **Pipeline B (used by chat/assistant & direct `runLensPipeline`):** `src/ayrovix/services/lensPipeline.ts` → Vision + OCR (Tesseract, whole + enhanced + 3 segments via `imagePrep.ts`) + ZXing `codeScanner.ts` + SerpApi + `mergeVisionOcr` fusion + `lensCache`. Documented in `docs/LENS_AUDIT_2026-08-14.md` but **not wired to the public `/analyze-image` endpoint**.
* **Pricing is centralized.** `src/services/pricing.ts` (`calculatePrice`, `getExchangeRate`, `classifyCustomsCategory`) reads `pricing_config` table (EUR/USD/GBP/JPY rates, `exchangeBufferPercent`, `freightPerKgTND`, customs categories, `commissionPercent`, etc.). All Lens flows call `calculatePrice` or `estimateTnd` (`src/ayrovix/services/currency.ts`) — **except `SmartLinkScraper` which still uses its own hardcoded `RATES_TO_TND` (EUR=4.00, USD=4.00, GBP=4.80, JPY=0.0265)** — divergence noted in §6 Risks.

### 1.2 Backend Files (Source of Truth)

| Layer | Path | Purpose |
|-------|------|---------|
| **Router** | `src/ayrovix/routes.ts` (481 lines) | 7 endpoints: `POST /analyze-image`, `POST /analyze-url`, `POST /analyze-code`, `POST /analyze-barcode`, `POST /live-events`, `POST /review-request`, `GET /review-request/:id`, `POST /choose`, `GET /history`. Multer 6 MB, JPEG/PNG/WebP only, SSRF-safe, priceToken signing, `candidatePolicy` filtering. |
| **Vision** | `src/ayrovix/services/ai.ts` (364 lines) | Single Anthropic Vision call via `getAyroviAiCore().responses()`. Structured `IDENTIFICATION_SCHEMA` (UNION-FREE for Anthropic limits), sentinel convention ("" / 0 / [] instead of null). Returns `AyrovixIdentification` with `products[]` (up to 8, each `name/brand/category/subcategory/box/color/motif/material/price/currency`), `pricing` block, `detected_price`. Timeout 12s. Fallback `fallbackIdentification`. |
| **Visual Search** | `src/ayrovix/services/visualSearch.ts` (264 lines) | SerpApi Google Lens `engine=google_lens type=products`. Image prep via `sharp` (4 quality steps → ≤500 KB JPEG), upload to `serpapi.com/image` → `image_id` (server-expiring, no public URL), then `search.json`. 10s timeout, country `AYROVIX_LENS_COUNTRY` (default `fr`, hl `fr`). `toCandidates` **filters to priced results only** (`extracted_value` + currency required). Cache 10 min, dedup, inflight coalescing. |
| **Text Search** | `src/ayrovix/services/search.ts` (262 lines) | `catalogSearch`: SQLite `products` (status ACTIVE, 400 rows, scored via `scoreCandidate`, threshold 35, via `estimateTnd` + `filterDisplayableCandidates`). `providerWebSearch`: AI Core `research/fast` with `webSearch: {maxUses:1}` (exactly 1 web search per query), merchant host labeling, 7s timeout. `externalProductSearch`: cached 5 min. `searchCandidates`: if `visualCandidates.length>0` skip web search, else fallback. |
| **URL/Product** | `src/ayrovix/services/product.ts` (175 lines) | `extractProductFromUrl`: SSRF via `SmartLinkScraper.cleanPastedUrl` + `resolveSafeHttpUrl`, then `scraper.scrapeProduct`. Returns `AyrovixProduct` + alternates. Fallback path builds `fallbackProduct` from URL pathname + runs `catalogSearch` + `externalProductSearch`. |
| **Scraper** | `src/scraper/scraper.ts` (400+ lines), `productPageParser.ts`, `renderedPageFetcher.ts` | HTTP fetch + optional rendered fetch (`ScraperAPI`/`ScrapingBee`/`BrightData` via `AYROVIX_RENDER_PROVIDER`). JSON-LD → meta → regex price parser. Hardcoded `RATES_TO_TND` divergence. |
| **Pipeline B (chat)** | `src/ayrovix/services/lensPipeline.ts` (223 lines) | `runLensPipeline` orchestrates Vision + SerpApi + `scanCodeFromImage` + OCR (`ocrRecognize` whole/enhanced/segments) + `mergeVisionOcr` → `LensStandardResult` (image_id, products, pricing, seller, url, confidence, verified, warnings, cache_hit). SHA256 cache 24h per `executionLane`. |
| **OCR** | `src/services/vision.ts` (299 lines, `VisualProductExtractor` + `Tesseract`), `src/ayrovix/services/ocrPrices.ts`, `src/ayrovix/services/imagePrep.ts` | Tesseract `eng+fra`, `PSM.SPARSE_TEXT`, queued (max 3 jobs, 7s timeout, worker reciclable). `analyzeOcrText` classifies sale/original/shipping/total/discount with context keywords. `prepareImageForAnalysis` enhances (normalize/contrast/sharpen/upscale 1.8× for small segments). **Not used in Pipeline A.** |
| **Currency** | `src/ayrovix/services/currency.ts`, `src/services/pricing.ts` | `estimateTnd` wraps `calculatePrice` (total "tout inclus": convertedPrice + freight + CIF + duty + TVA + RPD + commission + localDelivery). `exchangeBufferPercent`, weight, customsCategory aware. |
| **Policy** | `src/ayrovix/services/candidatePolicy.ts` (57 lines) | `isDisplayableCandidate` requires `price>0 && currency && hasValidProductUrl(sourceUrl)`. `withDisplayRating` maps `match/20` → 1–5 if no merchant rating. `filterDisplayableCandidates` dedup by `sourceUrl|title`, sort by `match`, slice limit 8. |
| **Types** | `src/ayrovix/types.ts` (147 lines) | `AyrovixIdentification`, `AyrovixCandidate` (id/kind/title/brand/model/colors/sizes/source/sourceUrl/image/images/price/currency/priceTnd/priceToken/verificationStatus/rating/match), `AyrovixProduct` (plus variantOptions, availability, verificationProvider/Method/FailureCode), `AyrovixDetectedPrice`, `AyrovixDetectedProductItem` (with `box:[x,y,w,h]` 0..1). |
| **Cache/History** | `src/ayrovix/services/lensCache.ts`, `src/ayrovix/history.ts`, `src/ayrovix/priceQuote.ts` | `lens_analysis_cache` (hash SHA256, model, lane), `ayrovix_history` (accountId or guest), `createAyrovixPriceToken` (HMAC, binds price+currency+title+URL+status). |
| **Server** | `src/server.ts` | Mounts `createAyrovixRouter(db, scraper)` at `/api/ayrovix`. Also `/api/public/lens-hero` (CMS hero) and commerce-config. |
| **DB** | `src/db/database.ts` | SQLite `data/qatafo.sqlite` (migrations include `lens_feature_media_v1`, `stories_*`). `getPricingRules()` reads single source `pricing_config`. |

### 1.3 Frontend Files

| Component | Path | Purpose |
|-----------|------|---------|
| **Orchestrator** | `client/src/ayrovix/components/LensLauncher.tsx` (764 lines) | State machine `Stage = 'live'\|'home'\|'preview'\|'analyzing'\|'candidates'\|'product'\|'barcode'\|'error'`. Integrates with `useNavigationHistory` (stack-based modal), `useBodyScrollLock`, `getCommerceConfig` (LIVE flag). Handles all 4 analyze flows, `choose` tracking, order payload with `priceToken` verification, history `rememberAyrovixHistory`. ~50% of Lens UX. |
| **Camera** | `client/src/ayrovix/components/LensCamera.tsx` (49 lines) | `<input capture="environment" accept="image/*">` → `onImage(File)`. Primary + fallback guaranteed. |
| **Upload** | `client/src/ayrovix/components/LensUpload.tsx` (44 lines) | `<input accept="image/*">` (gallery, no `capture`). Same `onImage`. |
| **Live** | `client/src/ayrovix/components/LiveCamera.tsx`, `LiveScanner`, `localDetector`, `liveVisionRuntime` | Feature-flagged (`AYROVIX_LENS_LIVE_ENABLED` via commerce-config). On-device BARCODE/QR via ZXing, object detection via `localDetector` (ImageData → gray → features), `liveVisionRuntime` (IoU tracker, adaptive interval). Only mounted when `stage==='live'` and `navigator.mediaDevices.getUserMedia` available; `onCameraFailed → home`. |
| **Results** | `client/src/ayrovix/components/LensResults.tsx` (214 lines) | Post-analysis screen: summary (image + count + "Détails" chevron), expandable details, `detectedPrice` cart card (Prix repéré → total TND), `best` hero card (Match badge, rating, TND + original), `others` list (chips), empty dashed state, trust footer, "Nouvelle recherche". Filters via `isDisplayableCandidate`, sorted by match. |
| **Product** | `client/src/ayrovix/components/ProductResult.tsx` (274 lines) | Gallery (active image + thumbnails, preload, referrer no-referrer), availability badge, TND hero, priceVerified vs pending manual (`verificationReason` for 7 codes), description, plus order form: manualUrl (required, validated via `validProductUrl`), quantity stepper (1–99), color input + size select (+ Autre custom), detected `sizes`/`colors` datalist, customerNote textarea, depositPercent from commerce-config, CTA "Commander · X%". |
| **Candidates** | `client/src/ayrovix/components/ProductCandidates.tsx` | Reused for `alternates` under product view. |
| **History/Nav** | `client/src/ayrovix/components/LensHistory.tsx`, `LensNavigation.tsx` | `LensContextHeader` (mode camera/result/product), `LensMoreMenu` (dark toggle, history). History scoped by `historyScope` (accountId/guest). |
| **API** | `client/src/ayrovix/services/lensApi.ts` (100 lines) | `analyzeImage(file)` (FormData → POST), `analyzeUrl(url, channel)`, `analyzeCode(value)`, `analyzeBarcode(code)`, `requestManualReview`, `getManualReview`, `markChosen(eventId)` (keepalive). `AyrovixApiError` (code/status). |
| **Policy** | `client/src/ayrovix/services/resultPolicy.ts` (35 lines) | `validProductUrl` (PRIVATE_HOST check), `displayRating`, `isDisplayableCandidate/Product` (price>0 && currency && valid URL). |
| **Other** | `client/src/components/LensFeature.tsx` (144 lines) | **Editorial block, not search UI.** Home hero: `GET /api/public/lens-hero` (eyebrow/title/description/ctaLabel/ctaUrl/media {type VIDEO|IMAGE, videoUrl/videoPath/poster/ratio/autoplay/muted/loop}). Handles YouTube/Vimeo embed rewrite, file video, image. No text hardcoded. Purely CMS-driven. |
| **App shell** | `client/src/App.tsx`, `BottomNavBar.tsx`, `components/ProductDrawer.tsx`, `ayrovix-theme.css` | Lens opened via `onOpenLens` from BottomNav/cart; theme via `ayrovix-theme.css` + `design/tokens.css`. RTL via `useLocale`. |

### 1.4 Docs & Verification

* `docs/AYROVIX_LENS_V2_VISION.md` (94 lines) — active architecture spec (Vision single request, SerpApi products mode, link SSRF, TND calc).
* `docs/LENS_AUDIT_2026-08-14.md` (51 lines) — prior audit (pipeline B), 10 pricing scenarios, trust rules.
* `docs/AYROVIX_FIX_GUIDE.md`, `AYROVIX_LENS_V2_VISION.md`, etc. — supplementary.
* `verify/lens*.mjs`, `verify/zalando-audit.mjs` — Playwright visual audits.

---

## 2. Existing Search Methods & Real Implementation Status

| # | Search Method (as per Order) | UI Entry Point(s) — Real | Backend Endpoint — Real | Implementation Status | Works Today? |
|---|---|---|---|---|---|
| 1 | **Image (photo/screenshot)** | `LensCamera` (capture=environment) + `LensUpload` (gallery) + drag&drop zone `.lens-drop` + `LiveCamera` auto-capture. All in `LensLauncher:home` stage. Preview shown in `preview` stage before analysis. | `POST /api/ayrovix/analyze-image` (multipart 6 MB, JPEG/PNG/WebP, `normalizeUploadedImage` via `sharp`) → `identifyProduct` + `serpApiVisualSearch` parallel (see §1.1 divergence). | **Fully implemented.** Parallel Vision + Visual search with isolated failure (`Promise.allSettled`). Vision failure + zero visual → 503/422. Vision failure + visual hits → `fallbackIdentification` + visual candidates continue (line 195 `vision failed — continuing`). Price TND computed via `calculatePrice` only if `detected_price.confidence>=0.65 && label product_price/cart_total`. | **Yes, if at least one provider configured.** Tested: happy path, 503 when no keys, continuation when Claude 500 but Lens has 1 match (`tests/ayrovix.test.ts: analyze-image continue with Google Lens`). Needs `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` **or** `SERPAPI_KEY` (either is enough to avoid 503, though quality degrades). |
| 2 | **Product name (free text)** | **Missing in Lens.** No `<input type="search">` for product name in `LensLauncher`. Exists only indirectly: (a) Assistant chat `lens_search` tool (text → same `providerWebSearch`+`catalogSearch`), (b) `analyze-code`/`analyze-barcode` repurpose text, (c) internal `buildSearchQuery` derives query from Vision. | Backend-ready: `catalogSearch` + `providerWebSearch` + `scoreCandidate` + `searchCandidates` all accept arbitrary query string. `externalProductSearch` cached, `filterDisplayableCandidates`. No dedicated `POST /search-by-name` endpoint; text search is only reachable via `analyze-code`, `analyze-barcode`, `analyze-url` (fallback query from URL pathname) and `assistant` tool. | **Backend 100%, UI 0%.** To add product-name search, no new backend needed — add UI input that calls existing `analyzeCode` or new thin wrapper over `externalProductSearch`. Currently a user cannot type "Nike Air Max 270" inside Lens; they must use Assistant or paste a URL. | **Partially — backend works, but Lens UI does not expose it.** This is a gap vs. spec "product name" search. |
| 3 | **URL (product link)** | Form `ayrovix-url` in Lens home (`placeholder https://…`, submit → `runUrlAnalysis`). Also reuse when user chooses a candidate (`candidate.sourceUrl` → re-`analyzeUrl` for verification). QR URL also routed here (`channel='qr'`). | `POST /api/ayrovix/analyze-url` → `extractProductFromUrl` → SSRF-safe `scraper.scrapeProduct` (direct HTML + rendered fallback). If scrape yields title, runs `catalogSearch`+`externalProductSearch` for `alternates`. If fails, fallback catalog + web search (line 338 fallback product). Returns `{product, alternates, eventId, fallback?}`. | **Fully implemented.** SSRF `isUnsafeHostname`, `PRIVATE_HOST` block, DNS-checked `resolveSafeHttpUrl`, size/redir limits. Handles SHEIN (`-p-123.html`, `goods_id`), Amazon (ASIN), Temu (`goods-…`). | **Yes, with or without AI keys.** Direct metadata extraction works without keys; alternates need catalog or provider search (needs `AYROVIX_AI_WEB_SEARCH=true` + provider configured to enrich alternates, but product itself returns). Tests pass for blocked localhost, non-resolvable domain, fallback creation. |
| 4 | **Barcode (EAN/UPC/Code128 + QR text)** | `LiveCamera` local decode: ZXing via `@zxing/library` (`liveScanner.ts`, `localDetector.ts`, `liveVisionRuntime.ts`). Decoded `value` → `runCodeTextAnalysis` (QR text) or `runBarcodeAnalysis` (digits). Also manual: history repeat (`barcode`/`code` kind). | `POST /api/ayrovix/analyze-code` (value 2–200 chars trimmed) + `POST /api/ayrovix/analyze-barcode` (digits 6–14). Both → `searchByCodeOrText` → `catalogSearch(4)` + `externalProductSearch(8)` → `mergeCandidates(8)`. No barcode DB (no OpenFoodFacts, no EAN resolver), no inventory `barcode` lookup. | **Implemented, but shallow.** Decoding is local (no server key needed). Search is generic text search over the barcode string, not a product-attribute lookup. `catalogSearch` tokenizes barcode as query — will only match if product `name` contains those digits. No `inventory.stock` barcode index used. Rating/pagination same as text search. | **Technically works, but low precision.** Tests pass for validation (empty, bad format) and that barcode reuses catalog+web search. In production, a barcode `4005900001234` rarely matches catalog unless product was seeded with that code in its name. No dedicated barcode resolution — considered incomplete vs. spec "variants/sizes/colors" expectation. |

**Additional note: `analyze-code` vs `analyze-barcode` duplication.** Both delegate to same `searchByCodeOrText` with same limits; the only difference is validation regex (`2–200 chars` vs `^\d{6,14}$`) and history `kind`. No functional difference beyond validation.

---

## 3. Current Product Result Structure & UI Limitations

### 3.1 Data Structures (Inspected in `src/ayrovix/types.ts` + `candidatePolicy`)

**`AyrovixCandidate` (search result / offer chip)**
```
id, kind: 'catalog'|'external',
title (≤180), brand|null, model|null,
colors:[], sizes:[]               // ← always [] for external/visual/web
source: "Collection AYROVI"|"Google Lens"|merchantLabel,
sourceUrl: string (public https, no creds, no private IP),
image: string, images?: string[2]  // SerpApi: thumbnail+image; web: '' ; catalog: single
price: number|null, currency: string|null,  // source currency, never invented
priceTnd: number|null,            // total "tout inclus" via estimateTnd (freight+customs+commission)
priceToken: string|null, priceVerificationStatus: 'VERIFIED'|'PENDING_MANUAL',
rating: number|null 0..5, ratingCount|null, ratingKind: 'merchant'|'match',
match: number 0..99                // deterministic scoreCandidate
```
`isDisplayableCandidate` **gate**: `price>0 && currency && validProductUrl` — **unpriced web results are dropped** (`filterDisplayableCandidates`). This policy is applied server-side (8 limit) and again client-side.

**`AyrovixProduct` (chosen/cart-ready)**
Same as Candidate plus `description`, `variantOptions?: AyrovixVariantOption[]` (from scraper `details`), `availability`, `verificationProvider/method/failureCode`, `exchangeRate`, `ratingKind`.

**`AyrovixDetectedPrice` (visible-price hint from image)**
```
sourcePrice, sourceCurrency, convertedPriceTND, serviceFeeTND,
estimatedShippingTND, totalPriceTND,
title, brand, isCartScreenshot, imageUrl
```
Returned only if `usablePrice = confidence>=0.65 && amount>0 && currency && label in {product_price, cart_total}`. Not authoritative — requires merchant link verification before order.

**`AyrovixIdentification`**
`input_kind, category, brand, model, color[], visible_text[], possible_model_codes[], description, confidence, detected_price, pricing{ sale/original/shipping/total/currency/discount}, products[] (8 max, each with box:[x,y,w,h] 0..1), url, seller`.

### 3.2 Pricing Display in TND — Current vs. Spec

* **Spec:** Every price must show TND final (tout inclus) alongside original currency. Use single calculator.
* **Reality:**
  * `LensResults` `priceLine(c) = { tnd: priceTnd?.toFixed(2)+' DT' || '—', original: price==null ? source : price+' '+currency+' chez '+source }`. Shows both for `best` (19px black) and `others` (15px). `detectedPrice` card shows `totalPriceTND?.toFixed(2)+' DT'` as hero.
  * `ProductResult` gallery shows `selectedPriceTnd` (28px) + `Prix boutique X CUR` subtitle. All derived from `estimateTnd` → `calculatePrice` (rules versioned). Correct: centralized.
  * **Location:** `routes.ts:203` calculates TND for `identification.products[]` via `db.getPricingRules()`. `search.ts:232` re-estimates TND for external candidates. `product.ts:59` uses `estimateWithDb`. So every path **except scraper fallback** uses pricing_config. **Scraper's hardcoded 4.00 rate remains an inconsistency** — e.g., `SHEIN` goods scraped via `SmartLinkScraper` get `convertedPriceTND = price * 4.00` before `estimateWithDb` adds fees separately; slightly divergent from `getEffectiveExchangeRate` which applies `exchangeBufferPercent`. Not user-visible unless buffer configured.
* **Limitation:** `priceTnd` is an *estimate* (freight per kg + customs per category + commission min). Shown without breakdown tooltip on results list (only ProductResult shows note "Prix vérifiés… Les prix peuvent varier. Vérification manuelle incluse.") — acceptable but breakdown not expandable on results.

### 3.3 Product Images

* Visual Lens candidates: up to 2 URLs (`thumbnail`, `image`) deduplicated. Client `CandidateImage` tries `candidate.images` then `candidate.image` then `detectedPrice.imageUrl||fallbackImage` (preview). `onError → next index`, `object-contain`, `referrerPolicy="no-referrer"` — resilient to hotlink blocking. Logged success: `[AYROVIX serpapi-lens] X visual product matches` includes only priced rows.
* Web-search candidates: `image: ''` (always empty — `providerWebSearch` does not fetch images from webResults). These result in fallback to generic placeholder (`ImageIcon` 30px on `bg-surface`) — **major visual gap for QR/barcode/web-search flows**: products appear without thumbnail.
* Catalog candidates: single `row.image` (from Active products). OK.
* Scraper products: `images[]` from OG/meta/JSON-LD, full gallery supported, with thumbnails strip + preload (`new window.Image()`). Good.
* `LensResults` best card `92×110` + others `80×96` fixed. Empty state uses dashed border, no skeleton loader during analyzing (uses real preview instead — intentional).

### 3.4 Variants / Sizes / Colors

* **Spec expects** selectable variants (e.g., "M, L, 42, Rouge").
* **Reality:**
  * `AyrovixCandidate.colors/sizes`: **always `[]`** in `search.ts` `catalogSearch`, `providerWebSearch`, `visualSearch.toCandidates`. No inference, no enrichment. Confirmed by 3 files.
  * `AyrovixProduct.colors/sizes` + `variantOptions`: populated **only** when `scraper.scrapeProduct` finds them via `productPageParser` (`variants.details[]` with `available===true`). `product.ts:35-45` maps them, adds `priceTnd` per variant.
  * `LensResults` renders `[brand, model].join` or `colors.join('/')` as subtitle — currently almost always empty for Lens image results, so subtitle blank.
  * `ProductResult` offers `color` `<input list>` + `size` `<select>` + `__other__` custom. Shows hint "Options détectées: tailles … couleurs …" only if arrays non-empty. For Lens image candidates that were converted via `candidateToProduct` (line 69), `colors/sizes` remain `[]`, so form shows empty hints and user must type manually. Not a bug — by design "Never infer" — but UX feels incomplete for fashion vertical.
  * **No OpenAI needed to fix UI part**: a nicer empty-state hint ("Tailles selon fiche marchand — à préciser au lien") could be added without API.
* **Box / multi-product:** `identification.products[]` each has `box:[x,y,w,h]` normalized, but `LensResults`/`ProductResult` never renders boxes over the preview. Data exists, not visualized.

### 3.5 UI Limitations Summary (Verified in Code)

1. **No free-text product-name search field in Lens** — only image/drag & link/code. Backend supports it but UI hides it.
2. **Web/QR/barcode results have no images** — placeholder only.
3. **Colors/sizes always empty for ~90% of flows** (all but direct scraped URL) — variant selectors appear empty.
4. **No box overlays** for multi-product detection (data discarded).
5. **Price breakdown not inspectable** from results; only final TND shown.
6. **`detectedPrice` cart card vs. candidates coexistence** — if both present, two CTAs ("Commander avec ce prix" + "Choisir cette offre") can confuse; no guidance which is authoritative (code prefers candidate priceToken for order).
7. **No pagination / infinite scroll** — 8 candidates max, enough but unlabeled.
8. **No share/copy** per candidate (only barcode has copy). No "Report wrong match".
9. **History history isolation**: Lens history is correctly scoped (`historyScope` = customer.id or guest localStorage), but guest history stored in `localStorage` (`rememberAyrovixHistory`) — cleared on private mode, not synced across devices (by design).

---

## 4. What Can Be Improved in the UI Without OpenAI

All below require **zero new credentials** and **no new backend**:

1. **Add product-name search field** — a small `<input type="search" placeholder="Nom du produit — ex. Nike Air Max 270">` + "Rechercher" button in `LensLauncher:home` that calls existing `analyzeCode` (or new `analyzeCode` alias). This closes the spec gap using `externalProductSearch` which already falls back gracefully without provider (returns `[]` or catalog hits). If provider unconfigured, still shows catalog matches with TND — valuable. *File:* `client/src/ayrovix/components/LensLauncher.tsx:home` section (add after URL form, same pattern).
2. **Image placeholders → source favicons + better empty states** — for web/barcode candidates with empty image, show `https://www.google.com/s2/favicons?domain=<hostname>` as fallback thumbnail (already have hostname), plus a 2-line title fallback. No API.
3. **Variant empty-state copywriting** — when `colors.length===0 && sizes.length===0`, replace blank subtitle with `tr('Tailles/couleurs sur la fiche marchand — à préciser au lien', 'المقاسات/الألوان في صفحة المتجر — يحدد عند الرابط')` plus link to `product.sourceUrl`. Same in `ProductResult` datalist hint area. No API.
4. **Render multi-product boxes** — overlay `identification.products[].box` as absolutely positioned `border-2 border-brand` rectangles over the preview image in `LensResults` summary and in `analyzing` frame. Data already present in `AyrovixImageResult.identification`. Pure CSS.
5. **Price breakdown tooltip** — add expandable "Détail" under `priceLine.tnd` using `candidate.priceTnd` vs. `price+currency` already available; show non-sensitive breakdown (`convertedPriceTND`, `shippingFeeTND`, `serviceFeeTND` are not returned today — would need to include `breakdown` in API, alternative is static text "Prix final inclut transport + douane + service" with link to FAQ). Zero API.
6. **Analyzing progress honesty** — replace fake `setInterval +3 steps` (line 136 `+1` every 1400ms) with real signal: show `result.sources.vision/ocr/code` post-fetch as step ticks, or at least label it "Estimation — en attente du service". Current UX pretends to progress through 4 steps regardless of backend. Label change only.
7. **Error details with retry per code** — map `AyrovixApiError.code` (`IMAGE_REQUIRED`, `UNSUPPORTED_IMAGE`, `AYROVIX_UNAVAILABLE`, `IDENTIFICATION_FAILED`, `INVALID_URL`, `EXTRACTION_FAILED`, `INVALID_CODE`, `INVALID_BARCODE`, `CODE_SEARCH_FAILED`, `BARCODE_SEARCH_FAILED`, `LIMIT_FILE_SIZE`) to specific next actions ("Réduisez l'image à 6 Mo", "Essayez un lien direct", "Vérifiez la connexion") instead of generic overlay. Already have `error.code` state.
8. **Trust badge placement** — move `ShieldCheck` trust row from bottom of results to directly under `best` card to reinforce "verified" vs "pending_manual" distinction. CSS only.
9. **Empty-state CTA** — `LensResults` empty dashed card currently suggests "Essayez le lien direct" but button is only "Nouvelle recherche" — add secondary "Coller un lien" that autofocuses URL input on `home` stage (requires `replaceStage('home')` + focus ref). No API.
10. **History affordance** — surface top-3 `LensHistory` items on `home` as chips ("Vos recherches récentes") using `client/src/ayrovix/services/history.ts` (localStorage reads). Already has `AyrovixHistoryItem`. No API.
11. **RTL & monochrome polish** — verified `LensResults` already respects `direction` via `useLocale`; keep orange cap <3% (currently `ay-cta-orange` only). No change needed; confirms Zalando audit `DESIGN_P4_T1_ZALANDO_REPORT.md` compliance.

**All items above are feasible in a single UI-only PR, testable offline (`npm test` without keys).**

---

## 5. What Requires SerpApi or OpenAI Credentials

| Feature | Required Env | What Happens Without It | Where Checked |
|---------|--------------|-------------------------|---------------|
| **Vision identification** (`identifyProduct`) | `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` (via `getAyroviAiCore().responses().isConfigured()`) + `AYROVIX_PROVIDER_TIMEOUT_MS` (8–20s, default 12s) | `ayrovixAiReady() === false`. `GET /analyze-image` **does not fail outright if SerpApi is configured** — continues with `fallbackIdentification(visualCandidates[0].title)` + visual candidates. If both Vision & SerpApi missing → `503 AYROVIX_UNAVAILABLE` (`LENS is not yet activated`). | `src/ayrovix/services/ai.ts:ayrovixAiReady`, `src/ayrovix/routes.ts:167` (`!ayrovixAiReady() && !serpApiVisualReady()`) |
| **Google Lens visual matches** | `SERPAPI_KEY` + `AYROVIX_VISUAL_SEARCH_TIMEOUT_MS` (6–20s, default 10s) | `serpApiVisualReady() === false` → returns `[]`, logs none. `analyze-image` still attempts Vision alone. If Vision succeeds, returns candidates via `catalogSearch`+`externalProductSearch` fallback (no visual images). | `src/ayrovix/services/visualSearch.ts:serpApiVisualReady`, `routes.ts:191` `Promise.allSettled([...visual])` |
| **Web search for alternates / QR / barcode** (`providerWebSearch` / `externalProductSearch`) | `AYROVIX_AI_WEB_SEARCH=true` + AI Core configured (same Anthropic/OpenAI keys) + `AYROVIX_SEARCH_TIMEOUT_MS` (1.5–12s, default 7s) | `externalWebSearchEnabled() === false` → `externalProductSearch` returns `[]`. Catalog still runs. For `analyze-code`/`barcode`, result will be `candidates:[] → barcode stage` ("Aucune offre… Photographiez"). For `analyze-url` fallback, alternates empty. | `src/ayrovix/services/search.ts:externalWebSearchEnabled`, `isAiFeatureEnabled('web-search')` |
| **LIVE multi-product on-device detection quality** | `AYROVIX_LENS_LIVE_ENABLED=true` (exposed via `GET /api/public/commerce-config` `features.ayrovixLensLive`) | Live mode hidden; `LensLauncher` defaults to `home` if `!cameraCapable`; `LiveCamera` not mounted. No degradation beyond feature absent. | `client/src/ayrovix/components/LensLauncher.tsx:getCommerceConfig().then(features.ayrovixLensLive)` |
| **OCR Tesseract** | *None* (plus `AYROVIX_OCR_TIMEOUT_MS` 2–15s, default 7s) | N/A — OCR is local, no key. However Pipeline A does **not** use OCR, so visible-price reading for `detected_price` relies solely on Vision's `detected_price` + `pricing` fields, not on OCR double-read. Pipeline B would add OCR second opinion but is not active for Lens modal. | `src/services/vision.ts`, `src/ayrovix/services/ocrPrices.ts` |
| **Scraper rendered fallback** | `AYROVIX_RENDER_PROVIDER=scraperapi|scrapingbee|brightdata` + respective API key | Falls back to direct `fetchSafeRemote` (no render). Price verification becomes `DIRECT_PRICE_NOT_FOUND` more often → `PENDING_MANUAL` flow (still orderable via deposit). | `src/scraper/scraper.ts`, `src/scraper/renderedPageFetcher.ts` |
| **TND conversion** | *None* beyond DB `pricing_config` | If `pricing_config` missing, `DEFAULT_PRICING` used (see `src/db/database.ts:seed`). No external FX call. |

**Key takeaway:** Lens is *usable* for catalog-only searches without any external key (local products + validation), but image intelligence and priced web alternates are disabled. Minimum for the spec "image → priced offers + TND" is **either** `SERPAPI_KEY` **or** AI Vision key; for best recall you need both. Secrets never touch `client` — verified via `grep -r VITE_`. Never expose in logs: `serpApiVisualSearch` logs only counts, not keys; `AnthropicAdapter` masks keys.

---

## 6. Risks, Dependencies & Phased Implementation Plan

### 6.1 Risks (Inspected)

1. **Pipeline divergence (A vs B).** Production Lens (`routes.ts`) skips OCR fusion & code scanning. Bugs fixed in `lensPipeline.test` (10 scenarios) don't protect `/analyze-image`. Risk: small-print prices, segment crops, cart totals may be mis-read today even though tests pass. *Evidence:* `routes.ts` never imports `ocrPrices`/`imagePrep`/`codeScanner`; `lensPipeline.ts` never called from router.
2. **Pricing rate divergence.** `SmartLinkScraper.RATES_TO_TND` (hardcoded 4.00) vs. `calculatePrice` (exchangeBuffer, customs categories). After an admin updates `pricing_config` (e.g., EUR 3.60), scraper-derived `totalPriceTND` will still use 4.00 until code patched. Audit found scraper TND used as `totalPriceTND` seed when `verificationMethod==='direct'`.
3. **SerpApi merchant image hotlinking.** Google-hosted thumbnails (`googleusercontent.com`) often 403 when rendered with `referrerPolicy=no-referrer` on some browsers. Client retry (`onError → next URL`) helps but both URLs may fail → blank `CandidateImage`. No server proxy/resize for failed images.
4. **Web-search without image is expensive.** `providerWebSearch` is called for *every* QR/barcode/URL fallback even when query is low quality (barcode digits). Costs 1 web search credit per call, cached only 5 min. No rate limiting per IP. Risk: abuse via barcode enumeration.
5. **Barcode search precision.** Current `catalogSearch` tokenization splits digits on `[^a-z0-9]` but barcode `4005900001234` tokenizes as single token `4005900001234` — catalog `LIKE '%4005900001234%'` will miss unless product name literally contains it. Expected behavior is zero results → barcode stage suggests photo. Not catastrophic but underwhelms spec.
6. **`AYROVIX_UNAVAILABLE` vs. silent empty.** When AI + SerpApi both absent, `analyze-image` 503 is correct, but `analyze-code`/`barcode` still returns 200 with `candidates:[]` (barcode stage) — user sees generic "Aucune offre" rather than "Service non configuré". Inconsistent error signaling.
7. **Cache invalidation.** `visualSearch` cache 10 min, `externalSearchCache` 5 min, `lensCache` SHA256 per lane (likely 24h from `lensCache.ts` inspect). Admin pricing changes do not bust visual/web cache — stale `priceTnd` may persist for minutes. Acceptable but note.
8. **No dedicated product-name endpoint = no analytics.** Because text search is funneled through QR/barcode routes, `ayrovix_events.channel='qr'` gets polluted with real product-name queries, skewing analytics.
9. **Variant hallucination guard.** Current code "never infer" — good. But missing variants are not communicated; user may assume product has no variants. Need empty-state copy (see §4).
10. **File upload path.** `normalizeUploadedImage` validates magic bytes + `sharp` re-encode; never writes to `data/uploads`. Good. But `multer.memoryStorage` holds full 6 MB in RAM per concurrent request — no repository-wide concurrency limit observed. Risk under spike.

### 6.2 Dependencies

```
LensLauncher/LiveCamera → navigator.mediaDevices, ZXing (@zxing/library 0.21.3), sharp (server), Tesseract.js (server, Pipeline B only), SerpApi (server), Anthropic/OpenAI (server), better-sqlite3
                          → detection quality degrades gracefully (localDetector returns null if unavailable)
```
All listed deps present in `package.json` and installed.

### 6.3 Phased Implementation Plan (Post-Audit, Approval Required)

**Phase 0 — No-code or UI-only (no credentials, today)**
* Add product-name search field (4.1), image favicon fallback (4.2), variant empty copy (4.3), price tooltip/breakdown label (4.5), error code map (4.7), empty CTA (4.9). Keep ORANGE budget <3% (Zalando spec). Tests: `tests/lens-results.test.tsx`, `tests/lens-feature.test.ts` remain green (verify class names unchanged).

**Phase 1 — Wire Pipeline B to `/analyze-image` (requires decision)**
* Replace `routes.ts:identifyProduct` + `serpApiVisualSearch` two-leg with single call to `runLensPipeline(db, normalized.buffer, mime, {executionLane:'live'})`. Reuse its `LensStandardResult` to derive `identification` + `candidates` + `detectedPrice` (mapping already exists via `mergeVisionOcr`). Enables OCR second opinion, segment handling, multi-product `products[].box`, confidence `warnings`, `verified` flag, and code scanning for images that contain QR. **Cost:** + Tesseract CPU per image (~2–7s), + memory. Gate via env `AYROVIX_ENABLE_OCR_PIPELINE=true` for gradual rollout. No schema change needed — `LensStandardResult` already contains `pricing`/`products`/`visual_matches`.

**Phase 2 — Unify TND calculation**
* Remove `SmartLinkScraper.RATES_TO_TND`; make `scraper.ts` call `estimateTnd(rules,...)` with injected `QatafoDatabase` (or pass `PricingRules` snapshot). Migration: swap `convertedPriceTND = price*rate` with `calculatePrice(rules,price,currency).totalTND`. Keeps one source for buffer/customs.

**Phase 3 — Barcode precision (no new vendor)**
* Add `inventory` barcode index: `products.variants.barcode` already exists conceptually but not queried. Index `products` where `barcode` LIKE code, or add `product_barcodes` table. `searchByCodeOrText` should try `catalogSearchByBarcode(code)` before generic text search. Zero external API. Fallback to web search remains.

**Phase 4 — Image resilience**
* Add server-side image proxy/resize (`GET /api/ayrovix/image?url=…`) with SSRF + cache + `sharp` resize to 400px, served with `Cache-Control: public, max-age=86400`. Use for SerpApi thumbnail that 403s. Keeps client `referrerPolicy` resilient. Cost: bandwidth + tiny disk.

**Phase 5 — Observability (requires credentials)**
* Expose `GET /api/admin/ayrovix/health` (already partially `checkProviderSearchHealth`/`checkSerpApiVisualHealth`) to CMS. Surface counts of `visual_matches`, `pricing.confidence`, `warnings`. Enables AI Discovery dashboard (docs `LENS_AUDIT_2026-08-14` §8) without leaking keys.

Each phase keeps `filterDisplayableCandidates` gate, signed `priceToken`, and `P2_1_CATALOGUE_REPORT` invariants intact.

---

## 7. Tests Currently Passing & Any Failures

**Environment:** `node v20`, `vitest 4.1.10`, `npm ci` installed, DB migrated in-memory per test.

**Lens-specific suites executed 2026-09-16:**

| Suite | Result | Notes |
|-------|--------|-------|
| `tests/lens.test.ts` (19 tests) | **19/19 PASS** | OCR 10 scenarios + Fusion 5 + Learning 4 (see §3.2). Covers `analyzeOcrText`, `mergeVisionOcr`, `detectPriceCorrection` — **Pipeline B only**. Not covering `routes.ts` /analyze-image. |
| `tests/ayrovix.test.ts` (24 tests) | **24/24 PASS** | Real router via `supertest`: `analyze-image` validation, 503 without keys, `buildSearchQuery`, `policy` (priced + link gate, rating always visible), `scoreCandidate`, **SerpApi visual → image+price + skip web search**, `fiche marchand variants`, `image → Claude mock → catalog → event → choose`, `analyze-image continue with Lens if Claude fails` (mock 500 → fallback), visible-price (`cart_total` vs `product_price`), `SSRF` (localhost blocked), `analyze-url` SSRF, `providerSearch deadline`, `review-request` dedup/ownership, `analyze-barcode` validation. Mocked `serpapi.com` + `AnthropicAdapter`. Confirms TND via pricing_config (not hardcoded). |
| `tests/lens-results.test.tsx` (5 tests) | **5/5 PASS** | Verifies `LensResults` composition: summary/best/others/trust/new search, sort by match, TND + original + merchant link, xray line only (no orange dots), not `home` stage. Validates §4 charters. |
| `tests/lens-live.test.ts` (9 tests) | **9/9 PASS** | LIVE flag via `commerce-config`, signature helpers deterministic, `LiveVisionRuntime` adaptive interval, `computeCropRect` clamp, `localDetector` graceful null, multi-product tracker, `grayToFeatures`. |
| `tests/lens-feature.test.ts` (15 tests) | **15/15 PASS** | CMS LENS hero payload (media type/sources/ratio), frontend never hardcodes copy, order LENS before Stories, YouTube/Vimeo rewrite to `youtube-nocookie`/`player.vimeo`, direct file kept, `reject` on unsafe link, Zalando rhythm (gap, title hierarchy, full-bleed, orange arrow only). |
| **Lens total** | **72/72 PASS** | No failures in lens-adjacent tests. |

**Not run in this order (to keep audit time bounded):** full `npm test` (≈ 30 suites, includes `catalogue-foundation`, `back-office-foundation`, `design-zalando`, `homepage-navigation`, `stories-showcase`, `admin-read-gates`). Previous CI (`.github/workflows/ci.yml: npm run typecheck && npm test && npm run build`) expected green; `typecheck` cannot run offline (`tsc` not installed as binary in this snapshot — `npm ci` now installed `typescript` but `typecheck` script invokes `tsc` via `npx` — last direct `npx tsc --noEmit` was not executed in audit). No failures observed in executed subset.

**Coverage gaps:** No e2e Playwright run (`verify/lens*.mjs` skips without preview host). No live SerpApi/Anthropic probe (keys absent — expected, audit did not set `SERPAPI_KEY`/`ANTHROPIC_API_KEY`). Local-only tests use mocked HTTP.

---

### Appendix: Search Method Matrix (One-Line Truth)

```
Image:   UI ✅ + Backend ✅ (Vision‖SerpApi) → 503 only if both keys missing; 422 otherwise; priced gate 8; TND via pricing_config.
Name:    UI ❌ (missing field) + Backend ✅ (catalog+web, cached) → to fix without API, add input → analyzeCode.
URL:     UI ✅ (form) + Backend ✅ (scraper + fallback) → works offline for product, needs web search for alternates.
Barcode: UI ✅ (live decode) + Backend ⚠️ (text search over digits, no barcode index) → high miss rate; feels incomplete but not broken.
```

### Appendix: File Paths Accused of Truth

* `src/ayrovix/routes.ts:167` `POST /analyze-image` handler; `:191` `Promise.allSettled`; `:290` `analyze-url`; `:368` `analyze-code`; `:392` `analyze-barcode`.
* `src/ayrovix/services/ai.ts:identifyProduct`, `buildSearchQuery`, `fallbackIdentification`.
* `src/ayrovix/services/visualSearch.ts:serpApiVisualReady`, `prepareImageForSerpApi`, `toCandidates` (priced filter).
* `src/ayrovix/services/search.ts:catalogSearch`, `providerWebSearch`, `externalProductSearch`, `searchCandidates`.
* `src/ayrovix/services/lensPipeline.ts:runLensPipeline`, `mergeVisionOcr` (not used by routes).
* `src/ayrovix/services/candidatePolicy.ts:isDisplayableCandidate`, `filterDisplayableCandidates`.
* `client/src/ayrovix/components/LensLauncher.tsx` orchestrator; `LensResults.tsx` rendering + empty; `ProductResult.tsx` order form; `lensApi.ts` fetch.
* `src/services/pricing.ts:calculatePrice` vs `src/scraper/scraper.ts:RATES_TO_TND` divergence.
* `src/ai-core/adapters/anthropic/AnthropicAdapter.ts`, `openai/OpenAIResponsesAdapter.ts` (credentials never client).

---

**Deliverable complete. Waiting for ORDER 2 approval before any implementation.**

> Control = Dashboard · CMS = Source of Truth · Frontend = Presentation — preserved throughout.
> Audit preserved: no deletions, renames, refactoring, duplicates, or new architecture introduced.
