# AYROVI — LENS + PRODUCT EXPERIENCE — AUDIT & IMPLEMENTATION PLAN
**Date:** 2026-09-18 — **Scope:** Lens flow + Product page — **Environment:** `main` @ `28ef35e`
**Rule:** CLEAN FIRST — NO ACCUMULATION — KEEP CURRENT LENS, FIX FLOW, MAKE PRODUCT FIRST

> This audit was done by reading the actual code only (no guessing). Backend lens performance (Anthropic Vision + SerpApi) is **not** re-audited here — see `AYROVIX_LENS_PERFORMANCE_AUDIT.md` (6 pushes, 730/730). This order is **FLOW + FRONTEND UX + RESPONSIVE CLEANUP** only.

---

## 0. EXECUTIVE SUMMARY — ANSWER BEFORE DETAILS

| Question | Proven answer (file:line) |
|---|---|
| **Does upload navigate away from Lens?** | **No.** `LensLauncher.tsx:360-520` `handleImage → prepareImage → setPreviewUrl+setImageFile → enterStage('preview')` stays inside the same `ayrovix-theme-scope fixed inset-0 z-[75]` dialog. `App.tsx:410-426` keeps `LensLauncher` **mounted** behind commerce layers via `lensSessionActive`. There is **no** `/visual-search-results` route. |
| **Is the current Lens the foundation?** | **Yes.** Authoritative Lens = `LensLauncher` + `InteractiveLensResults` (496 lines) + `LiveCamera` (353 lines). No `LensSearchPage` / `VisualSearchPage` duplicate found (`grep -r visual-search → 0`). |
| **Does image remain visible during search/results?** | **Yes** in `InteractiveLensResults` (image `max-h calc(100%_-_8px) object-contain` with `scale`/`offset` pan) and in `LensLauncher:product` stage (dimmed `previewUrl` behind bottom sheet). But **product stage is not product-first** — it is still Lens canvas + small sheet. |
| **Is Product page product-first?** | **No.** `ProductResult.tsx:135-283` is `space-y-4 → ayrovix-product-gallery overflow-hidden bg-white → stage bg-surface → thumbnails border-t → p-4 → rounded-2xl bg-surface price-morph → rounded-xl border ...` — **3-4 nested cards** before primary action. `App.tsx: product:details` via `ProductDrawer.tsx` is a **second, legacy product implementation** for screenshot/link — duplicate ownership. |
| **Is there duplicate Lens/product code?** | **Yes.** `ProductDrawer.tsx` (659 lines) duplicates Lens upload (file+url) + pricing preview + variant handling. `ProductCandidates.tsx` (67 lines) duplicates `InteractiveLensResults` grid (same `displayRating`, same `isDisplayableCandidate` filter). `LensUpload`/`LensCamera` vs `LiveCamera` overlap for capture. |
| **Is there card-on-card overload?** | **Yes.** `ProductResult` = Card → Card → Card → text (prototype/dahboard look). `ProductCandidates` = `bg-white p-3 border-line` per candidate ×2 rows. `ProductDrawer` = `hostinger-purple-card` ×2 + `bg-surface border rounded-2xl` ×3. |
| **Is text clipped?** | **Yes risk:** `line-clamp-2` on titles, `truncate` on source, `max-w-[78px]` on fallback favicon, `truncate` on sheet header `max-w-[22ch]`, absolute badges `max-w-[45%] truncate`. Narrow desktop (900-1024px) will clip price + rating row. |
| **Do we need backend change?** | **No** for flow. `roi` backend crop already shipped (`fc729b6`). Lens state is client-side `NavigationHistory` + `candidatesView`/`previewUrl` in `LensLauncher` — no backend needed to preserve context. |

**Verdict:** The **flow is already stateful inside Lens** (no forced navigation). What is broken is **product visual hierarchy + card accumulation + duplicate ProductDrawer legacy**. The fix is **refactor existing components, not create a new Lens**.

---

## A — CURRENT LENS ARCHITECTURE (AS PROVEN IN CODE)

### A1. Route / state model — `App.tsx` + `NavigationHistory.tsx`

