# AYWEBs interface update — implementation record

**Status:** the initial AYWEBs interface update was pushed in commit `4e28cbe`. The follow-up request is implemented locally: the supplied AYWEBs wordmark replaces the header text, its neighboring menu icon is hidden only in AYWEBs, store cards are more compact with a full-width logo frame, and the campaign footer is removed from the home screen. Follow-up typecheck and targeted validation passed.

## Approved visual references

- `design/aywebs-home-footer-v2.png` — earlier home reference with neutral category circles and pale-yellow “Reprendre la navigation”; its campaign footer was later removed at the user's request.
- `design/aywebs-store-browser-cart-concept.png` — merchant browser with the yellow **Add to Cart** action retained, lower toolbar/review-request block removed, and top-right X replaced by a cart icon.
- `design/aywebs-product-add-sheet-concept.png` — product option sheet.
- `design/aywebs-cart-concept.png` — cart with unconfirmed prices clearly marked rather than invented.

Brand colors remain sourced from the existing design system. Violet is used for AYWEBs branding; commerce yellow remains limited to purchase actions; category rings are neutral and the resume card is pale yellow.

## What was implemented

### AYWEBs home

- Replaced the tab’s direct full-store listing with a dedicated discovery home in `apps/mobile/src/features/aywebs/AyWebsHomeContent.tsx`; the detailed `/aywebs/stores` screen still uses the existing shared `StoresContent`.
- Added a violet search field, category shortcuts, a resume card, and horizontally browsable store cards. The later follow-up compacts these cards and expands the store logo frame across the card's full media area; the campaign footer has been removed from the screen at the user's request.
- Store names, logos, descriptions, and categories continue to come from the store catalog. Saved stores are shown when available; otherwise the section uses actual popular/catalog stores. Category tiles map known catalog labels to generated generic category art and fall back to a neutral icon for unknown categories.
- Added six optimized category thumbnails under `apps/mobile/assets/aywebs/`.
- The campaign footer and its bundled image asset were subsequently removed from the AYWEBs home screen at the user's request.
- Configured the shared header for AYWEBs in `apps/mobile/src/features/shell/AppHeader.tsx`: it uses the supplied transparent wordmark (`apps/mobile/assets/aywebs/aywebs-wordmark.png`), omits the adjacent hamburger and notifications icons on this tab, and keeps the cart action. Other app headers retain their menu behavior.

### “Reprendre la navigation”

- Added local-only storage in `apps/mobile/src/features/aywebs/lastVisitedStore.ts`.
- Opening a store records its actual URL locally; WebView navigation updates that record. The resume card reopens the last valid HTTP(S) page. Invalid stored data is discarded, and storage failures never block browsing or purchasing.

### Merchant browser

- Updated `apps/mobile/app/aywebs/browser.tsx`: the top-right X is now an accessible cart icon that opens the existing `StoreCartSheet`; the yellow **Add to Cart** button remains fixed at the bottom.
- Removed the lower back/forward/cart/favorites toolbar and the “Demander cet achat (revue humaine)” CTA from this screen, as requested. The request route/backend were not deleted.
- Added Android hardware-back handling so WebView history remains navigable after removing the visible back/forward controls; the app’s header back still exits the merchant page.

### Product sheet and cart

- Updated `AddToCartSheet.tsx` to use a large product image above the title/options, matching the approved sheet mockup. The displayed image still follows the selected variant’s real image, with the existing fallback behavior.
- Kept existing server-sourced price/availability and cart behavior. The cart page was not rewritten: its totals and checkout gating continue to use existing API data, so no mockup-only amounts or generated catalog images enter live commerce.

## Validation

- `npm run typecheck` — passed.
- `npm test` — **90 test files / 1001 tests passed**.
- `npm run test:ui -- --forceExit` — **23 suites / 139 tests passed**.
- `npm run copy:check` — passed.
- `npm run tokens:build -- --check` — passed.
- After the header/card/footer follow-up: `npm run typecheck` passed; the complete UI suite passed (23 suites / 139 tests); `npm run copy:check` (9/9) and `npm run tokens:build -- --check` passed. The full Vitest suite above was run before this follow-up.

UI tests emit existing React `act(...)` warnings from asynchronous providers/icons in the test environment, but the suite exits successfully.
