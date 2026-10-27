# AYWEBs interface update — implementation record

**Status:** user approved the visual direction and implementation. The interface changes are implemented on the current branch, including the campaign artwork updated from the original image supplied by the user; no commit was created.

## Approved visual references

- `design/aywebs-home-footer-v2.png` — home with large store cards, neutral category circles, pale-yellow “Reprendre la navigation”, and campaign footer without store badges.
- `design/aywebs-store-browser-cart-concept.png` — merchant browser with the yellow **Add to Cart** action retained, lower toolbar/review-request block removed, and top-right X replaced by a cart icon.
- `design/aywebs-product-add-sheet-concept.png` — product option sheet.
- `design/aywebs-cart-concept.png` — cart with unconfirmed prices clearly marked rather than invented.

Brand colors remain sourced from the existing design system. Violet is used for AYWEBs branding; commerce yellow remains limited to purchase actions; category rings are neutral and the resume card is pale yellow.

## What was implemented

### AYWEBs home

- Replaced the tab’s direct full-store listing with a dedicated discovery home in `apps/mobile/src/features/aywebs/AyWebsHomeContent.tsx`; the detailed `/aywebs/stores` screen still uses the existing shared `StoresContent`.
- Added a violet search field, category shortcuts, a resume card, horizontally browsable large store cards, and the footer campaign artwork.
- Store names, logos, descriptions, and categories continue to come from the store catalog. Saved stores are shown when available; otherwise the section uses actual popular/catalog stores. Category tiles map known catalog labels to generated generic category art and fall back to a neutral icon for unknown categories.
- Added six optimized category thumbnails under `apps/mobile/assets/aywebs/`.
- Added the user-supplied original campaign artwork at `apps/mobile/assets/aywebs/promo-footer.png` at the end of the scrollable home content above the existing tab bar. The original 1254×1254 framing and composition are retained; only the two App Store / Google Play badges are removed, with the obscured plain ivory panel reconstructed locally. The image is shown at square aspect ratio without cropping.
- Configured the shared header for the AYWEBs tab in `apps/mobile/src/features/shell/AppHeader.tsx`: AYWEBs violet wordmark, cart icon, preserved menu, and no notifications icon on this tab.

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
- After replacing the campaign artwork with the user-supplied square PNG and changing the image reference/aspect ratio: `npm run typecheck`, the focused AYWEBs home UI test (2/2), and `npm run copy:check` passed. The full suites above were run before this image-only update.

UI tests emit existing React `act(...)` warnings from asynchronous providers/icons in the test environment, but the suite exits successfully.