```
App.tsx
├─ navigation = useNavigationHistory()  // stack: NavigationLayer[]  id="app:*" / "lens:*" / "product:*"
├─ isLensOpen = stack[0]?.id === 'app:lens'
├─ lensSessionActive — keeps <LensLauncher> mounted even when cart/assistant/checkout front it
│   setLensSessionActive(true) on handleOpenLens()
│   only false on handleCloseLens() → closeAppView() — so Back restores intact
└─ {lensSessionActive && <LensLauncher isOpen={isLensOpen} ... />}  // kept mounted behind

NavigationHistory.tsx
├─ HISTORY_KEY = '__ayroviNavigationV1'  // stored in window.history.state
├─ entry = {version:1, depth, stack: NavigationLayer[]}
├─ navigate(stack, {replace}) → writeState(entry, replace)
├─ pushLayer(layer) / replaceTop(layer) / back() / goHome() / rewindAndNavigate()
└─ LensLauncher uses: stageLayer = reverse stack find id startsWith 'lens:'  → stage = 'live'|'home'|'preview'|'analyzing'|'candidates'|'product'|'barcode'|'error'

LensLauncher.tsx
├─ Stage = 'live'|'home'|'preview'|'analyzing'|'candidates'|'product'|'barcode'|'error'
├─ historyOpen = stack.some(l=>l.id==='lens:history')
├─ state: previewUrl (URL.createObjectURL), imageFile, candidatesView {queryLabel,list,eventId,detectedPrice}, urlResult, product, barcode, error, ordering, textQuery, detectedProducts, recentItems
├─ previewRef — URL.revoke on clearRuntime
├─ abortRef + requestAbortRef — AbortController per request, token == abortRef.current
└─ enterStage(next) → navigation.pushLayer({id:`lens:${next}`})  // prefer stateful over route replacement
   replaceStage(next) → replaceTop

Flow proven:
  Lens(LiveCamera|home) → handleImage(file, autoAnalyze=false) → preview stage (image visible)
  → runImageAnalysis(file) → if stage!=='candidates' enterStage('candidates') → candidatesView={list:[], ...} → fetch analyzeImage(file, roi?) → setCandidatesView(list) → stays in 'candidates'
  → handleChooseCandidate(candidate) → candidateToProduct(candidate) → setProduct → enterStage('product')  // stays inside same Lens dialog, not app:product
  → handleClose() → clearRuntime() → onClose() → lensSessionActive=false

Why upload does NOT navigate away:
- There is no router push to /visual-search-results. LensLauncher is a **fixed overlay** (`fixed inset-0 z-[75]`), not a page navigation.
- `App.tsx` already has the anti-loss pattern: `{lensSessionActive && <LensLauncher isOpen={isLensOpen} .../>}`  // mounted even when isOpen false, so navigating to cart does not unmount Lens.
- `NavigationHistory` is pushState-based, not full page reload — `window.history.pushState` with `__ayroviNavigationV1`.

Risk: `stage === 'analyzing'` existed as separate stage that hid preview. Fixed in recent pushes: now `runImageAnalysis` goes directly to `candidates` with `isLoading=true` and shows image + sheet skeleton (Google Lens style). The `if (stage==='analyzing')` block at line ~730 still exists (renders InteractiveLensResults with isLoading). It is **not a separate page**, just a loading variant of the same component — safe but should be consolidated to one branch (candidates with isLoading) to remove duplicate render path.
```

### A2. Zoom / reset — `InteractiveLensResults.tsx`

- **Zoom:** `scale` 1→3 (`setScale(s=>Math.min(3, s+0.3))` / `Math.max(1, s-0.3)`), `transform: translate(offset) scale(scale)`, `transition 0.2s` when not panning, `isPanning` disables transition.
- **Pan when zoomed:** `panStart {x,y,ox,oy}` + `onTouchMove` dx/dy → `setOffset`, `touchAction: none` when `scale>1` else `pan-y`. Mouse `onMouseDown/Move/Up` same.
- **Pinch:** `onTouchStart` 2 touches → `lastDist`, `onTouchMove` 2 touches → `factor = d/lastDist` → scale.
- **Reset:** `resetView() => setScale(1); setOffset({0,0})` called via `[RefreshCw]` button and `clearSelection`.
- **Selection:** `selectedBox {x,y,w,h}` in percent 0..100, `imgBox` from `getBoundingClientRect` diff, `svg viewBox 0 0 100` preserves ratio, `showPulse` animation 0.55s.
- **Tap:** `findBoxForTap(tap%)` 9% expanded hit + smallest area + nearest 28% + 26% fallback, `triggerTapSearch(box)` → `onRoiSearch(box)` (backend sharp, no canvas) else fallback `cropBoxToFile` (canvas 18% pad jpeg 0.85, 80-150ms).
- **Existing implementation MUST be reused** — it is Google Lens level, already ultra-light, no freehand lasso path.

### A3. Image experience — where image lives

