# ZAYROVI mobile visual refinement

## Pre-implementation audit

The supplied Zalando app/web references use two distinct compositions: editorial/event pages with high-impact imagery and strong whitespace, and dense product results with repeatable portrait frames and a clear price stack. Bring over the hierarchy, not the layouts, palette, lettering or icon artwork. In ZAYROVI, yellow remains the purchase/AYWEBs signal; reactions, photography overlays and the Clean mark keep their existing semantic colors.

- Existing infrastructure: `theme`, `rhythm`, `AppScreen`, `SubScreen`, `AppSheet`, shared input/button and async states. The design already has enough color roles; use the existing canvas, surface, line, ink and muted roles rather than introduce a second palette.
- Duplication: orders recreates the stacked header and safe area; editorial headings and rails use local spacing; grid and placeholder geometry are already shared, but present metadata ahead of price. Preserve the grid's measured portrait ratio, swipe/arrival photo, density toggle and aligned rows.
- Density: heavy outlines around secondary content compete with photography. Retain borders that identify controls and the separators needed in forms, sticky bars and dense lists. Selection needs a shape cue in the icon-only tab bar, not another brand color.
- Special contracts: Home full-bleed Hero, approved Publication layouts, immersive Stories/Reels and reaction/follow placement, Lens camera/white sheet, and AYWEBs yellow chrome, verified capture, whole-photo B sheet and checkout reservations are not generic page cards. Preserve these contracts. Use logical alignment for Arabic and explicit limits only in measured components.

### Route inventory (Expo entry points)

- **Router / delegate:** `(tabs)/_layout.tsx`, `(tabs)/social.tsx`, `_layout.tsx`, `panier.tsx`, `reels.tsx`, `z-lens.tsx`.
- **Shared screen:** `(tabs)/account.tsx`, `(tabs)/aywebs.tsx`, `(tabs)/index.tsx`, `+not-found.tsx`, `account/about.tsx`, `account/addresses.tsx`, `account/favorites.tsx`, `account/notifications.tsx`, `account/preferences.tsx`, `account/profile.tsx`, `account/security.tsx`, `aywebs/request.tsx`, `aywebs/store-request.tsx`, `aywebs/stores.tsx`, `catalog.tsx`, `checkout.tsx`, `lens.tsx`, `news/[id].tsx`, `news.tsx`, `product/[id].tsx`, `promotions.tsx`, `stories.tsx`.
- **Specialized surface:** `(tabs)/cart.tsx`, `(tabs)/lens.tsx`, `(tabs)/sonim.tsx`, `aywebs/browser.tsx`, `aywebs/cart.tsx`, `forgot.tsx`, `legal/privacy.tsx`, `legal/terms.tsx`, `orders/[id].tsx`, `orders.tsx`, `publications.tsx`, `reels-viewer.tsx`, `sign-in.tsx`, `sonim-assistant.tsx`.

## Implementation choices

- Stacked pages share the same insets, heading role, wrapping subtitle and back target. Order history now uses that shell without putting its virtualized list inside a scroll view. Checkout choices and the existing cart summary keep their hierarchy when a label wraps.
- Product grids keep the measured two-column and large-photo modes. Current price comes before reference price or stock. Photo pager, placeholder heights, badges, and quick add remain available. `FullBleed` is owned by a wrapper rather than passed to `FlatList`, whose web implementation applied the negative margin twice. The quick-add glyph stays compact; the target is 44 dp.
- On phones the product detail uses a vertical reading order. The sticky buy action has a width cap and the light photo stage has readable controls in dark mode. Social editorial product rails reuse the portrait ratio, studio background and favorite disc without changing the immersive Reel cards.
- Home category navigation now uses a single hairline. The icon-only main navigation gains a small selected mark, not a new glyph or color. Empty/loading surfaces rely on the existing theme surface; warning states keep their semantic border. Field labels name their controls by default. Search and sign-in fields can shrink in narrow RTL rows.
- No new palette, no merchant/checkout rules, no changes to pricing data, the signed AYWEBs selection or scroll-independent product capture, and no changes to Reel reactions/follow.

## Verification scope

Visual review used Expo Web in Chromium at 320×620 (Arabic, dark), 360×800 (French, light), and 390×844 (French, dark). Home, catalog, product, signed-out checkout/sign-in, orders, Social, AYWEBs, lens entry, promotions and publications were sampled, depending on viewport. Catalog and product used local review fixtures injected into the browser only; network-dependent routes without fixtures showed the actual fallback/guest state. This is not verification of a signed-in order, a merchant transaction, a physical keyboard or safe areas on an installed Android/iOS build. Native QA should cover those, device font scaling, and the immersive camera/Reel/merchant surfaces.