- `LensLauncher.previewUrl` — from `prepareImage(file)` (`client/.../imagePrep.ts` 1280/1600 edge, jpeg 0.84, previewUrl = createObjectURL(source)). Not revoked until `clearRuntime` or new image.
- `InteractiveLensResults` receives `previewUrl` + `fallbackImage` (same), renders `imgRef` inside `containerRef` flex-1 black canvas, `pt-2 sm:pt-3`, `max-h calc(100%_-_8px) object-contain`.
- `imgBox` tracked on resize/load/RAF to position selection overlay precisely.
- **Requirement verified:** image does NOT disappear when `setCandidatesView` — `previewUrl` is independent state, render is `flex-col h-[100dvh] → flex-1 image + absolute bottom sheet`, so image stays while browsing.

---

## B — VISUAL SEARCH RESULTS — CURRENT IMPLEMENTATION

### B1. Where results render — `LensLauncher.tsx: candidates`

```tsx
{stage === 'candidates' && candidatesView && (
  <InteractiveLensResults
    view={candidatesView}
    previewUrl={previewUrl}
    fallbackImage={previewUrl}
    onChoose={handleChooseCandidate}
    onReset={reset}
    onCommandDetected={commandDetectedPrice}
    isLoading={isAnalyzing}
    onRoiSearch={handleRoiSearch}  // backend ROI
    onLassoSearch={(file,cropMs)=>void runImageAnalysis(file,cropMs)} // fallback
    detectedProducts={detectedProducts}
  />
)}
```

- `InteractiveLensResults` is **the only results renderer for Lens image** — correct, no separate page.
- Structure: `relative h-[100dvh] flex-col overflow-hidden bg-[#0A0A0A] → containerRef flex-1 (image) + sheetRef absolute bottom-0 (results)`. Sheet heights: `peek 22% / half 45% / full 100%`, `rounded-t-[20px]` when not full, drag handle, `pl-14` left pad (as required).
- Header inside sheet: `Résultats Lens • visible.length` + `query label max-w-[22ch] truncate` + two pills `Agrandir/Réduire` + `Nouvelle recherche` (flat white, orange only single CTA respects `tokens.css:137` / `App.tsx:139 --ayrovi-color-brand-orange = #0A0A0A`).
- Grid: `grid-cols-2 gap-3 auto-rows-fr` 12 items max, each `bg-white p-2.5 rounded-xl border border-line/50 flex flex-col`, `aspect-square overflow-hidden bg-surface` + `MatchBadge`, `line-clamp-2 title 12px`, `colors/sizes 10px`, `source 10px`, `Star rating`, `bg-surface px-2 py-1.5 price block`, `rounded-full bg-ink Voir le produit`.
- **Strengths:** stays inside Lens, image behind, lazy image `loading=lazy decoding=async`, `displayRating` fallback, PENDING amber handling already shipped (`56c164d`).
- **Gaps vs spec 4 & 9:**
  - Sheet at `peek 22%` hides most results — user must discover pull. Google Lens shows ~35-40% peek. 22% feels like empty black.
  - Result section is **visually disconnected** from image — black canvas vs white sheet, no shared context line ("This is the image I searched...").
  - Candidates look like **database cards** (border + rounded-xl + surface + match badge + 3 lines metadata) — not shopping-first. Source shown but store info minimal.
  - No content-driven sizing — sheet has fixed heights, not `auto` based on result count.

### B2. Other candidate presenter — `ProductCandidates.tsx`

- Used only inside `LensLauncher:product` for `urlResult.alternates` (when `product` from link has alternates). Renders `space-y-2.5 → motion.article bg-white p-3 border-line` per candidate, first has `Meilleure correspondance` label, `h-[92px] w-[74px]` image, two buttons per row. This is **duplicate presentation** of the same concept (candidate) with different card chrome. Should be consolidated to one authoritative candidate component.

---

## C — PRODUCT PAGE — AUDIT (THE MAIN PROBLEM)

### C1. Two product owners — duplicate architecture

| Owner | File | When shown | Structure | State |
|---|---|---|---|---|
| **Lens product** | `LensLauncher.tsx: product stage` → `ProductResult.tsx` inside bottom sheet + dimmed preview behind | After `handleChooseCandidate` inside Lens (stays in Lens) | `relative h-[calc(100vh-56px)] flex-col overflow-hidden bg-white → flex-1 bg-black (preview dim) → absolute bottom-0 max-h-[96%] rounded-t-[20px] bg-white` → sheet contains `ProductResult` + `Calculer un autre produit` + `Retour aux autres résultats` + `ProductCandidates` alternates | `product` state in LensLauncher, `verifiedPriceUrl` boolean |
| **Generic product (legacy)** | `App.tsx: app:product` → `ProductDrawer.tsx` (659 lines) | From `ProductDrawer` input (screenshot/link) or `handleToggleProductDrawer` from hero | `fixed inset-0 z-[80] bg-white → section h-[100dvh] flex-col → header border-b bg-surface → flex-1 overflow-y p-5 space-y-5 → footer border-t bg-white` | `extractedProduct` state in App, `step = 'input'|'details'` via `product:*` navigation layer |

These are **competing implementations of "product"** — violates CLEAN 3. The spec says **DO NOT create a second Lens page**, but `ProductDrawer` is effectively a second product flow that predates Lens and was kept for screenshot/link via `POST /api/extract-image` / `/api/scrape` (distinct from AYROVIX Lens `POST /api/ayrovix/analyze-image`). It should be **consolidated or retired** — not patched alongside.

### C2. Product first viewport — `ProductResult.tsx` fails spec 5

Measured structure (from code):

```
<div class="space-y-4">                                    // outer
  <div class="ayrovix-product-gallery overflow-hidden bg-white">  // outermost card
    <div class="ayrovix-product-gallery-stage bg-surface">      // second card/stage
      <img class="ayrovix-product-gallery-image" /> + 2 badges absolute
    </div>
    {imageUrls.length>1 && <div class="ayrovix-thumbnail-strip flex gap-2 overflow-x-auto border-t border-line bg-white px-4 py-3"> ... </div>}  // third container
    <div class="space-y-3 p-4">                                  // fourth container inside gallery
      <div> <h3 title 15px> + <p brand/model 12px> + <div rating + Page du marchand> </div>
      <div class="rounded-2xl bg-surface p-3.5 ayrovix-glass price-morph">  // price card
        <p> Prix final tout inclus (10px) </p>
        <p> 28px price-pulse </p>
        <p> 12px Prix boutique </p>
      </div>
      {priceVerified ? <p rounded-xl border> Prix confirmé </p> : <div rounded-xl border> estimate + verificationReason </div>}
      {description && <p text-xs> ... </p>}
    </div>
  </div>
  <div class="bg-white p-4">  // Details card
    <h4 Détails de votre demande + <p>
    <label Lien exact + input 46px >
    <div Quantité >
    <details Taille, couleur et commentaire (border bg-surface)> // nested
  </div>
  <div class="sticky bottom-3 space-y-2">  // CTA bar
    <div flex gap-2.5>
      {sourceUrl && <a Voir chez le marchand>}
      <button Commander · 20% >
    <p Acompte 20% >
```

Problems vs spec 5 required `| Product Image | Product Information |`:

- **Empty space above product:** In Lens product stage, the `flex-1 bg-black` preview sits **above** the sheet, pushing ProductResult below the fold. The first viewport is 40% black image + dim gradient, not product. On desktop, this wastes the large viewport.
- **Too many rectangles:** 4 nested containers before price is visible. `ayrovix-product-gallery` + `ayrovix-product-gallery-stage` + `ayrovix-thumbnail-strip` + `space-y-3 p-4` + `rounded-2xl bg-surface` — spec 6 explicitly forbids `Card → Card → Card → text`.
- **Borders everywhere:** `border-line` on gallery, strip, price card, verification, details — heavy prototype look.
- **Price not immediate:** User scrolls past image stage + thumbnails to reach `28px` price. Spec requires PRICE in first viewport immediately.
- **Thumbnail strip** is `overflow-x-auto` but images are cropped preview derivatives? Code preloads `imageUrls` originals, but `ayrovix-product-gallery-stage` height is uncontrolled — stretched/distorted risk on narrow desktop if `ayrovix-product-gallery-image` has fixed height.

### C3. Spacing audit

- `LensLauncher` product sheet `max-h-[96%]` with `overflow-y-auto` but header `LensContextHeader` not shown in that stage — so empty `left-3 top-3` back button floats alone.
- `ProductResult` `space-y-4` between gallery and details, then `sticky bottom-3` CTA — on mobile CTA may be hidden behind `BottomNavBar` (not tested, but `ay-safe-bottom` only on LensLauncher main, not inside sheet).
- `ProductDrawer` `p-5 sm:p-6 space-y-5` plus `hostinger-purple-card min-h-[190px] rounded-3xl p-6` — large radius 24px but no design token match.

### C4. Typography & clipping — spec 7

- `ProductResult` title `text-[15px] font-extrabold leading-snug` — but no `break-words` / `whitespace-normal` on that line (candidates have `break-words`, product title does not). Long SHEIN titles will overflow or clip on mobile.
- `LensLauncher` sheet header `max-w-[22ch] truncate` — truncates query, hides intent.
- `ProductResult` brand/model line `text-xs font-semibold text-muted` — no wrap safeguard if brand+model+color long.
- `ProductCandidates` `line-clamp-2 break-words text-[13px]` is correct, but `truncate text-[11px]` source with `candidate.colors.join(' / ')` appended will truncate color list instead of wrapping.
- `InteractiveLensResults` candidate `line-clamp-2 break-words 12px` good, but `whiteSpace: normal` + `break-words` on price original line already fixed in `56c164d` — good.
- Badges `absolute left-3 top-3` and `right-3 top-3 max-w-[45%] truncate` — on narrow mobile they will overlap central image or each other if source long (e.g., `Amazon Marketplace`).

---

## D — RESPONSIVE LAYOUT — CURRENT

| Breakpoint | Lens (InteractiveLensResults) | Product (ProductResult) |
|---|---|---|
| **Mobile** | `grid-cols-2 gap-3` (2-col) — image `aspect-square`, sheet `peek 22%` — controls `grid h-8 w-8` reachable, touch `pan-y` — OK but `peek` too small. | `space-y-4` single column — image stage `bg-surface`, thumbnails `flex gap-2 overflow-x-auto px-4 py-3` — horizontal scroll OK but no priority; price `28px` centered. |
| **Tablet** | Same 2-col — no `md:grid-cols-3` adaptation, just scales. `sheet` 22%/45%/100% same. | Same single column — no tablet-specific 2-col. `ayrovix-product-gallery` still stacked. |
| **Desktop** | 2-col grid still, not `3-col` or `4-col`; sheet is absolute bottom, not side. Large viewport (>1280) has empty black sides, shell does not use horizontal product presentation (`\| Image \| Info`). | Single column, `max-w-md` constrained via `LensLauncher` `mx-auto max-w-md space-y-4` for preview, but product sheet is `max-h-[96%]` full-width bottom — desktop shows huge black image area above, not product-first. No `lg:flex-row` where image and info side-by-side. |
| **Narrow desktop 900-1024** | `pl-14` on sheet header pushes title right, may clip. | Price row `flex gap-2.5` with `Voir chez le marchand` + `Commander` may wrap incorrectly if text long (Arabic). |

Root cause of fixed rectangles: `h-[100dvh]`, `h-[calc(100vh-56px)]`, `min-h-[190px]`, `h-[92px] w-[74px]` etc. — hardcoded heights, not content-driven. Spec 8 forbids `fixed heights`, `absolute positioning for primary content`.

---

## E — DUPLICATE / LEGACY CODE TO CLEAN FIRST (NO ACCUMULATION)

| Exists | File | Lines | Reason to clean/consolidate |
|---|---|---|---|
| **Duplicate product flow** | `ProductDrawer.tsx` (659) vs `LensLauncher product + ProductResult` (283) | 659/283 | Both handle image/link → product → order. `ProductDrawer` uses old `POST /api/extract-image` & `/api/scrape` endpoints, not Lens `POST /api/ayrovix/analyze-*`. Keep Lens as authoritative; retire or hide `ProductDrawer` behind feature flag, or refactor it to reuse `ProductResult` (single product component). |
| **Duplicate candidate list** | `ProductCandidates.tsx` (67) vs `InteractiveLensResults.tsx` grid (grid-cols-2) | 67/496 | Same data `AyrovixCandidate`. `ProductCandidates` used only for `urlResult.alternates` inside product sheet. Should reuse the same grid component or render alternates via the same `InteractiveLensResults` path. |
| **Duplicate capture** | `LensCamera.tsx` (48) + `LensUpload.tsx` (43) + `LiveCamera.tsx` (353) | 48+43+353 | Three ways to get an image. `LiveCamera` already handles photo/qr/barcode/link; `LensCamera`/`LensUpload` are thin wrappers for `home` stage. Keep `LiveCamera` as capture owner, reuse its callbacks. |
| **Duplicate navigation wrappers** | `LensNavigation.tsx` (166) `LensContextHeader`/`LensMoreMenu` vs `App.tsx` `Navbar` vs `BottomNavBar` | 166 | Lens header is custom, but `LensMoreMenu` duplicates `MenuDrawer` logic for history/dark mode. Consolidate if needed, but keep as is for now — not critical. |
| **Duplicate analyzing state** | `LensLauncher:stage 'analyzing'` vs `stage 'candidates' + isAnalyzing` | — | Two branches render same `InteractiveLensResults` with `isLoading` prop differing only. Merge to single `candidates` branch. |
| **Obsolete CSS** | `hostinger-purple-card` (in `ProductDrawer`) — `min-h-[190px] rounded-3xl` purple | — | Violates Zalando orange budget (≤3%) + monochrome canvas rule (`zalando-ui.css`). Remove or tokenize. |
| **Unused wrappers** | `ayrovix-product-gallery`, `ayrovix-product-gallery-stage`, `ayrovix-thumbnail-strip`, `ayrovix-glass price-morph`, `price-pulse` | — | Each adds border/radius/shadow for separation only. Remove where not functional. |

---

## F — ROOT CAUSES (WHY IT LOOKS LIKE PROTOTYPE)

1. **Product not product-first because Lens image stays behind sheet** — `LensLauncher product` was built to "reuse Lens canvas" but the spec now says **product itself must become visual priority in first viewport**. Keeping the black Lens image behind product wastes 30-40% of viewport and forces the user to scroll the sheet to see price.
2. **Card-on-card because each dev added a container for "visual separation"** — typical accumulation: `bg-white` + `rounded-2xl` + `border-line` + `shadow` repeated per section, no hierarchy via spacing/typography.
3. **No desktop horizontal layout because `ProductResult` is a single-column `space-y-4` stack** — never switched to `lg:grid lg:grid-cols-2` or similar. `ayrovix-product-gallery-stage` is `bg-surface` with no `aspect-ratio` control, so image is cropped by container not by content.
4. **Text clipping because `truncate` used as layout fix** — instead of `flex-wrap`, `min-w-0`, `break-words`, the code hides overflow. The fix is layout, not `overflow:hidden`.
5. **Duplicate flows because Lens was added alongside the old `ProductDrawer` without retiring the old** — now two product experiences compete.

---

## G — WHAT MUST NOT BE TOUCHED (PER SPEC 13-14)

- **Backend:** `src/ayrovix/routes.ts`, `src/ayrovix/services/*` (ai, visualSearch, search, pricing, candidatePolicy), `src/services/imageValidation.ts`, `src/services/pricing.ts` — already optimized, 730/730. Only `roi` param already shipped; no new search provider.
- **Pricing engine:** `calculatePrice` / `estimateTnd` — local, <5ms, no network.
- **Auth / order backend:** `customer/auth`, `cart`, `checkout`.
- **Lens state model:** `NavigationHistory` stack — keep, just preserve `candidatesView` + `previewUrl` across product open/close (already preserved via `lensSessionActive`).
- **Zoom/pan:** `InteractiveLensResults` scale/offset — reuse as-is.
- **Visual identity:** tokens.css Inter+Noto, stars #FFC107, Hero +20%, orange single CTA — keep.

---

## H — IMPLEMENTATION PLAN — CLEAN ENGINEERING (NO PATCHING)

> **Order:** AUDIT (this doc) → PLAN → CONSOLIDATE → IMPLEMENT → TEST → VERIFY → CLEAN.
> Each phase pushes separately, `730/730` + `vite build` before push, no unrelated modules.

### Phase 0 — Consolidate & Remove Accumulation (before any new UI)

**Goal:** ONE responsibility → ONE implementation (rule 3).

- [ ] **0.1** Merge `stage 'analyzing'` into `stage 'candidates'` (single `InteractiveLensResults` render with `isLoading`). File: `LensLauncher.tsx` ~730.
- [ ] **0.2** Deprecate `ProductDrawer` dual: keep it for non-Lens entry (`App.tsx: app:product` from hero) but make it **reuse** `ProductResult` for details (remove its duplicate pricing form). Or hide `ProductDrawer` screenshot/link cards and route those links through `LensLauncher`'s existing `runUrlAnalysis` (already handles url/qr/text). Document if kept.
- [ ] **0.3** Consolidate `ProductCandidates` into `InteractiveLensResults` grid helper — or make `ProductCandidates` the single candidate grid and use it in both places. Decide owner: `ayrovix/components/CandidateGrid.tsx` (authoritative) that takes `list` + `onChoose`.
- [ ] **Verification:** `grep -r ProductDrawer` shows only kept usage, no duplicate pricing logic, `npm test 730/730`.

### Phase 1 — Fix Lens Flow: Stay Inside Lens + Image Stays (spec 1-4, 11, 17 Lens)

**Goal:** Upload → image inside Lens → search → results inside same Lens → open product → product detail → back → Lens + results intact.

Current is already close; fix remaining:

- [ ] **1.1** Ensure `previewUrl` + `candidatesView` persist across `product` → `candidates` back. Already via `setProduct`/`setCandidatesView` not cleared on `enterStage('product')`. Add explicit `useEffect` guard: `enterStage('product')` must NOT `clearRuntime`. Already true — verify and add comment + test `lens.test.ts` "Lens preserves image after product open and back".
- [ ] **1.2** Increase `InteractiveLensResults` peek from `22%` to `38%` on mobile, `45%` stays half, `100%` full — so results are immediately visible without pull. File: `InteractiveLensResults.tsx` `sheetHeight`.
- [ ] **1.3** Add context line in sheet header: `"{name} • {visible.length} résultats — votre image ci-dessus"` (prove connection). Not a card, just `text-[11px] text-muted`.
- [ ] **1.4** Keep `LensLauncher` mounted when `ProductResult` is opened (already via `lensSessionActive`). Add `App.tsx` guard: navigating to `app:cart` from Lens product must NOT call `clearRuntime`. Already `handleAyrovixOrder → onOrder → openAppView('app:cart')` but `lensSessionActive` stays true — verify.
- [ ] **Verification:** Manual flow: upload → preview → analyze → candidates visible with image behind → tap results → product sheet inside same `fixed inset-0` → Back → candidates restored → image same object URL.

### Phase 2 — Product Page: Remove Card-on-Card + Make Product First (spec 5-6, 10, 17 Product)

**Goal:** First viewport immediately: PRODUCT / PRICE / KEY INFO / PRIMARY ACTION, no wasted vertical space, no `Card → Card → Card`.

- [ ] **2.1** Refactor `ProductResult.tsx` flat hierarchy (no `ayrovix-product-gallery` wrapper):
  ```
  <article class="flow-product">   // no extra card, just spacing
    <div class="flow-product-media"> // single image area, aspect-[4/3] or 1/1, no border
      <img /> + 2 badges (availability, source) as subtle pills, not cards
      <div class="thumbnails flex gap-2 overflow-x-auto">  // only if >1, no border-t
    </div>
    <div class="flow-product-info space-y-3"> // typography hierarchy only, no rounded-2xl card
      <h1>title w/ break-words whitespace-normal</h1>
      <p>brand/model</p>
      <div>rating + Page du marchand link</div>
      <div> // price block: single separator (h-px bg-line), not rounded card
        <p>Prix final tout inclus 10px uppercase</p>
        <p>28px price + 12px boutique</p>
        <p>verification pill (subtle, not card)</p>
      </div>
      {description && <p text-xs leading-relaxed>}
    </div>
    <div class="flow-product-actions"> // details + CTA, but not card-on-card
  ```
- [ ] **2.2** Remove containers without function: `rounded-2xl bg-surface p-3.5 ayrovix-glass price-morph`, `rounded-xl border` verification card → replace with `border-l-2 border-ink pl-3 py-2 bg-surface/50` or `text-[11px] text-muted with icon`, keep only one `border` where needed.
- [ ] **2.3** In `LensLauncher` product stage, change layout from `fixed image behind + bottom sheet product` to **Lens product sheet is the viewport** (image is first element of ProductResult, not background). If keeping Lens context, use `flex-col h-[100dvh] → header (back) + scrollable ProductResult` without the dimmed `flex-1 bg-black preview` behind. The preview remains accessible via a small "Revoir l'image" link, not as background.
- [ ] **2.4** For desktop (>1024), switch to horizontal spec 5: `lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:gap-8 lg:items-start` — left: media, right: info + actions. File: `ProductResult.tsx` root. No fixed heights, content-driven sizing, images `object-contain`, `aspect-[4/3]` controlled, thumbnails `w-[72px] aspect-square`.
- [ ] **Verification:** Lighthouse viewport check — product title + 28px price + primary action visible without scroll on `1280×800`, no horizontal overflow, no `overflow:hidden` masking.

### Phase 3 — Responsive & Typography Fix (spec 7-8, 10)

- [ ] **3.1** Typography audit: ensure `product.title` has `break-words whitespace-normal text-balance` and `leading-tight`, source `truncate` → `break-words`, rating row `flex-wrap gap-x-3 gap-y-1`, CTA `min-h-[52px]` text wrap `text-wrap`.
- [ ] **3.2** Replace `max-w-[45%] truncate` badges with `max-w-[55%] break-words line-clamp-1` and `max-w-[78px] truncate` fallback with `max-w-[120px] break-words`.
- [ ] **3.3** Remove `h-[92px] w-[74px]` fixed candidate image, use `aspect-square w-full` + `object-contain`, responsive `grid-cols-2 gap-3` on mobile, `md:grid-cols-3` on tablet, `lg:grid-cols-2 xl:grid-cols-3` inside sheet — or keep 2-col on Lens sheet but ensure price row wraps (`flex-wrap`).
- [ ] **3.4** Use CSS Grid/Flex, not absolute for primary content: badges stay absolute but `inset-2` with safe padding, not overlapping central image. Remove `absolute left-2 right-2 top-12` pointer-events trick where possible, use flex header.
- [ ] **3.5** Tablet: test at 768, 820, 1024 — ensure no scaling of desktop, just sensible `gap-4` → `gap-6`.

### Phase 4 — Lens Result Presentation (spec 9-10) + CLEAN PASS

- [ ] **4.1** Product image priority: candidate `aspect-square` clean, no huge padding, `p-1.5` inside media → reduce to `p-0` with image `object-contain`, border only `border border-line/60`.
- [ ] **4.2** Remove unnecessary metadata: keep `title`, `priceTnd`, `source`, `rating` — hide `colors/sizes` list unless `c.colors.length` and screen > `sm` (already `10px` but can be `hidden sm:block`).
- [ ] **4.3** Clean pass (rule 14): run `npm run verify` / `730 tests`, grep dead: `unused imports`, `console.log` besides LensTrace, `hostinger-purple-card` if deprecated, duplicate `CandidateImage` (keep one authoritative in `CandidateGrid.tsx`).

---

## I — ACCEPTANCE CHECKLIST — WILL BE VERIFIED BEFORE DONE

Lens
- [ ] Upload does not navigate away — stays `fixed inset-0 z-[75]` with `NavigationHistory` stack.
- [ ] Uploaded image remains visible (peek 38% + image canvas).
- [ ] Zoom/pinch/reset work (scale 1→3, offset, isPanning).
- [ ] Search inside Lens (analyzing is sheet skeleton, not separate page).
- [ ] Results inside same Lens (InteractiveLensResults sheet).
- [ ] Browse without losing image (candidatesView + previewUrl preserved).

Product
- [ ] Product occupies first viewport (title + 28px price + availability + source + primary action visible at 1280×800 without scroll past empty black).
- [ ] No wasted space above (no `flex-1 bg-black preview` behind product; product media is first element).
- [ ] Image priority (large clean area, `aspect-[4/3]` left, info right on desktop).
- [ ] No nested cards (single flow-product, separators via `h-px`/`border-l`, not `rounded-2xl` cards).
- [ ] No clipped/overlapping text (break-words, flex-wrap, no truncate hiding price).
- [ ] No horizontal overflow (test 320, 768, 1024, 1280).
- [ ] Responsive correct (mobile image priority, tablet sensible, desktop horizontal).

Navigation
- [ ] Open product does not destroy Lens context (`lensSessionActive` keeps mounted, `candidatesView` kept).
- [ ] Back restores Lens + image + results (popstate restores stack).
- [ ] No re-upload needed.

Code quality
- [ ] No duplicate Lens implementation (analyzing merged, CandidateGrid single owner).
- [ ] No duplicate results page (no `/visual-search`).
- [ ] No unnecessary new components (refactor existing).
- [ ] Existing functionality preserved (manual 20-flow test: upload, preview, zoom, reset, analyze, tap ROI, choose candidate, order, cart, back, history, barcode, text, url).
- [ ] Legacy cleaned where safe (`ProductDrawer` consolidated, `hostinger-purple-card` removed if unused).
- [ ] No unrelated modules modified (only `client/src/ayrovix/*`, `client/src/components/ProductDrawer` if needed, `client/src/styles/*` for tokens, `client/src/App.tsx` for lens mount guard).

---

## J — RISKS & MITIGATIONS (PER CLEAN 9)

| Risk | Mitigation |
|---|---|
| Removing ProductDrawer breaks `/api/extract-image` flow for non-Lens users | Keep component but make its `details` render reuse `ProductResult` (single source). Gate screenshot/link entry via Lens if possible, but keep route for backward compat. |
| Desktop horizontal layout breaks on narrow 900px | Use `minmax(0,1fr)` + `min-w-0` + `flex-wrap`, test at 900, 1000, 1024. No `fixed widths` for info column. |
| Image behind product removal loses "Revoir l'image" | Add explicit `Revoir l'image` link in product sheet that scrolls to top or shows small `w-[88px] aspect-square` preview inline. |
| `priceVerificationStatus PENDING` amber UI must remain | Keep `priceLine` logic and `bg-amber-50 border-amber-200` for PENDING, but reduce card chrome (use `border-l-2 border-amber-500 pl-3`). |

---

## K — NEXT STEP — APPROVAL

**Do NOT start coding until you confirm:**

1. Audit above matches your observation of duplicate product flows and card overload.
2. Plan to **refactor existing LensLauncher/ProductResult** (not new Lens) is correct.
3. `ProductDrawer` should be **consolidated, not duplicated**.

Reply **`APPROVÉ — START PHASE 0`** and I will implement **Phase 0 → 1 → 2 → 3 → 4** sequentially, pushing after each phase with `730/730` + `vite build` verification and cleaning after each.

*Audit done with no business logic change. Backend not touched. Visual identity (Inter+Noto, #FFC107, pl-14, Auto → AYROVIX) preserved.*

